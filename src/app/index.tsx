/** ホーム画面: 入力（現在地・想定・詳細オプション）→ 計算 → 結果、のフローを束ねる */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Onboarding } from '@/components/onboarding';
import { ResultView } from '@/components/result-view';
import type { Waypoint } from '@/components/route-map';
import { Accordion } from '@/components/ui/accordion';
import { ChoiceCard, MetricCard, Segmented, SliderRow } from '@/components/ui/inputs';
import { Bg, GradientText, PrimaryButton } from '@/components/ui/layout';
import { C, shared } from '@/components/ui/theme';
import {
  COUNTABLE_EVENT_IDS,
  EVENT_EMOJI,
  OPTION_EVENTS,
  eventCadenceLabel,
  hasRecurringCost,
} from '@/core/data/event-display';
import { buildAssumptions, buildEventCatalog } from '@/core/data/mappers';
import { SNAPSHOT } from '@/core/data/snapshot';
import { MAN } from '@/core/format';
import {
  DEFAULT_RETIREMENT_AGE,
  simulate,
  solvePresentMonthlyHeadroomYen,
} from '@/core/simulation/simulate';
import type { PlacedEvent, Scenario, Sex, SimulationInput } from '@/core/simulation/types';

const ONBOARD_KEY = 'tsukao:onboarded';

type Phase = 'input' | 'calculating' | 'result';
type Housing = '賃貸' | '購入' | '持ち家';

