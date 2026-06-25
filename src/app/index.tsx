import { LinearGradient } from 'expo-linear-gradient';
import { Defs, LinearGradient as SvgLinearGradient, Stop, Svg, Text as SvgText } from 'react-native-svg';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { LineChart } from '@/components/line-chart';
import { RouteMap, type Waypoint } from '@/components/route-map';
import { buildAssumptions, buildEventCatalog } from '@/core/data/mappers';
import { SNAPSHOT } from '@/core/data/snapshot';
import {
  DEFAULT_RETIREMENT_AGE,
  DEFAULT_YEARS_TO_SPEND_SAVINGS,
  simulate,
  solvePresentMonthlyHeadroomYen,
} from '@/core/simulation/simulate';
import type { LifeEventDef, PlacedEvent, Scenario, SimulationInput } from '@/core/simulation/types';

const ONBOARD_KEY = 'tsukao:onboarded';
const MAN = 10000;
const yen = (v: number) => `${Math.round(v / MAN).toLocaleString()}万円`;
const monthlyYen = (annual: number) => `${Math.round(annual / 12).toLocaleString()}円`;

type Phase = 'input' | 'calculating' | 'result';
type Housing = '賃貸' | '購入' | '持ち家';

/** 詳細リストにデータ駆動で出すイベント。house/retire/invest=専用UI、illness/care_home=結果画面の"もしも試算" */
const SPECIAL_EVENT_IDS = new Set(['house', 'retire', 'invest', 'illness', 'care_home']);
/** 人数・頭数で掛けるイベント */
const COUNTABLE_EVENT_IDS = new Set(['child', 'pet_dog', 'pet_cat']);
/** ルート図の経由地ピンに使う絵文字（イベントid→emoji） */
const EVENT_EMOJI: Record<string, string> = {
  marriage: '💍', child: '👶', divorce: '💔', parentcare: '🧓', pet_dog: '🐶', pet_cat: '🐱',
  house: '🏠', move: '📦', car: '🚗', second_house: '🏖️', study: '📚', hobby: '🎸',
  insurance: '🛡️', beauty: '💄', overseas: '🌏', illness: '🏥', care_home: '🏥',
};

const manYen = (yen: number) => Math.round(yen / MAN).toLocaleString();

/**
 * イベント費用を「実際のかかり方」の文字列にする（ルート経由地・入力ヒントで共通利用）。
 * - 年別表(scheduleYen)があるもの(子供)は実額の合計「計約◯万（N年）」＝エンジンの計算と一致させる
 * - それ以外の毎年型は「年◯万×N年」、一回スポットは年額を出さず「(一回ラベル)◯万」
 * 年齢の接頭辞は付けない（呼び出し側で「◯歳〜」/「◯歳」を付ける）。
 */
function eventCadenceLabel(
  def: LifeEventDef,
  count: number,
  opts: { annualOverrideYen?: number | null; oneTimeOverrideYen?: number | null; oneTimeLabel?: string } = {},
): string {
  const parts: string[] = [];
  const oneTime = (opts.oneTimeOverrideYen ?? def.oneTimeYen ?? 0) * count;
  if (oneTime > 0) parts.push(`${opts.oneTimeLabel ?? '一回'}${manYen(oneTime)}万`);
  if (def.calcKind !== '一回スポット') {
    if (def.scheduleYen && def.scheduleYen.length > 0) {
      const total = def.scheduleYen.reduce((a, b) => a + b, 0) * count;
      parts.push(`計約${manYen(total)}万（${def.scheduleYen.length}年）`);
    } else {
      const annual = (opts.annualOverrideYen ?? def.annualYen ?? 0) * count;
      if (annual > 0) parts.push(`年${manYen(annual)}万${def.durationYears ? `×${def.durationYears}年` : ''}`);
    }
  }
  return parts.join('＋');
}

/** その年から毎年続く費用があるか（「◯歳〜」表記の判定用） */
function hasRecurringCost(def: LifeEventDef, annualOverrideYen?: number | null): boolean {
  if (def.calcKind === '一回スポット') return false;
  return (def.scheduleYen?.length ?? 0) > 0 || (annualOverrideYen ?? def.annualYen ?? 0) > 0;
}
/** 詳細に並べるオプション（Notion由来の snapshot から自動生成） */
const OPTION_EVENTS = SNAPSHOT.events.filter((e) => !SPECIAL_EVENT_IDS.has(e.id));

type Pick = { on: boolean; startAge: number; count: number; amountMan: number };

const BG_COLORS = ['#FFF4E8', '#FFE9F3', '#EFEBFF'] as const;

function Bg({ children, center }: { children?: React.ReactNode; center?: boolean }) {
  return (
    <LinearGradient colors={BG_COLORS} style={styles.bg}>
      <SafeAreaView style={[styles.safe, center && styles.center]}>{children}</SafeAreaView>
    </LinearGradient>
  );
}

