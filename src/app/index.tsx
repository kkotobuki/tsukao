import { LinearGradient } from 'expo-linear-gradient';
import { Defs, LinearGradient as SvgLinearGradient, Stop, Svg, Text as SvgText } from 'react-native-svg';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LineChart } from '@/components/line-chart';
import { buildAssumptions, buildEventCatalog } from '@/core/data/mappers';
import { SNAPSHOT } from '@/core/data/snapshot';
import {
  DEFAULT_RETIREMENT_AGE,
  DEFAULT_YEARS_TO_SPEND_SAVINGS,
  simulate,
} from '@/core/simulation/simulate';
import type { PlacedEvent, Scenario, SimulationInput } from '@/core/simulation/types';

const MAN = 10000;
const yen = (v: number) => `${Math.round(v / MAN).toLocaleString()}万円`;
const monthlyYen = (annual: number) => `${Math.round(annual / 12).toLocaleString()}円`;

type Phase = 'input' | 'calculating' | 'result';
type Housing = '賃貸' | '購入' | '持ち家';

/** 詳細リストにデータ駆動で出すイベント。house/retire/invest=専用UI、illness/care_home=結果画面の"もしも試算" */
const SPECIAL_EVENT_IDS = new Set(['house', 'retire', 'invest', 'illness', 'care_home']);
/** 人数・頭数で掛けるイベント */
const COUNTABLE_EVENT_IDS = new Set(['child', 'pet_dog', 'pet_cat']);
/** 詳細に並べるオプション（Notion由来の snapshot から自動生成） */
const OPTION_EVENTS = SNAPSHOT.events.filter((e) => !SPECIAL_EVENT_IDS.has(e.id));

type Pick = { on: boolean; startAge: number; count: number; amountMan: number };

const BG_COLORS = ['#FFF4E8', '#FFE9F3', '#EFEBFF'] as const;

function Bg({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <LinearGradient colors={BG_COLORS} style={styles.bg}>
      <SafeAreaView style={[styles.safe, center && styles.center]}>{children}</SafeAreaView>
    </LinearGradient>
  );
}