/** 詳細オプション1件の選択状態 */
type Pick = { on: boolean; startAge: number; count: number; amountMan: number };

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
  // 性別は任意入力。予測寿命(平均余命)の参照に使い、未回答なら男女平均(ADR: spend-down-projection)
  const [sex, setSex] = useState<'未回答' | Sex>('未回答');
  const [incomeMan, setIncomeMan] = useState(500);
  const [assetsMan, setAssetsMan] = useState(200);
  const [monthlyExpenseMan, setMonthlyExpenseMan] = useState(22);
  const [retirementAge, setRetirementAge] = useState(DEFAULT_RETIREMENT_AGE);
  const [pensionType, setPensionType] = useState<'国民年金のみ' | '厚生年金'>('厚生年金');
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
      sex: sex === '未回答' ? undefined : sex,
      baseCalendarYear: new Date().getFullYear(), // simulate を実行時刻に依存させない(純粋性の維持)
      pensionType,
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
    age, sex, incomeMan, assetsMan, monthlyExpenseMan, retirementAge, pensionType,
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
        <ActivityIndicator size="large" color="#0ea98e" />
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
      <ScrollView contentContainerStyle={shared.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inputHeader}>
          <GradientText text="ツカオ" fontSize={26} />
          <Text style={styles.tagline}>将来が見えると、今を楽しめる。</Text>
        </View>

        <Text style={shared.section}>📍 あなたの現在地</Text>
        <MetricCard icon="🎂" tint="#e8f2fb" label="現在の年齢" value={age} unit="歳" min={18} max={99} onChange={setAge} />
        <ChoiceCard icon="👤" tint="#eef0f3" label="性別（任意）" options={['未回答', '男性', '女性']} value={sex} onChange={(v) => setSex(v as typeof sex)} />
        <Text style={shared.hint}>寿命の予測（平均余命）にだけ使います。未回答なら男女平均で計算します。</Text>
        <MetricCard icon="💴" tint="#e6f6f1" label="年収(額面)" value={incomeMan} unit="万円" min={0} max={1500} step={10} onChange={setIncomeMan} />
        <MetricCard icon="🐷" tint="#fdf2dc" label="今の金融資産" value={assetsMan} unit="万円" min={0} max={5000} step={50} onChange={setAssetsMan} />
        <MetricCard icon="🛒" tint="#fbe9e7" label="毎月の支出" value={monthlyExpenseMan} unit="万円" min={0} max={60} onChange={setMonthlyExpenseMan} />

        <Text style={shared.section}>🔮 これからの想定</Text>
        <MetricCard icon="🏖️" tint="#e8f2fb" label="退職する年齢" value={retirementAge} unit="歳" min={40} max={90} onChange={setRetirementAge} />
        <ChoiceCard icon="🏛️" tint="#e6f6f1" label="年金の種類" options={['厚生年金', '国民年金のみ']} value={pensionType} onChange={(v) => setPensionType(v as never)} />
        <ChoiceCard icon="💼" tint="#fdf2dc" label="退職後にパートで働く" options={['働かない', '働く']} value={partTime ? '働く' : '働かない'} onChange={(v) => setPartTime(v === '働く')} />
        {partTime && <MetricCard icon="💴" tint="#e6f6f1" label="パートの年収" value={partTimeMan} unit="万/年" min={0} max={400} step={10} onChange={setPartTimeMan} />}

        <Pressable onPress={() => setShowDetail((s) => !s)} style={styles.detailToggle}>
          <Text style={styles.detailToggleText}>{showDetail ? '▼ 詳細・オプションを閉じる' : '✨ 詳細・オプションを開く'}</Text>
        </Pressable>

        {showDetail && (
          <View style={shared.detailBox}>
            <Accordion icon="📈" title="積立投資" summary={invest ? 'する' : 'しない'} active={invest} expanded={invest} onToggle={setInvest}>
              <SliderRow label="毎月の積立額" value={monthlyInvestMan} unit="万円" min={0} max={30} onChange={setMonthlyInvestMan} />
              <Text style={shared.hint}>退職まで毎月コツコツ積み立て、実質利回り約2.5%で複利運用する想定です。閉じると外れます。</Text>
            </Accordion>

            <Accordion icon="🏠" title="住まい" summary={housing} active={housing !== '賃貸'}>
              <Segmented label="住まい" options={['賃貸', '購入', '持ち家']} value={housing} onChange={(v) => setHousing(v as Housing)} />
              {housing !== '持ち家' && <SliderRow label="今の家賃" value={rentMan} unit="万/月" min={0} max={30} onChange={setRentMan} />}
              {housing === '購入' && <SliderRow label="購入する年齢" value={buyAge} unit="歳" min={18} max={99} onChange={setBuyAge} />}
            </Accordion>

            {OPTION_EVENTS.map((ev) => {
              const p = pickOf(ev.id);
              // 入力した瞬間の費用ヒント（ルートと同じ共通フォーマッタ＝表示を一致させる）
              const costHint = eventCadenceLabel(catalog[ev.id], COUNTABLE_EVENT_IDS.has(ev.id) ? p.count : 1);
              return (
                <Accordion
                  key={ev.id}
                  icon={EVENT_EMOJI[ev.id] ?? '📍'}
                  title={ev.name}
                  summary={p.on ? 'あり' : 'なし'}
                  active={p.on}
                  info={ev.note ? (ev.source ? `${ev.note}\n出所: ${ev.source}` : ev.note) : undefined}
                  // 開いた時点で ON 登録（あり/なしボタンは置かない）。閉じると OFF
                  expanded={p.on}
                  onToggle={(o) => setPick(ev.id, { on: o })}
                >
                  <SliderRow label={ev.calcKind === '一回スポット' ? 'その年齢' : '開始年齢'} value={p.startAge} unit="歳" min={18} max={99} onChange={(n) => setPick(ev.id, { startAge: n })} />
                  {costHint ? <Text style={shared.hint}>{costHint}</Text> : null}
                  {ev.annualMan == null && ev.calcKind !== '一回スポット' && <SliderRow label="年額" value={p.amountMan} unit="万/年" min={0} max={100} step={5} onChange={(n) => setPick(ev.id, { amountMan: n })} />}
                  {COUNTABLE_EVENT_IDS.has(ev.id) && <SliderRow label="人数・頭数" value={p.count} unit="" min={1} max={10} onChange={(n) => setPick(ev.id, { count: n })} />}
                </Accordion>
              );
            })}
          </View>
        )}

        <PrimaryButton label="未来を見てみる ✨" onPress={calculate} />
        <Text style={styles.disclaimer}>
          ※すべて今の円の価値(物価無視)。平均値による1本の見通しで、確定した予測ではありません。
        </Text>
      </ScrollView>
    </Bg>
  );
}

const styles = StyleSheet.create({
  calcText: { color: C.sub, fontSize: 15 },
  inputHeader: { marginBottom: 6, gap: 2 },
  tagline: { color: C.sub, fontSize: 13, marginTop: 2 },
  detailToggle: { paddingVertical: 12 },
  detailToggleText: { color: C.accent, fontSize: 14, fontWeight: '800' },
  disclaimer: { color: C.sub, fontSize: 11, lineHeight: 16, marginTop: 14 },
});
