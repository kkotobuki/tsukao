/**
 * 予測寿命(グラフの終端)の前提値と計算。ADR: 20260703-spend-down-projection。
 *
 * 「死ぬ年齢は入力しない」方針は維持し、統計から予測する:
 *   予測寿命 = 現在年齢 + 平均余命(現在年齢・性別) + 寿命の伸び率 × (退職を迎える年 − 生命表の年)
 * 静的な平均寿命でなく「その人が退職を迎える頃の平均寿命」を近似する(コホート寿命の簡易近似)。
 * 性別が未回答なら男女平均を使う。
 *
 * 出所:
 * - 平均余命: 厚労省 令和6(2024)年簡易生命表 表1「主な年齢の平均余命」(5歳刻み・線形補間)
 * - 寿命の伸び: 国立社会保障・人口問題研究所「日本の将来推計人口(令和5年推計)」死亡中位仮定
 *   平均寿命 2020年 男81.56/女87.71 → 2070年 男85.89/女91.94 ⇒ 年あたり 男+0.087年・女+0.085年
 */

import type { Sex } from '../simulation/types';
import { interpolate } from './mappers';

/** 平均余命テーブルの基準年(令和6年簡易生命表) */
const TABLE_YEAR = 2024;

/** 主な年齢の平均余命(年)。令和6年簡易生命表 表1 */
const REMAINING_YEARS: { age: number; male: number; female: number }[] = [
  { age: 0, male: 81.09, female: 87.13 },
  { age: 5, male: 76.29, female: 82.34 },
  { age: 10, male: 71.32, female: 77.37 },
  { age: 15, male: 66.36, female: 72.41 },
  { age: 20, male: 61.44, female: 67.48 },
  { age: 25, male: 56.58, female: 62.58 },
  { age: 30, male: 51.71, female: 57.67 },
  { age: 35, male: 46.85, female: 52.76 },
  { age: 40, male: 42.03, female: 47.88 },
  { age: 45, male: 37.26, female: 43.03 },
  { age: 50, male: 32.57, female: 38.24 },
  { age: 55, male: 28.01, female: 33.54 },
  { age: 60, male: 23.63, female: 28.92 },
  { age: 65, male: 19.47, female: 24.38 },
  { age: 70, male: 15.6, female: 19.97 },
  { age: 75, male: 12.08, female: 15.75 },
  { age: 80, male: 8.96, female: 11.83 },
  { age: 85, male: 6.31, female: 8.37 },
  { age: 90, male: 4.27, female: 5.55 },
];

/** 平均寿命の年あたりの伸び(社人研 令和5年推計・死亡中位: 2020→2070 の線形換算) */
const IMPROVEMENT_PER_YEAR = {
  male: (85.89 - 81.56) / 50,
  female: (91.94 - 87.71) / 50,
};

/** 予測寿命の上限。統計の外挿が効きすぎないための安全弁 */
const MAX_LIFE_AGE = 105;

/** 性別(未回答=undefined)に応じた値。未回答は男女平均 */
function bySex(sex: Sex | undefined, male: number, female: number): number {
  if (sex === '男性') return male;
  if (sex === '女性') return female;
  return (male + female) / 2;
}

/**
 * 予測寿命(歳)。グラフの終端・使い切り計算の分母に使う。
 * @param baseYear 試算の基準年(西暦)。既定は実行時の年。テストでは固定する
 */
export function predictedLifeAge(
  currentAge: number,
  sex: Sex | undefined,
  retirementAge: number,
  baseYear: number = new Date().getFullYear(),
): number {
  const remaining = bySex(
    sex,
    interpolate(REMAINING_YEARS.map((r) => ({ x: r.age, y: r.male })), currentAge),
    interpolate(REMAINING_YEARS.map((r) => ({ x: r.age, y: r.female })), currentAge),
  );
  // 「退職を迎える年」時点まで寿命の伸びを織り込む(既退職なら基準年まで)
  const retirementYear = baseYear + Math.max(0, retirementAge - currentAge);
  const growth =
    bySex(sex, IMPROVEMENT_PER_YEAR.male, IMPROVEMENT_PER_YEAR.female) *
    Math.max(0, retirementYear - TABLE_YEAR);
  const lifeAge = Math.round(currentAge + remaining + growth);
  // 退職後が最低1年はある形に丸める(退職の翌年より前には死なない扱い)
  return Math.min(MAX_LIFE_AGE, Math.max(retirementAge + 1, lifeAge));
}