/** 初回だけ出す共感オンボーディング。痛みへの共感 → 約束 → 開始、の順（→ PRODUCT.md） */
function Onboarding({ onStart }: { onStart: () => void }) {
  return (
    <Bg center>
      <View style={styles.onbWrap}>
        <Text style={styles.onbBrand}>ツカオ</Text>
        <Text style={styles.onbTitle}>{'将来のお金が不安で、\n"今" を我慢していませんか？'}</Text>
        <Text style={styles.onbBody}>
          {'足りるか分からないと、つい使えない。\nだからツカオは、あなたの未来を平均の一本線で見える化します。'}
        </Text>
        <Text style={styles.onbBody}>
          {'先が見えると、不安は軽くなる。\n「今、使っていい」が、きっと見えてきます。'}
        </Text>
        <Pressable onPress={onStart} style={styles.onbBtn}>
          <LinearGradient colors={['#7c5cfc', '#ff6fb5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Text style={styles.ctaText}>自分の未来を見てみる →</Text>
          </LinearGradient>
        </Pressable>
        <Text style={styles.onbFoot}>入力は年齢・年収・資産・毎月の支出だけ。数秒で未来が描けます。</Text>
      </View>
    </Bg>
  );
}

export default function Home() {
  const assumptions = useMemo(() => buildAssumptions(SNAPSHOT), []);
  const catalog = useMemo(() => buildEventCatalog(SNAPSHOT), []);

  // 初回オンボーディング。null=読込中 / false=未読(共感画面を出す) / true=既読
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(ONBOARD_KEY)
      .then((v) => setOnboarded(v === '1'))
      .catch(() => setOnboarded(true)); // 読めない時はオンボを出さない（邪魔しない側に倒す）
  }, []);
  const dismissOnboarding = () => {
    setOnboarded(true);
    AsyncStorage.setItem(ONBOARD_KEY, '1').catch(() => {}); // 保存失敗は致命的でないので握りつぶす
  };

  const [phase, setPhase] = useState<Phase>('input');
  const [showDetail, setShowDetail] = useState(false);
  const [reflection, setReflection] = useState<'more' | 'less' | null>(null);

  const [age, setAge] = useState(28);
  const [incomeMan, setIncomeMan] = useState(500);
  const [assetsMan, setAssetsMan] = useState(200);
  const [monthlyExpenseMan, setMonthlyExpenseMan] = useState(22);
  const [retirementAge, setRetirementAge] = useState(DEFAULT_RETIREMENT_AGE);
  const [pensionType, setPensionType] = useState<'国民年金のみ' | '厚生年金'>('厚生年金');
  const [yearsN, setYearsN] = useState(DEFAULT_YEARS_TO_SPEND_SAVINGS);
  const [partTime, setPartTime] = useState(false);
  const [partTimeMan, setPartTimeMan] = useState(100);

  const [invest, setInvest] = useState(false);
  const [monthlyInvestMan, setMonthlyInvestMan] = useState(3);
  const [housing, setHousing] = useState<Housing>('賃貸');
  const [rentMan, setRentMan] = useState(8);
  const [buyAge, setBuyAge] = useState(38);
  // 詳細オプションの選択状態（id → Pick）。OPTION_EVENTS をデータ駆動で扱う
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const pickOf = (id: string): Pick => picks[id] ?? { on: false, startAge: age, count: 1, amountMan: 20 };
  const setPick = (id: string, patch: Partial<Pick>) =>
    setPicks((prev) => ({ ...prev, [id]: { ...pickOf(id), ...patch } }));
  const [illness, setIllness] = useState(false);
  const [illnessAge, setIllnessAge] = useState(60);
  const [careHome, setCareHome] = useState(false);
  const [careHomeAge, setCareHomeAge] = useState(80);

  const sim = useMemo(() => {
    const events: PlacedEvent[] = [];
    if (invest) events.push({ def: catalog.invest, startAge: age, annualInvestmentYen: monthlyInvestMan * 12 * MAN });
    for (const ev of OPTION_EVENTS) {
      const p = picks[ev.id];
      if (!p?.on) continue;
      const def = catalog[ev.id];
      const placed: PlacedEvent = { def, startAge: p.startAge };
      if (def.annualYen == null) placed.annualOverrideYen = p.amountMan * MAN; // 手入力
      if (COUNTABLE_EVENT_IDS.has(ev.id)) placed.count = p.count;
      events.push(placed);
    }
    if (illness) events.push({ def: catalog.illness, startAge: illnessAge });
    if (careHome) events.push({ def: catalog.care_home, startAge: careHomeAge });

    const input: SimulationInput = {
      currentAge: age,
      grossAnnualIncomeYen: incomeMan * MAN,
      currentAssetsYen: assetsMan * MAN,
      monthlySavingsYen: 0,
      retirementAge,
      pensionType,
      yearsToSpendSavings: yearsN,
      consumptionBasis: { kind: 'explicit', annualYen: monthlyExpenseMan * 12 * MAN },
      currentRentYen: rentMan * 12 * MAN,
      retirementPartTimeYen: partTime ? partTimeMan * MAN : 0,
      housingPlan:
        housing === '購入'
          ? {
              kind: '購入',
              buyAge,
              annualCostYen: catalog.house.annualYen ?? 0,
              downPaymentYen: catalog.house.oneTimeYen ?? 0,
              loanDurationYears: catalog.house.durationYears,
            }
          : { kind: housing },
    };
    const scenario: Scenario = { id: 'main', name: '現在地', events };
    const result = simulate(input, scenario, assumptions);
    // SPEC §5.6 "今を楽しむ許可": 今の毎月支出に月いくらまで上乗せできるか
    const presentHeadroomMonthlyYen = solvePresentMonthlyHeadroomYen(input, scenario, assumptions);

    // 人生ルート図の経由地（ライフイベント）。費用は「実際のかかり方」で出す（共通の eventCadenceLabel）。
    const costSub = (ev: PlacedEvent): string => {
      const body = eventCadenceLabel(ev.def, ev.count ?? 1, {
        annualOverrideYen: ev.annualOverrideYen,
        oneTimeOverrideYen: ev.oneTimeOverrideYen,
      });
      const when = hasRecurringCost(ev.def, ev.annualOverrideYen) ? `${ev.startAge}歳〜` : `${ev.startAge}歳`;
      return body ? `${when} ・ ${body}` : `${ev.startAge}歳`;
    };
    const waypoints: Waypoint[] = events
      .filter((ev) => ev.def.id !== 'invest')
      .map((ev) => ({ age: ev.startAge, label: ev.def.name, emoji: EVENT_EMOJI[ev.def.id] ?? '📍', sub: costSub(ev) }));
    if (housing === '購入') {
      const body = eventCadenceLabel(catalog.house, 1, { oneTimeLabel: '頭金' });
      waypoints.push({ age: buyAge, label: '住宅購入', emoji: '🏠', sub: body ? `${buyAge}歳〜 ・ ${body}` : `${buyAge}歳` });
    }
    return { result, presentHeadroomMonthlyYen, waypoints };
  }, [
    age, incomeMan, assetsMan, monthlyExpenseMan, retirementAge, pensionType, yearsN,
    invest, monthlyInvestMan, housing, rentMan, buyAge, picks, partTime, partTimeMan,
    illness, illnessAge, careHome, careHomeAge, assumptions, catalog,
  ]);
  const { result, presentHeadroomMonthlyYen, waypoints } = sim;

  function calculate() {
    setReflection(null);
    setPhase('calculating');
    setTimeout(() => setPhase('result'), 1300);
  }

  // 読込中はちらつき防止で空背景。初回のみ共感オンボーディングを挟む（→ PRODUCT.md「触った瞬間に渡すのは数字でなく共感と約束」）
  if (onboarded === null) return <Bg center />;
  if (onboarded === false) return <Onboarding onStart={dismissOnboarding} />;

  if (phase === 'calculating') {
    return (
      <Bg center>
        <ActivityIndicator size="large" color="#7c5cfc" />
        <Text style={styles.calcText}>あなたの未来を計算しています…</Text>
      </Bg>
    );
  }

  if (phase === 'result') {
    return (
      <ResultView
        result={result}
        presentHeadroomMonthlyYen={presentHeadroomMonthlyYen}
        currentMonthlyExpenseYen={monthlyExpenseMan * MAN}
        currentAge={age}
        goalAge={retirementAge}
        waypoints={waypoints}
        reflection={reflection}
        onReflect={setReflection}
        onBack={() => setPhase('input')}
        illness={illness}
        setIllness={setIllness}
        illnessAge={illnessAge}
        setIllnessAge={setIllnessAge}
        careHome={careHome}
        setCareHome={setCareHome}
        careHomeAge={careHomeAge}
        setCareHomeAge={setCareHomeAge}
      />
    );
  }

  return (
    <Bg>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandWrap}>
          <Text style={styles.tagline}>将来が見えると、今を楽しめる。</Text>
        </View>

        <Text style={styles.section}>📍 あなたの現在地</Text>
        <Stepper label="現在の年齢" value={age} unit="歳" min={18} max={99} onChange={setAge} />
        <Stepper label="年収(額面)" value={incomeMan} unit="万円" step={50} onChange={setIncomeMan} />
        <Stepper label="今の金融資産" value={assetsMan} unit="万円" step={50} onChange={setAssetsMan} />
        <Stepper label="毎月の支出" value={monthlyExpenseMan} unit="万円" onChange={setMonthlyExpenseMan} />

        <Text style={styles.section}>🔮 これからの想定</Text>
        <Stepper label="退職する年齢" value={retirementAge} unit="歳" min={40} max={90} onChange={setRetirementAge} />
        <Stepper label="貯蓄を使う年数(N)" value={yearsN} unit="年" min={1} max={60} onChange={setYearsN} />
        <Segmented label="年金の種類" options={['厚生年金', '国民年金のみ']} value={pensionType} onChange={(v) => setPensionType(v as never)} />
        <Segmented label="退職後にパートで働く" options={['働かない', '働く']} value={partTime ? '働く' : '働かない'} onChange={(v) => setPartTime(v === '働く')} />
        {partTime && <Stepper label="パートの年収" value={partTimeMan} unit="万/年" step={10} onChange={setPartTimeMan} />}

        <Pressable onPress={() => setShowDetail((s) => !s)} style={styles.detailToggle}>
          <Text style={styles.detailToggleText}>{showDetail ? '▼ 詳細・オプションを閉じる' : '✨ 詳細・オプションを開く'}</Text>
        </Pressable>

        {showDetail && (
          <View style={styles.detailBox}>
            <Accordion title="積立投資" summary={invest ? 'する' : 'しない'} active={invest}>
              <Segmented label="積立投資する" options={['しない', 'する']} value={invest ? 'する' : 'しない'} onChange={(v) => setInvest(v === 'する')} />
              {invest && <Stepper label="毎月の積立額" value={monthlyInvestMan} unit="万円" onChange={setMonthlyInvestMan} />}
              {invest && <Text style={styles.minHint}>退職まで毎月コツコツ積み立て、実質利回り約2.5%で複利運用する想定です。</Text>}
            </Accordion>

            <Accordion title="住まい" summary={housing} active={housing !== '賃貸'}>
              <Segmented label="住まい" options={['賃貸', '購入', '持ち家']} value={housing} onChange={(v) => setHousing(v as Housing)} />
              {housing !== '持ち家' && <Stepper label="今の家賃" value={rentMan} unit="万/月" onChange={setRentMan} />}
              {housing === '購入' && <Stepper label="購入する年齢" value={buyAge} unit="歳" min={18} max={99} onChange={setBuyAge} />}
            </Accordion>

            {OPTION_EVENTS.map((ev) => {
              const p = pickOf(ev.id);
              // 入力した瞬間の費用ヒント（ルートと同じ共通フォーマッタ＝表示を一致させる）
              const costHint = p.on ? eventCadenceLabel(catalog[ev.id], COUNTABLE_EVENT_IDS.has(ev.id) ? p.count : 1) : '';
              return (
                <Accordion
                  key={ev.id}
                  title={ev.name}
                  summary={p.on ? 'あり' : 'なし'}
                  active={p.on}
                  info={ev.note ? (ev.source ? `${ev.note}\n出所: ${ev.source}` : ev.note) : undefined}
                >
                  <Segmented label="つける" options={['なし', 'あり']} value={p.on ? 'あり' : 'なし'} onChange={(v) => setPick(ev.id, { on: v === 'あり' })} />
                  {p.on && <Stepper label={ev.calcKind === '一回スポット' ? 'その年齢' : '開始年齢'} value={p.startAge} unit="歳" min={18} max={99} onChange={(n) => setPick(ev.id, { startAge: n })} />}
                  {p.on && costHint ? <Text style={styles.minHint}>{costHint}</Text> : null}
                  {p.on && ev.annualMan == null && ev.calcKind !== '一回スポット' && <Stepper label="年額" value={p.amountMan} unit="万/年" step={5} onChange={(n) => setPick(ev.id, { amountMan: n })} />}
                  {p.on && COUNTABLE_EVENT_IDS.has(ev.id) && <Stepper label="人数・頭数" value={p.count} unit="" min={1} onChange={(n) => setPick(ev.id, { count: n })} />}
                </Accordion>
              );
            })}
          </View>
        )}

        <Pressable onPress={calculate}>
          <LinearGradient colors={['#7c5cfc', '#ff6fb5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
            <Text style={styles.ctaText}>未来を見てみる ✨</Text>
          </LinearGradient>
        </Pressable>
        <Text style={styles.disclaimer}>
          ※すべて今の円の価値(物価無視)。平均値による1本の見通しで、確定した予測ではありません。
        </Text>
      </ScrollView>
    </Bg>
  );
}

function ResultView({
  result,
  presentHeadroomMonthlyYen,
  currentMonthlyExpenseYen,
  currentAge,
  goalAge,
  waypoints,
  reflection,
  onReflect,
  onBack,
  illness,
  setIllness,
  illnessAge,
  setIllnessAge,
  careHome,
  setCareHome,
  careHomeAge,
  setCareHomeAge,
}: {
  result: ReturnType<typeof simulate>;
  presentHeadroomMonthlyYen: number;
  currentMonthlyExpenseYen: number;
  currentAge: number;
  goalAge: number;
  waypoints: Waypoint[];
  reflection: 'more' | 'less' | null;
  onReflect: (r: 'more' | 'less') => void;
  onBack: () => void;
  illness: boolean;
  setIllness: (b: boolean) => void;
  illnessAge: number;
  setIllnessAge: (n: number) => void;
  careHome: boolean;
  setCareHome: (b: boolean) => void;
  careHomeAge: number;
  setCareHomeAge: (n: number) => void;
}) {
  const rt = result.retirement;
  const free = rt.annualFreeSpendingYen;
  const hasRoom = free >= 0;
  const ages = result.years.map((y) => y.age);
  // グラフ幅は画面に合わせる（content padding 20×2 ＋ chartCard padding 12×2 を差し引く。上限560）
  const { width: winW } = useWindowDimensions();
  const chartW = Math.max(240, Math.min(winW, 560) - 64);
  // もしも試算の前提金額（snapshot＝Notion由来）
  const illnessMan = SNAPSHOT.events.find((e) => e.id === 'illness')?.oneTimeMan ?? 0;
  const careRow = SNAPSHOT.events.find((e) => e.id === 'care_home');
  const careMan = careRow?.annualMan ?? 0;
  const careDur = careRow?.durationYears ?? 0;

  // 退職後: 年金(＋パート)で最低生活費をどこまで賄えるか。不足は貯蓄を取り崩す
  const retireIncomeYen = rt.pensionAnnualYen + rt.partTimeAnnualYen;
  const shortfallYen = rt.minimumLivingCostAnnualYen - retireIncomeYen; // >0 なら貯蓄で補う
  const coveredByPension = shortfallYen <= 0;
  const yearsAtMinimum = coveredByPension ? 0 : Math.floor(result.assetsAtRetirementYen / shortfallYen);

  return (
    <Bg>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandWrap}>
          <GradientText text="あなたの未来" fontSize={28} />
        </View>

        <LinearGradient
          colors={hasRoom ? ['#3ddc97', '#16c8b8'] : ['#ff8a8a', '#f4607d']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroLabel}>退職時の貯蓄</Text>
          <Text style={styles.heroValue}>{yen(result.assetsAtRetirementYen)}</Text>
          <Text style={styles.heroTaikan}>今の生活費なら 約{Math.round(result.retirementYearsOfLivingCost)}年分</Text>
          <Text style={styles.heroNote}>
            年金 {monthlyYen(rt.pensionAnnualYen)}/月 ・ 最低生活費 {monthlyYen(rt.minimumLivingCostAnnualYen)}/月
          </Text>
        </LinearGradient>

        <Text style={styles.minNote}>
          {coveredByPension
            ? '年金だけで最低生活はまかなえます。貯蓄はまるごと使える分です。'
            : `年金で足りない分を貯蓄で補うと、最低生活なら 約${yearsAtMinimum}年分 もちます。`}
        </Text>
        <Text style={styles.minHint}>
          ※最低生活費は、家計調査「65歳以上・単身無職世帯」の平均消費支出（食料・住居・光熱・保健医療・通信など生活全般）に基づく概算です。
        </Text>

        <SectionTitle
          title="🗺️ あなたの人生ルート"
          info="いま（現在地）から退職（ゴール）までの道のり。各経由地の費用は実際のかかり方で表示します＝毎年かかるもの（子供・ペット・家のローン等）は『年額×年数』、一回のもの（結婚式・頭金）は『一回◯万』。退職（ゴール）の貯蓄だけは退職時にまとまった残高です。順位や勝ち負けはありません——あなた自身の道のりです。"
        />
        <View style={styles.routeWrap}>
          <RouteMap
            width={chartW}
            currentAge={currentAge}
            goalAge={goalAge}
            goalLabel="退職"
            goalSub={`${goalAge}歳・貯蓄 ${yen(result.assetsAtRetirementYen)}`}
            waypoints={waypoints}
          />
        </View>

        <SectionTitle
          title="📈 収入・支出の推移（生涯）"
          info="収入の計算: 額面年収を起点に、年齢別の昇給カーブ（賃金センサス令和7年・実質）で伸ばし、税・社会保険料を引いて手取りにします（例: 額面400万→手取り約320万）。退職後は年金（種類別）＋パートに切り替え。昇給率は実質で、物価上昇は考慮しません（現在価値）。消費＝基本生活費＋選んだライフイベント費（子供・住宅・ペット等）の実支出。一回きりの費用（大病・結婚式・頭金など）はその年に上乗せ（スパイク）して表示します。固定費＝住居費＋生活必須費＋イベント費（コミット分）。消費線と固定費線の差が、いま自由に使えているお金（裁量の娯楽費）です。"
        />
        <View style={styles.chartCard}>
          <LineChart
            width={chartW}
            height={170}
            xLabels={ages.map((a) => `${a}歳`)}
            bands={[
              {
                upper: result.years.map((y) => y.consumptionYen + y.eventAnnualYen + y.eventOneTimeYen),
                lower: result.years.map((y) => y.fixedCostYen + y.eventAnnualYen + y.eventOneTimeYen),
                color: '#f0a04b',
                opacity: 0.22,
                label: '自由に使えるお金',
              },
            ]}
            series={[
              { label: '年収', color: '#a78bfa', values: result.years.map((y) => y.grossIncomeYen) },
              { label: '手取り', color: '#4fd6b8', values: result.years.map((y) => y.netIncomeYen) },
              { label: '消費', color: '#f0a04b', values: result.years.map((y) => y.consumptionYen + y.eventAnnualYen + y.eventOneTimeYen) },
              { label: '固定費（必要な支出）', color: '#9c6b3f', values: result.years.map((y) => y.fixedCostYen + y.eventAnnualYen + y.eventOneTimeYen) },
            ]}
          />
        </View>

        <SectionTitle
          title="📊 資産の推移（生涯）"
          info="消費の計算: 入力した毎月の支出を基準に、家計調査の年齢別消費カーブで増減（現役はほぼ横ばい、60歳で約−14%、以降微減）。物価は考慮しません（現在価値）。退職後は最低生活費（約14.9万/月＝家計調査 高齢単身無職）で取り崩し。資産＝毎年「手取り−消費−イベント＋運用益」を積み上げ、退職後は年金で足りない分を貯蓄から取り崩します。"
        />
        <View style={styles.chartCard}>
          <LineChart
            width={chartW}
            height={190}
            xLabels={ages.map((a) => `${a}歳`)}
            series={[
              { label: '資産', color: '#6aa8ff', kind: 'bar', values: result.years.map((y) => y.assetsYen) },
            ]}
          />
        </View>

        <Text style={styles.section}>🧪 もしもの試算</Text>
        <Text style={styles.minHint}>未来を見たうえで、起きると大きい出費を試せます。切り替えると上のグラフと数字が変わります。</Text>
        <View style={styles.detailBox}>
          <Accordion title="大病をしたら" summary={illness ? '見る' : '—'} active={illness}>
            <Segmented label="試す" options={['見ない', '見る']} value={illness ? '見る' : '見ない'} onChange={(v) => setIllness(v === '見る')} />
            <Text style={styles.minHint}>{illnessAge}歳で 約{illnessMan}万円 を1回（治療費の自己負担＋療養中の収入減の概算）</Text>
            {illness && <Stepper label="その年齢" value={illnessAge} unit="歳" min={18} max={99} onChange={setIllnessAge} />}
          </Accordion>
          <Accordion title="介護施設に入ったら" summary={careHome ? '入る' : '—'} active={careHome}>
            <Segmented label="試す" options={['入らない', '入る']} value={careHome ? '入る' : '入らない'} onChange={(v) => setCareHome(v === '入る')} />
            <Text style={styles.minHint}>{careHomeAge}歳から 年{careMan}万円 × {careDur}年 ＝ 計 約{careMan * careDur}万円（{careDur}年＝平均介護期間 約4年7ヶ月。入居一時金は別途・要手入力）</Text>
            {careHome && <Stepper label="入る年齢" value={careHomeAge} unit="歳" min={60} max={99} onChange={setCareHomeAge} />}
          </Accordion>
        </View>

        <Text style={styles.section}>💭 この数字、どう感じましたか？</Text>
        <View style={styles.reflectRow}>
          <Pressable onPress={() => onReflect('less')} style={[styles.reflectBtn, reflection === 'less' && styles.reflectActive]}>
            <Text style={styles.reflectText}>思ったより少ない</Text>
          </Pressable>
          <Pressable onPress={() => onReflect('more')} style={[styles.reflectBtn, reflection === 'more' && styles.reflectActive]}>
            <Text style={styles.reflectText}>思ったより多い</Text>
          </Pressable>
        </View>

        {reflection && (
          <Suggestion
            hasRoom={hasRoom}
            presentHeadroomMonthlyYen={presentHeadroomMonthlyYen}
            currentMonthlyExpenseYen={currentMonthlyExpenseYen}
            retirementFreeMonthlyYen={free / 12}
            reflection={reflection}
          />
        )}

        <Accordion title="📖 計算方法・前提（詳しく知りたい人へ）">
          <Text style={styles.minNote}>・すべて現在価値（今日の円）。物価上昇は考慮せず、昇給率・運用利回りは実質で扱います。</Text>
          <Text style={styles.minNote}>・収入: 額面年収を起点に、年齢別の昇給カーブ（賃金センサス・実質）で伸ばし、税・社会保険料を引いて手取りにします（例: 額面400万→手取り約320万）。</Text>
          <Text style={styles.minNote}>・消費: 入力した「毎月の支出」を基準に、家計調査の年齢別カーブで増減（現役はほぼ横ばい、退職後は減）。</Text>
          <Text style={styles.minNote}>・ライフイベント: 選んだ項目の年額／一回費用を加算（出所＝家計調査・各種統計）。住宅は賃貸→購入で家賃を維持費＋ローンに置換。</Text>
          <Text style={styles.minNote}>・退職後: 収入＝年金（国民 約5.9万／厚生 約15.1万・月）＋パート。支出＝最低生活費（約14.9万/月＝家計調査 高齢単身無職）。不足は貯蓄を取り崩し、資産が尽きるまで描きます。</Text>
          <Text style={styles.minNote}>・積立投資: 退職まで毎月積み立て、実質利回り約2.5%（GPIF設立来+4.71%−物価）で複利運用。</Text>
          <Text style={styles.minHint}>出所: 賃金構造基本統計調査／家計調査／厚労省 年金事業概況／GPIF／国立成育医療研究センター ほか。</Text>
          <Text style={styles.minHint}>限界: 「平均どおりに進めば」の1本線で、確率や個人の振れ（テールリスク）は表現しません。年齢別データは“ある時点の断面”（合成コホート）で、同一個人の生涯推移ではありません。</Text>
        </Accordion>

        <Pressable onPress={onBack} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>条件を変えてもう一度</Text>
        </Pressable>
      </ScrollView>
    </Bg>
  );
}

