/**
 * シミュレーション核の純粋関数テスト（node:test + node:assert・ランナー非依存）。
 * 実行例: `node --import tsx --test src/core/simulation/simulate.test.ts`
 * 対象: 固定費分解(fixedCostYen) と「今の許可」ソルバ(solvePresentMonthlyHeadroomYen)。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { predictedLifeAge } from '../data/life-expectancy';
import { buildAssumptions } from '../data/mappers';
import { SNAPSHOT } from '../data/snapshot';
import { simulate, solvePresentMonthlyHeadroomYen } from './simulate';
import type { Scenario, SimulationInput } from './types';

const MAN = 10000;
const assumptions = buildAssumptions(SNAPSHOT);
const emptyScenario: Scenario = { id: 't', name: 'test', events: [] };

/** 標準ペルソナ(賃貸・年収500・資産200・月22万支出・家賃8万)。基準年は固定して結果を安定させる */
function baseInput(over: Partial<SimulationInput> = {}): SimulationInput {
  return {
    currentAge: 28,
    grossAnnualIncomeYen: 500 * MAN,
    currentAssetsYen: 200 * MAN,
    monthlySavingsYen: 0,
    retirementAge: 65,
    pensionType: '厚生年金',
    yearsToSpendSavings: 30,
    baseCalendarYear: 2026,
    consumptionBasis: { kind: 'explicit', annualYen: 22 * 12 * MAN },
    currentRentYen: 8 * 12 * MAN,
    housingPlan: { kind: '賃貸' },
    ...over,
  };
}

test('固定費は 0 以上 消費以下（賃貸・現役）', () => {
  const r = simulate(baseInput(), emptyScenario, assumptions);
  const working = r.years.filter((y) => y.age < 65);
  assert.ok(working.length > 0);
  for (const y of working) {
    assert.ok(y.fixedCostYen >= 0, `age ${y.age}: fixed<0`);
    assert.ok(y.fixedCostYen <= y.consumptionYen + 1, `age ${y.age}: fixed>消費`);
    // 賃貸は家賃が固定費の下限（家賃 ≤ 固定費）
    assert.ok(y.fixedCostYen >= 8 * 12 * MAN - 1, `age ${y.age}: fixed<家賃`);
  }
});

test('退職後の固定費＝最低生活費（使い切りモードでは消費との差が自由に使えるお金）', () => {
  const r = simulate(baseInput(), emptyScenario, assumptions);
  const minLiving = assumptions.minimumLivingCostRetirementYen;
  for (const y of r.years.filter((y) => y.age >= 65)) {
    assert.ok(y.fixedCostYen <= y.consumptionYen + 1, `age ${y.age}: fixed>消費`);
    assert.ok(y.fixedCostYen <= minLiving + 1, `age ${y.age}: fixed>最低生活費`);
  }
});

test('予測寿命: 男<女・未回答は男女平均・退職を遅らすと寿命の伸びも増える', () => {
  // 30歳・退職65歳・基準2026年: 平均余命(令和6年簡易生命表) + 伸び(社人研中位)×(2061-2024)
  assert.equal(predictedLifeAge(30, '男性', 65, 2026), 85);
  assert.equal(predictedLifeAge(30, '女性', 65, 2026), 91);
  assert.equal(predictedLifeAge(30, undefined, 65, 2026), 88);
  // 退職が遅いほど「退職を迎える年」が先になり、織り込む伸びが増える(単調非減少)
  assert.ok(predictedLifeAge(30, '男性', 80, 2026) >= predictedLifeAge(30, '男性', 50, 2026));
});

test('使い切りモード: 標準ペルソナは寿命でちょうどゼロ着地する使い切り線になる', () => {
  const r = simulate(baseInput(), emptyScenario, assumptions);
  const sd = r.spendDown;
  assert.equal(sd.mode, 'spendDown');
  assert.ok(sd.annualSpendableYen >= assumptions.minimumLivingCostRetirementYen, '使い切り額<最低生活費');
  // グラフの終端＝予測寿命、終端資産はほぼゼロ(使い切り)
  const last = r.years[r.years.length - 1];
  assert.equal(last.age, sd.predictedLifeAge);
  assert.ok(last.assetsYen >= 0 && last.assetsYen < 1000, `終端資産がゼロ近傍でない: ${last.assetsYen}`);
  // 退職後の消費線＝使い切りペース
  for (const y of r.years.filter((y) => y.age >= 65)) {
    assert.ok(Math.abs(y.consumptionYen - sd.annualSpendableYen) < 1, `age ${y.age}: 消費が使い切り額でない`);
  }
});

