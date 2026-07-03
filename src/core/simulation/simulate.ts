import { predictedLifeAge } from '../data/life-expectancy';
import type {
  Assumptions,
  PlacedEvent,
  Scenario,
  SimulationInput,
  SimulationResult,
  SpendDownOutput,
  YearProjection,
} from './types';

/** 退職年齢の既定値 */
export const DEFAULT_RETIREMENT_AGE = 65;

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
  // headroomEvalOnly: 閉じた式(retirement)だけ必要な再帰評価(許可ソルバ)向けに、
  // 退職後チャートと使い切り二分探索を省略する内部オプション。spendDown と退職後の years は計算されない
  opts: { headroomEvalOnly?: boolean } = {},
): SimulationResult {
  const { currentAge, retirementAge } = input;
  // 予測寿命＝グラフのゴール(ADR: 20260703-spend-down-projection)。死ぬ年齢は入力せず統計から予測
  const lifeAge = predictedLifeAge(currentAge, input.sex, retirementAge, input.baseCalendarYear);
  const yearsInRetirement = lifeAge - retirementAge;
  // 閉じた式の N は未指定なら「退職〜予測寿命」＝残りの年数で割る
  const N = input.yearsToSpendSavings ?? yearsInRetirement;
  const baseConsumptionYen = resolveBaseConsumptionYen(input, assumptions);
  const housingPlan = input.housingPlan ?? { kind: '賃貸' };
  const currentRentYen = input.currentRentYen ?? 0;
  const realBaseUpRate = assumptions.realBaseUpRate ?? 0;
  const marriageIncrementYen = assumptions.marriageIncrementYen ?? 0;
  // 年齢カーブは現在年齢=1.0 に正規化する(消費・収入とも。SPEC §3.3)
  const consumptionLevelAtCurrent = assumptions.consumptionLevelByAge(currentAge) || 1;
  const incomeLevelAtCurrent = assumptions.realIncomeCurve(currentAge) || 1;

  const years: YearProjection[] = [];
  // 2ポット管理: 現金 と 投資。総資産 = cashYen + investedYen。初期資産はすべて現金。
  let cashYen = input.currentAssetsYen;
  let investedYen = 0;

  // 現役の年次ループ: 現在年齢 → 退職年齢の前年まで(SPEC §4.2)。退職後は §4.3 の閉じた式へ
  for (let age = currentAge; age < retirementAge; age++) {
    // 1. 収入(額面 → 手取り)。実質昇給カーブ＋実質ベースアップで伸ばす
    const grossIncomeYen =
      input.grossAnnualIncomeYen *
      (assumptions.realIncomeCurve(age) / incomeLevelAtCurrent) *
      Math.pow(1 + realBaseUpRate, age - currentAge);
    let netIncomeYen = assumptions.grossToNetYen(grossIncomeYen);
    // 手取り率表は40歳未満前提。40歳以上は介護保険(本人分)を追加控除
    if (age >= 40) netIncomeYen -= grossIncomeYen * (assumptions.kaigoInsuranceRateOver40 ?? 0);

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

    // 2.5 固定費(必須分): 住居費 ＋ (非住居消費 × 必須比率)。consumptionとの差が「自由に使えるお金」
    const fixedCostYen = fixedCostForYear(
      consumptionYen,
      housingPlan,
      currentRentYen,
      age,
      assumptions.necessityRatioOfNonHousing,
    );

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
      fixedCostYen,
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

  // 退職時貯蓄(現役ループ最終の総資産)
  const assetsAtRetirementYen = cashYen + investedYen;

  // 退職後(N年レバー・閉じた式。SPEC §4.3。死ぬ年齢は入力しない)
  const pensionAnnualYen =
    input.pensionType === '国民年金のみ'
      ? assumptions.pensionKokuminAnnualYen
      : assumptions.pensionKoseiAnnualYen;
  const partTimeAnnualYen = input.retirementPartTimeYen ?? 0;
  const minimumLivingCostAnnualYen = assumptions.minimumLivingCostRetirementYen;

  // 使い切りビュー: 「予測寿命でちょうど使い切る年間支出額」を二分探索で解く。
  // 支出を増やすほど寿命時点の資産は単調に減るので、終端資産 ≥ 0 を保つ最大の支出が解。
  // 年金＋パート・退職後イベント・投資ポットの運用益をすべて含めたまま解ける
  let annualSpendableYen = 0;
  let mode: SpendDownOutput['mode'] = 'shortage';
  if (!opts.headroomEvalOnly) {
    const retireIncomeYen = pensionAnnualYen + partTimeAnnualYen;
    const finalAssetsAt = (annualSpendYen: number): number =>
      projectRetirement({
        cashYen,
        investedYen,
        retirementAge,
        endAge: lifeAge,
        netIncomeYen: retireIncomeYen,
        consumptionYen: annualSpendYen,
        fixedCostYen: Math.min(annualSpendYen, minimumLivingCostAnnualYen),
        events: scenario.events,
        returnRate: assumptions.realInvestmentReturnRate,
        stopWhenDepleted: false,
        collectYears: false, // 探索中は終端資産だけ要る(年次配列の生成を省いて GC 圧を抑える)
      }).finalAssetsYen;
    let spendLo = 0;
    let spendHi = pensionAnnualYen + partTimeAnnualYen + Math.max(assetsAtRetirementYen, 1);
    for (let i = 0; i < 20 && finalAssetsAt(spendHi) >= 0; i++) spendHi *= 2;
    // 40回で区間は 2^40 分の1 ≒ 円未満の精度(表示は千円/万円丸め)
    for (let i = 0; i < 40; i++) {
      const mid = (spendLo + spendHi) / 2;
      if (finalAssetsAt(mid) >= 0) spendLo = mid;
      else spendHi = mid;
    }
    annualSpendableYen = spendLo;
    mode = annualSpendableYen >= minimumLivingCostAnnualYen ? 'spendDown' : 'shortage';

    // 退職後の資産推移(チャート用)。2モード:
    //  - spendDown: 使い切りペースで支出し、予測寿命でちょうどゼロに着地する線
    //  - shortage: 従来どおり最低生活費で取り崩し、資金が尽きる年で打ち切る(尽きる年を1つ見せる)
    const retire = projectRetirement({
      cashYen,
      investedYen,
      retirementAge,
      endAge: lifeAge,
      netIncomeYen: retireIncomeYen,
      consumptionYen: mode === 'spendDown' ? annualSpendableYen : minimumLivingCostAnnualYen,
      // 固定費(必須分)は最低生活費まで。spendDown では消費との差が「自由に使えるお金」になる
      fixedCostYen: Math.min(
        mode === 'spendDown' ? annualSpendableYen : minimumLivingCostAnnualYen,
        minimumLivingCostAnnualYen,
      ),
      events: scenario.events,
      returnRate: assumptions.realInvestmentReturnRate,
      stopWhenDepleted: mode === 'shortage',
    });
    years.push(...retire.years);
  }

  // 退職後に置いたイベント(介護・大病等)は退職時貯蓄から先に差し引く
  const retirementEventsCostYen = sumRetirementEventsCost(scenario.events, retirementAge, N);
  const savingsForRetirementYen = assetsAtRetirementYen - retirementEventsCostYen;
  const savingsPerYearYen = N > 0 ? savingsForRetirementYen / N : 0;
  const annualFreeSpendingYen =
    pensionAnnualYen + partTimeAnnualYen + savingsPerYearYen - minimumLivingCostAnnualYen;

  return {
    years,
    assetsAtRetirementYen,
    // 体感変換: 退職時貯蓄 ÷ 年間生活費 = 何年分
    retirementYearsOfLivingCost:
      baseConsumptionYen > 0 ? assetsAtRetirementYen / baseConsumptionYen : 0,
    retirement: {
      pensionAnnualYen,
      partTimeAnnualYen,
      minimumLivingCostAnnualYen,
      yearsN: N,
      retirementEventsCostYen,
      savingsPerYearYen,
      annualFreeSpendingYen,
    },
    spendDown: {
      mode,
      predictedLifeAge: lifeAge,
      yearsInRetirement,
      annualSpendableYen,
    },
  };
}

/**
 * 退職後の年次推移(retirementAge → endAge)。毎年 consumptionYen を使い、年金等 netIncomeYen で賄い、
 * 不足は投資ポット→現金の順で取り崩す。stopWhenDepleted なら資産がマイナスになった年で打ち切る(1年見せる)。
 * 使い切り額の二分探索(終端資産の評価)と、チャート用の本描画の両方から呼ぶ純関数。
 */
function projectRetirement(opts: {
  cashYen: number;
  investedYen: number;
  retirementAge: number;
  endAge: number;
  netIncomeYen: number;
  consumptionYen: number;
  fixedCostYen: number;
  events: PlacedEvent[];
  returnRate: number;
  stopWhenDepleted: boolean;
  /** false で年次配列の生成を省略(終端資産だけ要る二分探索用)。既定 true */
  collectYears?: boolean;
}): { years: YearProjection[]; finalAssetsYen: number } {
  let cashYen = opts.cashYen;
  let investedYen = opts.investedYen;
  const collectYears = opts.collectYears ?? true;
  const years: YearProjection[] = [];
  let finalAssetsYen = cashYen + investedYen;
  for (let age = opts.retirementAge; age <= opts.endAge; age++) {
    const ev = sumEventCosts(opts.events, age);
    const investmentReturnYen = investedYen * opts.returnRate;
    investedYen += investmentReturnYen;
    let yearCashYen =
      cashYen + opts.netIncomeYen - opts.consumptionYen - ev.eventAnnualYen - ev.eventOneTimeYen;
    let withdrawnYen = 0;
    if (yearCashYen < 0) {
      withdrawnYen = Math.min(-yearCashYen, investedYen);
      yearCashYen += withdrawnYen;
      investedYen -= withdrawnYen;
    }
    cashYen = yearCashYen;
    const assetsYen = cashYen + investedYen;
    if (collectYears) {
      years.push({
        age,
        grossIncomeYen: opts.netIncomeYen, // 退職後の年収＝年金＋パート（v1は年金非課税扱いで額面≈手取り）
        netIncomeYen: opts.netIncomeYen,
        consumptionYen: opts.consumptionYen,
        fixedCostYen: opts.fixedCostYen,
        eventAnnualYen: ev.eventAnnualYen,
        eventOneTimeYen: ev.eventOneTimeYen,
        annualInvestmentYen: 0,
        investmentReturnYen,
        withdrawnYen,
        investedYen,
        netFlowYen:
          opts.netIncomeYen - opts.consumptionYen - ev.eventAnnualYen - ev.eventOneTimeYen + investmentReturnYen,
        assetsYen,
      });
    }
    finalAssetsYen = assetsYen;
    if (opts.stopWhenDepleted && assetsYen < 0) break;
  }
  return { years, finalAssetsYen };
}

/**
 * 「今の生活に月いくらまで上乗せできるか」(円/月)を解く。SPEC §5.6 の核＝"今を楽しむ許可"。
 *
 * 不安で過剰節約する本人に返すべきは「退職後いくら」ではなく「今、毎月いくら増やして使ってよいか」。
 * 現役期の毎月支出を Δ 増やしても退職後の最低生活が守れる(annualFreeSpendingYen ≥ 0)上限 Δ を、
 * simulate を再評価しながら二分探索で求める(モデルは変えない)。基準消費の出どころ
 * (fromSavings/average/explicit)に依らず、解決後の年額に上乗せ分を足して評価する。
 *
 * 戻り値は月額(円)。既に退職後が最低生活すら賄えない(余裕<0)場合は 0(=今は上乗せ余地なし→打ち手側へ)。
 */
export function solvePresentMonthlyHeadroomYen(
  input: SimulationInput,
  scenario: Scenario,
  assumptions: Assumptions,
): number {
  // 現役期間が無い(すでに退職)/ 貯蓄を使う年数 N<=0 だと、退職後の自由支出が「今の支出」に依存せず
  // 解が定まらない(freeAt が一定)。二分探索が成立しないので、上乗せ余地は出さない(0)。
  // (N 未指定は「退職〜予測寿命」で常に 1 以上なので、明示指定の 0 以下だけ弾く)
  const N = input.yearsToSpendSavings;
  if (input.currentAge >= input.retirementAge || (N != null && N <= 0)) return 0;

  const baseAnnualYen = resolveBaseConsumptionYen(input, assumptions);
  const freeAt = (extraAnnualYen: number): number =>
    simulate(
      { ...input, consumptionBasis: { kind: 'explicit', annualYen: baseAnnualYen + extraAnnualYen } },
      scenario,
      assumptions,
      // 閉じた式(retirement)しか読まないので、退職後チャートと使い切り探索は省略(スライダー操作の体感速度に直結)
      { headroomEvalOnly: true },
    ).retirement.annualFreeSpendingYen;

  if (freeAt(0) < 0) return 0; // 既に退職後が不足 → 今は上乗せ余地なし

  // 余裕が負に転じる上乗せ額(hi)を探す。手取り or 基準消費を足場に、足りなければ倍々で拡張(上限ガード)
  let hi = Math.max(assumptions.grossToNetYen(input.grossAnnualIncomeYen), baseAnnualYen, 1);
  for (let i = 0; i < 40 && freeAt(hi) >= 0; i++) hi *= 2;
  // 40回倍にしても負にならない＝今の支出にほぼ非依存。天文学的な値を返さず 0 にする(ブラケット不成立)。
  if (freeAt(hi) >= 0) return 0;

  // 二分探索: free ≥ 0 を保つ最大の上乗せ年額
  let lo = 0;
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    if (freeAt(mid) >= 0) lo = mid;
    else hi = mid;
  }
  return lo / 12; // 月額(円)に変換
}