function Suggestion({
  hasRoom,
  presentHeadroomMonthlyYen,
  currentMonthlyExpenseYen,
  retirementFreeMonthlyYen,
  reflection,
}: {
  hasRoom: boolean;
  presentHeadroomMonthlyYen: number;
  currentMonthlyExpenseYen: number;
  retirementFreeMonthlyYen: number;
  reflection: 'more' | 'less';
}) {
  if (!hasRoom) {
    return (
      <View style={styles.suggest}>
        <Text style={styles.suggestTitle}>悲観しなくて大丈夫</Text>
        <Text style={styles.suggestBody}>
          今のままだと退職後がやや厳しめ。でも変えられる余地はたくさんあります。{'\n'}
          ・退職を1〜2年延ばす ・退職後に少しだけ働く ・投資を始める{'\n'}
          条件を変えて、どれが効くか試してみましょう。
        </Text>
      </View>
    );
  }
  // SPEC §5.6 の核: 「今の生活に 月△△円 まで上乗せできる」という"今を楽しむ許可"
  const upMonthly = Math.max(0, Math.round(presentHeadroomMonthlyYen / 1000) * 1000);
  const up = upMonthly.toLocaleString();
  const pct = currentMonthlyExpenseYen > 0 ? Math.round((upMonthly / currentMonthlyExpenseYen) * 100) : 0;
  const retire = Math.round(retirementFreeMonthlyYen).toLocaleString();
  return (
    <View style={styles.suggest}>
      <Text style={styles.suggestTitle}>
        {reflection === 'more' ? 'やっぱり、余裕がありました' : 'それでも、ちゃんと余裕はあります'}
      </Text>
      <Text style={styles.permitLead}>今の生活に</Text>
      <Text style={styles.permitValue}>月 {up}円</Text>
      <Text style={styles.permitValueLabel}>まで上乗せできます</Text>
      <Text style={styles.permitNote}>
        毎月の支出を月 {up}円（今の約{pct}%）増やしても、退職後の最低生活は守れます。
      </Text>
      <Text style={styles.suggestBody}>
        将来のために我慢している「今しかできないこと」、その範囲で少し始めてみませんか？
      </Text>
      <View style={styles.ideaRow}>
        <Idea text="🌏 旅行に行く" />
        <Idea text="🎸 趣味を始める" />
        <Idea text="📚 学びに投資" />
      </View>
      <Text style={styles.suggestHint}>
        ※この「上乗せできる額」は、退職後に最低生活を守れる範囲の上限です（退職後も月 {retire}円 自由に使える試算）。
        ホームの「詳細」で“やりたいこと”に金額を入れると、それでも将来が大丈夫か確かめられます。
      </Text>
    </View>
  );
}