test('不足モード: 使い切りペースが最低生活費未満なら従来の枯渇ビューに切り替わる', () => {
  const input = baseInput({
    grossAnnualIncomeYen: 250 * MAN,
    currentAssetsYen: 0,
    consumptionBasis: { kind: 'explicit', annualYen: 24 * 12 * MAN },
    pensionType: '国民年金のみ',
  });
  const r = simulate(input, emptyScenario, assumptions);
  const sd = r.spendDown;
  assert.equal(sd.mode, 'shortage');
  assert.ok(sd.annualSpendableYen < assumptions.minimumLivingCostRetirementYen);
  // 従来どおり最低生活費で取り崩し、尽きる年を1つ見せて打ち切る
  const retired = r.years.filter((y) => y.age >= 65);
  for (const y of retired) assert.equal(y.consumptionYen, assumptions.minimumLivingCostRetirementYen);
  const last = r.years[r.years.length - 1];
  assert.ok(last.assetsYen < 0, '枯渇の年で終わっていない');
  assert.ok(last.age <= sd.predictedLifeAge);
});

test('使い切り額は資産が多いほど増える(単調性)', () => {
  const lo = simulate(baseInput({ currentAssetsYen: 100 * MAN }), emptyScenario, assumptions).spendDown.annualSpendableYen;
  const hi = simulate(baseInput({ currentAssetsYen: 2000 * MAN }), emptyScenario, assumptions).spendDown.annualSpendableYen;
  assert.ok(hi > lo, `hi=${hi} lo=${lo}`);
});

test('固定費＝住居費＋(非住居×0.55) を満たす（賃貸・初年度）', () => {
  const r = simulate(baseInput(), emptyScenario, assumptions);
  const y0 = r.years[0];
  const rent = 8 * 12 * MAN;
  const expected = rent + (y0.consumptionYen - rent) * SNAPSHOT.necessityRatioOfNonHousing;
  assert.ok(Math.abs(y0.fixedCostYen - expected) < 1, `fixed=${y0.fixedCostYen} expected=${expected}`);
});

test('今の許可: 標準ペルソナは上乗せ余地>0、上乗せ後に退職後余裕が概ね0へ収束', () => {
  const input = baseInput();
  const head = solvePresentMonthlyHeadroomYen(input, emptyScenario, assumptions);
  assert.ok(head > 0, '上乗せ余地が0');
  // 上乗せ後の退職後 自由支出は 0 近傍（境界）に来る
  const after = simulate(
    { ...input, consumptionBasis: { kind: 'explicit', annualYen: 22 * 12 * MAN + Math.round(head) * 12 } },
    emptyScenario,
    assumptions,
  );
  const freeAfter = after.retirement.annualFreeSpendingYen;
  assert.ok(Math.abs(freeAfter) < 5 * MAN, `境界に収束せず free=${freeAfter}`);
});

test('今の許可: 退職後が既に不足なら 0（打ち手側へ）', () => {
  // 低収入×高支出で退職後が最低生活を賄えない状況を作る
  const input = baseInput({
    grossAnnualIncomeYen: 250 * MAN,
    currentAssetsYen: 0,
    consumptionBasis: { kind: 'explicit', annualYen: 24 * 12 * MAN },
    pensionType: '国民年金のみ',
  });
  const base = simulate(input, emptyScenario, assumptions);
  assert.ok(base.retirement.annualFreeSpendingYen < 0, '前提: 退職後不足のはず');
  const head = solvePresentMonthlyHeadroomYen(input, emptyScenario, assumptions);
  assert.equal(head, 0);
});

test('今の許可: 退化入力（既退職・N=0・現役期間なし）でも天文学的な値を返さず0に丸める', () => {
  // 退職後の自由支出が「今の支出」に依存しない＝二分探索がブラケットできないケース。
  const cases: [string, ReturnType<typeof baseInput>][] = [
    ['既退職(65→65)', baseInput({ currentAge: 65, retirementAge: 65 })],
    ['現役期間なし(70→65)', baseInput({ currentAge: 70, retirementAge: 65 })],
    ['N=0', baseInput({ yearsToSpendSavings: 0 })],
  ];
  for (const [label, input] of cases) {
    const head = solvePresentMonthlyHeadroomYen(input, emptyScenario, assumptions);
    assert.equal(head, 0, `${label}: 0 のはずが ${head}`);
  }
});

test('今の許可: 収入が高いほど上乗せ余地が増える（単調性）', () => {
  const lo = solvePresentMonthlyHeadroomYen(baseInput({ grossAnnualIncomeYen: 400 * MAN }), emptyScenario, assumptions);
  const hi = solvePresentMonthlyHeadroomYen(baseInput({ grossAnnualIncomeYen: 700 * MAN }), emptyScenario, assumptions);
  assert.ok(hi > lo, `hi=${hi} lo=${lo}`);
});