export default function Home() {
  const assumptions = useMemo(() => buildAssumptions(SNAPSHOT), []);
  const catalog = useMemo(() => buildEventCatalog(SNAPSHOT), []);

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

  const result = useMemo(() => {
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
    return simulate(input, { id: 'main', name: '現在地', events }, assumptions);
  }, [
    age, incomeMan, assetsMan, monthlyExpenseMan, retirementAge, pensionType, yearsN,
    invest, monthlyInvestMan, housing, rentMan, buyAge, picks, partTime, partTimeMan,
    illness, illnessAge, careHome, careHomeAge, assumptions, catalog,
  ]);

  function calculate() {
    setReflection(null);
    setPhase('calculating');
    setTimeout(() => setPhase('result'), 1300);
  }

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
        <Stepper label="現在の年齢" value={age} unit="歳" onChange={setAge} />
        <Stepper label="年収(額面)" value={incomeMan} unit="万円" step={50} onChange={setIncomeMan} />
        <Stepper label="今の金融資産" value={assetsMan} unit="万円" step={50} onChange={setAssetsMan} />
        <Stepper label="毎月の支出" value={monthlyExpenseMan} unit="万円" onChange={setMonthlyExpenseMan} />

        <Text style={styles.section}>🔮 これからの想定</Text>
        <Stepper label="退職する年齢" value={retirementAge} unit="歳" onChange={setRetirementAge} />
        <Stepper label="貯蓄を使う年数(N)" value={yearsN} unit="年" onChange={setYearsN} />
        <Segmented label="年金の種類" options={['厚生年金', '国民年金のみ']} value={pensionType} onChange={(v) => setPensionType(v as never)} />
        <Segmented label="退職後にパートで働く" options={['働かない', '働く']} value={partTime ? '働く' : '働かない'} onChange={(v) => setPartTime(v === '働く')} />
        {partTime && <Stepper label="パートの年収" value={partTimeMan} unit="万/年" step={10} onChange={setPartTimeMan} />}

        <Pressable onPress={() => setShowDetail((s) => !s)} style={styles.detailToggle}>
          <Text style={styles.detailToggleText}>{showDetail ? '▼ 詳細・オプションを閉じる' : '✨ 詳細・オプションを開く'}</Text>
        </Pressable>

        {showDetail && (
          <View style={styles.detailBox}>
            <Segmented label="投資する" options={['しない', 'する']} value={invest ? 'する' : 'しない'} onChange={(v) => setInvest(v === 'する')} />
            {invest && <Stepper label="毎月の投資額" value={monthlyInvestMan} unit="万円" onChange={setMonthlyInvestMan} />}

            <Segmented label="住まい" options={['賃貸', '購入', '持ち家']} value={housing} onChange={(v) => setHousing(v as Housing)} />
            {housing !== '持ち家' && <Stepper label="今の家賃" value={rentMan} unit="万/月" onChange={setRentMan} />}
            {housing === '購入' && <Stepper label="購入する年齢" value={buyAge} unit="歳" onChange={setBuyAge} />}

            {OPTION_EVENTS.map((ev) => {
              const p = pickOf(ev.id);
              return (
                <View key={ev.id} style={{ gap: 10 }}>
                  <Segmented label={ev.name} options={['なし', 'あり']} value={p.on ? 'あり' : 'なし'} onChange={(v) => setPick(ev.id, { on: v === 'あり' })} />
                  {p.on && <Stepper label="開始年齢" value={p.startAge} unit="歳" onChange={(n) => setPick(ev.id, { startAge: n })} />}
                  {p.on && ev.annualMan == null && <Stepper label="年額" value={p.amountMan} unit="万/年" step={5} onChange={(n) => setPick(ev.id, { amountMan: n })} />}
                  {p.on && COUNTABLE_EVENT_IDS.has(ev.id) && <Stepper label="人数・頭数" value={p.count} unit="" min={1} onChange={(n) => setPick(ev.id, { count: n })} />}
                </View>
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

        <Text style={styles.section}>📊 資産の推移（生涯）</Text>
        <View style={styles.chartCard}>
          <LineChart
            width={480}
            height={190}
            xLabels={ages.map((a) => `${a}歳`)}
            series={[
              { label: '資産', color: '#6aa8ff', kind: 'bar', values: result.years.map((y) => y.assetsYen) },
            ]}
          />
        </View>

        <Text style={styles.section}>📈 収入・支出の推移（生涯）</Text>
        <View style={styles.chartCard}>
          <LineChart
            width={480}
            height={170}
            xLabels={ages.map((a) => `${a}歳`)}
            series={[
              { label: '年収', color: '#a78bfa', values: result.years.map((y) => y.grossIncomeYen) },
              { label: '手取り', color: '#4fd6b8', values: result.years.map((y) => y.netIncomeYen) },
              { label: '消費', color: '#f0a04b', values: result.years.map((y) => y.consumptionYen) },
            ]}
          />
        </View>

        <Text style={styles.section}>🧪 もしもの試算</Text>
        <Text style={styles.minHint}>未来を見たうえで、起きると大きい出費を試せます。切り替えると上のグラフと数字が変わります。</Text>
        <View style={styles.detailBox}>
          <Segmented label="大病をしたら" options={['見ない', '見る']} value={illness ? '見る' : '見ない'} onChange={(v) => setIllness(v === '見る')} />
          {illness && <Stepper label="その年齢" value={illnessAge} unit="歳" onChange={setIllnessAge} />}
          <Segmented label="介護施設に入ったら" options={['入らない', '入る']} value={careHome ? '入る' : '入らない'} onChange={(v) => setCareHome(v === '入る')} />
          {careHome && <Stepper label="入る年齢" value={careHomeAge} unit="歳" onChange={setCareHomeAge} />}
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

        {reflection && <Suggestion hasRoom={hasRoom} monthlyFreeYen={free / 12} reflection={reflection} />}

        <Pressable onPress={onBack} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>条件を変えてもう一度</Text>
        </Pressable>
      </ScrollView>
    </Bg>
  );
}

function Suggestion({ hasRoom, monthlyFreeYen, reflection }: { hasRoom: boolean; monthlyFreeYen: number; reflection: 'more' | 'less' }) {
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
  const m = Math.round(monthlyFreeYen).toLocaleString();
  return (
    <View style={styles.suggest}>
      <Text style={styles.suggestTitle}>
        {reflection === 'more' ? 'やっぱり、余裕がありました' : 'それでも、ちゃんと余裕はあります'}
      </Text>
      <Text style={styles.suggestBody}>
        退職後でも月 {m}円 を自由に使えます。だとしたら——{'\n'}
        将来のために我慢している「今しかできないこと」、少し始めてみませんか？
      </Text>
      <View style={styles.ideaRow}>
        <Idea text="🌏 旅行に行く" />
        <Idea text="🎸 趣味を始める" />
        <Idea text="📚 学びに投資" />
      </View>
      <Text style={styles.suggestHint}>
        ※ホームの「詳細」で“やりたいこと”に金額を入れると、それでも将来が大丈夫か確かめられます。
        経験は、貯金より記憶に残ります。
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
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  step?: number;
  min?: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable hitSlop={6} style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - step))}>
          <Text style={styles.stepBtnText}>−</Text>
        </Pressable>
        <TextInput
          style={styles.stepInput}
          keyboardType="number-pad"
          value={String(value)}
          onChangeText={(t) => onChange(Number(t.replace(/[^0-9]/g, '')) || 0)}
          selectTextOnFocus
        />
        <Text style={styles.stepUnit}>{unit}</Text>
        <Pressable hitSlop={6} style={styles.stepBtn} onPress={() => onChange(value + step)}>
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

  hero: { borderRadius: 20, padding: 22, gap: 6 },
  heroLabel: { color: '#e7f6ef', fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#ffffff', fontSize: 42, fontWeight: '900' },
  heroUnit: { fontSize: 18, fontWeight: '700' },
  heroNote: { color: '#eafaf3', fontSize: 12, lineHeight: 18 },

  statRow: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 14, padding: 14 },
  statLabel: { color: C.sub, fontSize: 12 },
  statValue: { color: C.text, fontSize: 20, fontWeight: '800', marginTop: 4 },

  section: { color: C.accent, fontSize: 14, fontWeight: '800', marginTop: 16 },
  chartCard: { backgroundColor: '#1a1830', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderRadius: 14, padding: 12 },
  minNote: { color: '#2a2540', fontSize: 13, lineHeight: 19, marginTop: 2 },
  minHint: { color: '#827aa0', fontSize: 11, lineHeight: 16 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1,
    borderRadius: 14, paddingVertical: 9, paddingHorizontal: 14,
  },
  rowLabel: { color: C.text, fontSize: 15, flexShrink: 1 },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(124,92,252,0.14)',
    justifyContent: 'center', alignItems: 'center',
  },
  stepBtnText: { color: C.accent, fontSize: 22, fontWeight: '700', lineHeight: 24 },
  stepInput: {
    color: C.text, fontSize: 19, fontWeight: '800', minWidth: 52, textAlign: 'center',
    paddingVertical: 4, backgroundColor: C.inputBg, borderRadius: 8,
  },
  stepUnit: { color: C.sub, fontSize: 12, width: 34 },

  segment: { flexDirection: 'row', backgroundColor: C.inputBg, borderRadius: 10, padding: 3 },
  segItem: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 8 },
  segItemActive: { backgroundColor: C.accent },
  segText: { color: C.sub, fontSize: 12, fontWeight: '700' },
  segTextActive: { color: '#ffffff' },

  detailToggle: { paddingVertical: 12 },
  detailToggleText: { color: C.accent, fontSize: 14, fontWeight: '800' },
  detailBox: { gap: 10 },

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
  suggestBody: { color: C.text, fontSize: 13, lineHeight: 20 },
  suggestHint: { color: C.sub, fontSize: 11, lineHeight: 17, marginTop: 4 },
  ideaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  idea: { backgroundColor: '#f1ecff', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  ideaText: { color: '#7c5cfc', fontSize: 13, fontWeight: '700' },

  disclaimer: { color: C.sub, fontSize: 11, lineHeight: 16, marginTop: 14 },
});