function Idea({ text }: { text: string }) {
  return (
    <View style={styles.idea}>
      <Text style={styles.ideaText}>{text}</Text>
    </View>
  );
}

function GradientText({ text, fontSize = 36 }: { text: string; fontSize?: number }) {
  const w = Math.ceil(text.length * fontSize * 1.04) + 4;
  const h = Math.ceil(fontSize * 1.34);
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#7c5cfc" />
          <Stop offset="0.55" stopColor="#b15cf2" />
          <Stop offset="1" stopColor="#ff6fb5" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={0} y={fontSize} fontSize={fontSize} fontWeight="900" fill="url(#brandGrad)">
        {text}
      </SvgText>
    </Svg>
  );
}

function SectionTitle({ title, info }: { title: string; info?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <View style={styles.sectionRow}>
        <Text style={[styles.section, { marginTop: 0 }]}>{title}</Text>
        {info ? (
          <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8}>
            <Text style={styles.accInfo}>ⓘ</Text>
          </Pressable>
        ) : null}
      </View>
      {open && info ? <Text style={styles.minHint}>{info}</Text> : null}
    </>
  );
}

function Accordion({
  title,
  summary,
  active,
  info,
  children,
}: {
  title: string;
  summary?: string;
  active?: boolean;
  info?: string; // ⓘ で開く「算出根拠・出所」（Notion由来）
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <View style={[styles.acc, active && styles.accActive]}>
      <View style={styles.accHead}>
        <Pressable onPress={() => setOpen((o) => !o)} style={styles.accHeadMain}>
          <Text style={styles.accTitle}>{title}</Text>
          <View style={styles.accRight}>
            {summary ? <Text style={[styles.accSummary, active && styles.accSummaryOn]}>{summary}</Text> : null}
            <Text style={styles.accChevron}>{open ? '▲' : '▼'}</Text>
          </View>
        </Pressable>
        {info ? (
          <Pressable onPress={() => setInfoOpen((v) => !v)} hitSlop={8} style={styles.accInfoBtn}>
            <Text style={styles.accInfo}>ⓘ</Text>
          </Pressable>
        ) : null}
      </View>
      {infoOpen && info ? (
        <View style={styles.accInfoBox}>
          <Text style={styles.minHint}>{info}</Text>
        </View>
      ) : null}
      {open && <View style={styles.accBody}>{children}</View>}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function Stepper({
  label,
  value,
  unit,
  step = 1,
  min = 0,
  max,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step?: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  const clamp = (n: number) => Math.max(min, max != null ? Math.min(max, n) : n);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable hitSlop={6} style={styles.stepBtn} onPress={() => onChange(clamp(value - step))}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <TextInput
          style={styles.stepInput}
          keyboardType="number-pad"
          value={String(value)}
          onChangeText={(t) => onChange(clamp(Number(t.replace(/[^0-9]/g, '')) || 0))}
          selectTextOnFocus
        />
        <Text style={styles.stepUnit}>{unit}</Text>
        <Pressable hitSlop={6} style={styles.stepBtn} onPress={() => onChange(clamp(value + step))}>
          <Text style={styles.stepBtnText}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Segmented({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.segment}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <Pressable key={opt} onPress={() => onChange(opt)} style={[styles.segItem, active && styles.segItemActive]}>
              <Text style={[styles.segText, active && styles.segTextActive]}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const C = {
  card: '#ffffff',
  cardBorder: 'rgba(124,92,252,0.16)',
  text: '#2a2540',
  sub: '#827aa0',
  accent: '#7c5cfc',
  inputBg: '#f1ecff',
};

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  calcText: { color: C.sub, fontSize: 15 },
  content: { padding: 20, gap: 10, maxWidth: 560, width: '100%', alignSelf: 'center' },
  brandWrap: { marginBottom: 10 },
  tagline: { color: C.sub, fontSize: 13, marginTop: 2 },

  onbWrap: { paddingHorizontal: 28, maxWidth: 480, width: '100%', alignSelf: 'center', gap: 18 },
  onbBrand: { color: C.accent, fontSize: 15, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  onbTitle: { color: C.text, fontSize: 26, fontWeight: '900', lineHeight: 38, textAlign: 'center' },
  onbBody: { color: C.sub, fontSize: 15, lineHeight: 24, textAlign: 'center' },
  onbBtn: { width: '100%' },
  onbFoot: { color: C.sub, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: -4 },

  hero: { borderRadius: 20, padding: 22, gap: 6 },
  heroLabel: { color: '#e7f6ef', fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#ffffff', fontSize: 42, fontWeight: '900' },
  heroUnit: { fontSize: 18, fontWeight: '700' },
  heroTaikan: { color: '#ffffff', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  heroNote: { color: '#eafaf3', fontSize: 12, lineHeight: 18 },

  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 14, padding: 14 },
  statLabel: { color: C.sub, fontSize: 12 },
  statValue: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 4 },

  section: { color: C.accent, fontSize: 14, fontWeight: '800', marginTop: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  chartCard: { backgroundColor: '#1a1830', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 14, padding: 12 },
  routeWrap: { alignItems: 'center' },
  minNote: { color: '#2a2540', fontSize: 13, lineHeight: 19, marginTop: 2 },
  minHint: { color: '#827aa0', fontSize: 11, lineHeight: 16 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1,
    borderRadius: 14, paddingVertical: 9, paddingHorizontal: 14,
  },
  rowLabel: { color: C.text, fontSize: 15, flex: 1, paddingRight: 10 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(124,92,252,0.14)',
    justifyContent: 'center', alignItems: 'center',
  },
  stepBtnText: { color: C.accent, fontSize: 22, fontWeight: '700', lineHeight: 24 },
  stepInput: {
    color: C.text, fontSize: 19, fontWeight: '800', width: 66, textAlign: 'center',
    paddingVertical: 4, paddingHorizontal: 2, backgroundColor: C.inputBg, borderRadius: 8,
  },
  stepUnit: { color: C.sub, fontSize: 12, width: 30 },

  segment: { flexDirection: 'row', backgroundColor: C.inputBg, borderRadius: 10, padding: 3 },
  segItem: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 8 },
  segItemActive: { backgroundColor: C.accent },
  segText: { color: C.sub, fontSize: 12, fontWeight: '700' },
  segTextActive: { color: '#ffffff' },

  detailToggle: { paddingVertical: 12 },
  detailToggleText: { color: C.accent, fontSize: 14, fontWeight: '800' },
  detailBox: { gap: 10 },
  acc: { backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  accActive: { borderColor: C.accent },
  accHead: { flexDirection: 'row', alignItems: 'center' },
  accHeadMain: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingLeft: 14, paddingRight: 8 },
  accInfoBtn: { paddingHorizontal: 12, paddingVertical: 13 },
  accInfo: { color: C.accent, fontSize: 16, fontWeight: '700' },
  accInfoBox: { paddingHorizontal: 14, paddingBottom: 10, paddingTop: 2, backgroundColor: 'rgba(124,92,252,0.04)' },
  accTitle: { color: C.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  accRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accSummary: { color: C.sub, fontSize: 13, fontWeight: '700' },
  accSummaryOn: { color: C.accent },
  accChevron: { color: C.sub, fontSize: 10 },
  accBody: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 2, gap: 10, backgroundColor: 'rgba(124,92,252,0.04)' },

  cta: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginTop: 18 },
  ctaText: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
  secondaryBtn: { borderColor: C.cardBorder, borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  secondaryText: { color: C.sub, fontSize: 14, fontWeight: '700' },

  reflectRow: { flexDirection: 'row', gap: 10 },
  reflectBtn: {
    flex: 1, backgroundColor: C.card, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1, borderColor: C.cardBorder,
  },
  reflectActive: { borderColor: C.accent, backgroundColor: 'rgba(124,92,252,0.10)' },
  reflectText: { color: C.text, fontSize: 14, fontWeight: '700' },

  suggest: { backgroundColor: 'rgba(124,92,252,0.08)', borderColor: 'rgba(124,92,252,0.22)', borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, marginTop: 4 },
  suggestTitle: { color: '#7c5cfc', fontSize: 16, fontWeight: '900' },
  permitLead: { color: C.sub, fontSize: 13, marginTop: 2 },
  permitValue: { color: '#7c5cfc', fontSize: 30, fontWeight: '900', lineHeight: 36 },
  permitValueLabel: { color: '#7c5cfc', fontSize: 15, fontWeight: '800', marginTop: -2, marginBottom: 2 },
  permitNote: { color: C.text, fontSize: 13, lineHeight: 20 },
  suggestBody: { color: C.text, fontSize: 13, lineHeight: 20 },
  suggestHint: { color: C.sub, fontSize: 11, lineHeight: 17, marginTop: 4 },
  ideaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  idea: { backgroundColor: '#f1ecff', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  ideaText: { color: '#7c5cfc', fontSize: 13, fontWeight: '700' },

  disclaimer: { color: C.sub, fontSize: 11, lineHeight: 16, marginTop: 14 },
});