/**
 * 退職後(startAge >= retirementAge)に置いたイベントの総コスト(円)。退職時貯蓄から先に差し引く(SPEC §4.3)。
 * 毎年支出/手入力は 年額×継続年数(無期限なら N 年分)＋初期費用、一回スポットは初期費用。収入転換・運用は除く。
 */
function sumRetirementEventsCost(events: PlacedEvent[], retirementAge: number, N: number): number {
  let total = 0;
  for (const ev of events) {
    if (ev.startAge < retirementAge) continue;
    const count = ev.count ?? 1;
    const oneTime = (ev.oneTimeOverrideYen ?? ev.def.oneTimeYen ?? 0) * count;
    switch (ev.def.calcKind) {
      case '一回スポット':
        total += oneTime;
        break;
      case '毎年支出':
      case '手入力': {
        const schedule = ev.def.scheduleYen;
        let annualTotal: number;
        if (schedule && schedule.length > 0) {
          annualTotal = schedule.reduce((a, b) => a + b, 0) * count;
        } else {
          const annual = (ev.annualOverrideYen ?? ev.def.annualYen ?? 0) * count;
          const yearsRun = ev.def.durationYears ?? N; // 無期限は退職後 N 年分とみなす
          annualTotal = annual * yearsRun;
        }
        total += oneTime + annualTotal;
        break;
      }
      case '収入転換':
      case '運用':
        break;
    }
  }
  return total;
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
      // 全年齢平均でなく、現在年齢に対応する単身平均(年代別カーブ)を基準にする(二重計上回避)
      return assumptions.consumptionLevelByAge(input.currentAge) * 12;
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
 * その年の基本消費(consumptionYen)を「必須(固定費)」と「自由」に割り、固定費分を返す(ADR: 固定費線)。
 *   固定費 = 住居費(消費に含まれる家賃) ＋ (基本消費 − 住居費) × 必須比率
 * 住居費の扱い(二重計上回避):
 *   - 賃貸: 家賃は consumptionYen に含まれる → currentRentYen を住居費分とする
 *   - 購入: 購入前は家賃あり、購入後は consumptionYen から家賃が除かれる(=住居費分0。ローンはイベント側)
 *   - 持ち家: 家賃なし(住居費分0)
 * 自由に使えるお金 = consumptionYen − 固定費。
 */
function fixedCostForYear(
  consumptionYen: number,
  plan: NonNullable<SimulationInput['housingPlan']>,
  currentRentYen: number,
  age: number,
  necessityRatio: number,
): number {
  let housingInsideYen: number;
  switch (plan.kind) {
    case '賃貸':
      housingInsideYen = currentRentYen;
      break;
    case '購入':
      housingInsideYen = age < plan.buyAge ? currentRentYen : 0;
      break;
    case '持ち家':
      housingInsideYen = 0;
      break;
  }
  housingInsideYen = Math.min(Math.max(0, housingInsideYen), consumptionYen);
  const nonHousingYen = consumptionYen - housingInsideYen;
  return housingInsideYen + nonHousingYen * necessityRatio;
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
