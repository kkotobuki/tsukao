import type {
  Assumptions,
  PlacedEvent,
  Scenario,
  SimulationInput,
  SimulationResult,
  YearProjection,
} from './types';

/** 退職年齢の既定値(ADR: 退職タイミングのデフォルトは要検討) */
export const DEFAULT_RETIREMENT_AGE = 65;
/** 試算の終端年齢の既定値 */
export const DEFAULT_END_AGE = 95;

/**
 * 平均一本線シミュレーション(純粋関数・現在価値)。
 * 端末内で同期実行できる軽量計算(v1 のステートレス方針)。年齢を1年ずつ進めて資産を積む。
 *
 * ──────────────────────────────────────────────────────────────
 * 基本消費は固定せず可変オプション(レバー)とする(input.consumptionBasis)。
 *  - fromSavings(既定): 手取り(現在) - 毎月貯蓄×12 で逆算(本人の実態)
 *  - average: Notion の単身平均(assumptions.baseAnnualConsumptionYen)
 *  - explicit: サンドボックスで直接指定
 * いずれも現在価値で一定に保つ。実質昇給で増えた手取りは消費一定のため貯蓄へ回る
 * (= 生活水準は上げない前提。必要なら将来 consumptionBasis に成長率オプションを足す)。
 * ──────────────────────────────────────────────────────────────
 */
export function simulate(
  input: SimulationInput,
  scenario: Scenario,
  assumptions: Assumptions,
): SimulationResult {
  const { currentAge, retirementAge, endAge } = input;
  const baseConsumptionYen = resolveBaseConsumptionYen(input, assumptions);
  const housingPlan = input.housingPlan ?? { kind: '賃貸' };
  const currentRentYen = input.currentRentYen ?? 0;
  const retirementPartTimeYen = input.retirementPartTimeYen ?? 0;
  const realBaseUpRate = assumptions.realBaseUpRate ?? 0;
  const marriageIncrementYen = assumptions.marriageIncrementYen ?? 0;
  // 消費の年齢カーブは現在年齢=1.0 に正規化する(SPEC §3.3)
  const consumptionLevelAtCurrent = assumptions.consumptionLevelByAge(currentAge) || 1;

  const years: YearProjection[] = [];
  // 2ポット管理(案②): 現金 と 投資。総資産 = cashYen + investedYen。
  // 初期資産はすべて現金として持つ(既存の投資残高は v1 では扱わない)。
  let cashYen = input.currentAssetsYen;
  let investedYen = 0;

  for (let age = currentAge; age <= endAge; age++) {
    const retired = age >= retirementAge;

    // 1. 収入(額面 → 手取り)。実質昇給カーブ＋実質ベースアップで伸ばす。退職後は年金＋パート。
    const grossIncomeYen = retired
      ? 0
      : input.grossAnnualIncomeYen *
        assumptions.realIncomeCurve(age) *
        Math.pow(1 + realBaseUpRate, age - currentAge);
    const netIncomeYen = retired
      ? assumptions.pensionAnnualYen + retirementPartTimeYen
      : assumptions.grossToNetYen(grossIncomeYen);

    // 2. 基本消費 = 現在水準 × 年齢カーブ係数(現在年齢=1.0) − 家賃置換 ＋ 結婚増分(SPEC §3.3)
    const ageFactor = assumptions.consumptionLevelByAge(age) / consumptionLevelAtCurrent;
    let consumptionYen = baseConsumptionYen * ageFactor;
    const boughtHouse = housingPlan.kind === '購入' && age >= housingPlan.buyAge;
    if (boughtHouse) {
      consumptionYen -= currentRentYen; // 購入後は家賃が消える(家賃置換)
    }
    if (hasActiveSemantic(scenario.events, age, 'marriage')) {
      consumptionYen += marriageIncrementYen; // 結婚で世帯消費が増える
    }
    consumptionYen = Math.max(0, consumptionYen);

    // 3. イベント費用 ＋ 住居プランの費用(購入後のローン＋維持・頭金)
    const events = sumEventCosts(scenario.events, age);
    const housing = housingCostForYear(housingPlan, age);
    const eventAnnualYen = events.eventAnnualYen + housing.annualYen;
    const eventOneTimeYen = events.eventOneTimeYen + housing.oneTimeYen;
    const requestedInvestmentYen = sumAnnualInvestment(scenario.events, age);

    // 4. 投資ポット成長(期初残高に実質利回り。当年拠出分は翌年から運用)
    const investmentReturnYen = investedYen * assumptions.realInvestmentReturnRate;
    investedYen += investmentReturnYen;

    // 5. 当年の現金フロー(投資前)
    let yearCashYen = cashYen + netIncomeYen - consumptionYen - eventAnnualYen - eventOneTimeYen;

    // 6. 新規投資は現金が許す範囲だけ(借金して投資はしない)
    const annualInvestmentYen = Math.min(requestedInvestmentYen, Math.max(0, yearCashYen));
    yearCashYen -= annualInvestmentYen;
    investedYen += annualInvestmentYen;

    // 7. 現金が不足したら投資ポットを取り崩して充てる(投資を売却)
    let withdrawnYen = 0;
    if (yearCashYen < 0) {
      withdrawnYen = Math.min(-yearCashYen, investedYen);
      yearCashYen += withdrawnYen;
      investedYen -= withdrawnYen;
    }
    cashYen = yearCashYen; // 投資も尽きてなお負なら、現金マイナス=資金枯渇

    // 8. 純資産増減(振替・取り崩しは相殺されるので投資リターンだけが効く)
    const netFlowYen =
      netIncomeYen - consumptionYen - eventAnnualYen - eventOneTimeYen + investmentReturnYen;
    const assetsYen = cashYen + investedYen;

    years.push({
      age,
      grossIncomeYen,
      netIncomeYen,
      consumptionYen,
      eventAnnualYen,
      eventOneTimeYen,
      annualInvestmentYen,
      investmentReturnYen,
      withdrawnYen,
      investedYen,
      netFlowYen,
      assetsYen,
    });
  }

  const finalAssetsYen = cashYen + investedYen;
  const assetsAtRetirementYen =
    years.find((y) => y.age === retirementAge)?.assetsYen ?? finalAssetsYen;
  const assetsAtEndYen = years.at(-1)?.assetsYen ?? finalAssetsYen;

  return {
    years,
    assetsAtRetirementYen,
    assetsAtEndYen,
    // 体感変換: 退職時資産 ÷ 年間生活費 = 何年分
    retirementYearsOfLivingCost:
      baseConsumptionYen > 0 ? assetsAtRetirementYen / baseConsumptionYen : 0,
    depletionAge: years.find((y) => y.assetsYen < 0)?.age ?? null,
  };
}

/**
 * 基本消費(年額・現在価値)をレバーの設定から解決する。
 * - fromSavings(既定): 手取り(現在) − 毎月貯蓄×12。下限0でクランプ
 * - average: Notion の単身平均
 * - explicit: 直接指定
 */
function resolveBaseConsumptionYen(input: SimulationInput, assumptions: Assumptions): number {
  const basis = input.consumptionBasis ?? { kind: 'fromSavings' };
  switch (basis.kind) {
    case 'fromSavings': {
      const currentNetYen = assumptions.grossToNetYen(input.grossAnnualIncomeYen);
      return Math.max(0, currentNetYen - input.monthlySavingsYen * 12);
    }
    case 'average':
      return assumptions.baseAnnualConsumptionYen;
    case 'explicit':
      return Math.max(0, basis.annualYen);
  }
}

/**
 * その年齢(age)に発生するイベント費用を集計する。
 * - 毎年支出: startAge 以降ずっと加算(ADR: 終了年を持たない簡略化)
 * - 一回スポット: age === startAge の年だけ加算
 * 収入転換(退職→年金)・運用は simulate 側で扱うためここでは集計しない。
 */
function sumEventCosts(
  events: PlacedEvent[],
  age: number,
): { eventAnnualYen: number; eventOneTimeYen: number } {
  let eventAnnualYen = 0;
  let eventOneTimeYen = 0;

  for (const ev of events) {
    if (age < ev.startAge) continue;
    const count = ev.count ?? 1; // 頭数・人数(同時)。年額・一回費用に乗算
    const oneTime = (ev.oneTimeOverrideYen ?? ev.def.oneTimeYen ?? 0) * count;

    switch (ev.def.calcKind) {
      case '毎年支出':
      case '手入力': // 手入力も基本は毎年支出として扱う(海外居住等)。一回性のものは下で除外
        eventAnnualYen += effectiveAnnualYen(ev, age) * count;
        if (age === ev.startAge) eventOneTimeYen += oneTime;
        break;
      case '一回スポット':
        if (age === ev.startAge) eventOneTimeYen += oneTime;
        break;
      case '収入転換':
      case '運用':
        // simulate 側(収入/投資ポット)で扱うためここでは加算しない
        break;
    }
  }

  return { eventAnnualYen, eventOneTimeYen };
}

/**
 * イベントの当年の年額(円)を、終了年の扱いを反映して求める。優先順位:
 *  1. 案2 年別表(scheduleYen): 経過年 → 金額。配列長を超えたら0(子供など)
 *  2. 案1 継続年数(durationYears): 経過年 < 継続年数 なら年額、以降0(住宅ローン等)
 *  3. どちらも無ければ無期限(従来どおり年額が乗り続ける)
 * いずれも annualOverrideYen(手入力/サンドボックス上書き)を基準額として尊重する。
 */
function effectiveAnnualYen(ev: PlacedEvent, age: number): number {
  const offset = age - ev.startAge; // 経過年(0始まり)
  const schedule = ev.def.scheduleYen;
  if (schedule && schedule.length > 0) {
    return schedule[offset] ?? 0;
  }
  const base = ev.annualOverrideYen ?? ev.def.annualYen ?? 0;
  const duration = ev.def.durationYears;
  if (duration != null) {
    return offset < duration ? base : 0;
  }
  return base;
}

/**
 * 指定 semantic('marriage')のイベントが、その年齢で発動中(開始年齢以降)か。
 * 結婚増分は一度起きたら以降ずっと有効(終了年は持たない)。
 */
function hasActiveSemantic(events: PlacedEvent[], age: number, semantic: 'marriage'): boolean {
  return events.some((ev) => ev.def.semantic === semantic && age >= ev.startAge);
}

/**
 * 住居プランの当年費用(円)。'購入'のみ、購入年以降にローン＋維持(年額)と頭金(購入年の一回)が乗る。
 * '賃貸'/'持ち家' は base 消費で扱うためここでは 0。
 */
function housingCostForYear(
  plan: NonNullable<SimulationInput['housingPlan']>,
  age: number,
): { annualYen: number; oneTimeYen: number } {
  if (plan.kind !== '購入' || age < plan.buyAge) return { annualYen: 0, oneTimeYen: 0 };
  const offset = age - plan.buyAge;
  const withinLoan = plan.loanDurationYears == null || offset < plan.loanDurationYears;
  return {
    annualYen: withinLoan ? plan.annualCostYen : 0,
    oneTimeYen: age === plan.buyAge ? plan.downPaymentYen : 0,
  };
}

/**
 * その年齢(age)に投資ポットへ回す額(円)を集計する。
 * 計算区分が '運用' のイベントが startAge 以降アクティブな間、毎年 annualInvestmentYen を投じる。
 */
function sumAnnualInvestment(events: PlacedEvent[], age: number): number {
  let total = 0;
  for (const ev of events) {
    if (ev.def.calcKind !== '運用') continue;
    if (age < ev.startAge) continue;
    total += ev.annualInvestmentYen ?? 0;
  }
  return total;
}
