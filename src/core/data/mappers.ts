/**
 * スナップショット(Notion 前提値) → シミュレーションの型(Assumptions / LifeEventDef)への変換。
 * SPEC §6.1 のビルド時スナップショットを、純関数で simulate の入力に橋渡しする。
 */

import type { Assumptions, LifeEventDef } from '../simulation/types';
import type { EventRow, Snapshot } from './snapshot';

const MAN = 10000; // 万円 → 円

/** 万円(または null) → 円(または null) */
const manToYen = (man: number | null | undefined): number | null =>
  man == null ? null : Math.round(man * MAN);

/** 単調増加の (x, y) 点列を線形補間。範囲外は端でクランプ */
function interpolate(points: { x: number; y: number }[], x: number): number {
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts.length === 0) return 0;
  if (x <= pts[0].x) return pts[0].y;
  if (x >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
  }
  return pts[pts.length - 1].y;
}

/** 費用DB の行 → LifeEventDef(円ベース) */
export function toLifeEventDef(row: EventRow): LifeEventDef {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    calcKind: row.calcKind,
    annualYen: manToYen(row.annualMan),
    oneTimeYen: manToYen(row.oneTimeMan),
    durationYears: row.durationYears,
    scheduleYen: row.scheduleMan ? row.scheduleMan.map((m) => Math.round(m * MAN)) : undefined,
    semantic: row.semantic,
  };
}

/** イベントカタログ(id → LifeEventDef)。ユーザーが選んで PlacedEvent にする元 */
export function buildEventCatalog(s: Snapshot): Record<string, LifeEventDef> {
  const catalog: Record<string, LifeEventDef> = {};
  for (const row of s.events) catalog[row.id] = toLifeEventDef(row);
  return catalog;
}

/** スナップショット → Assumptions(すべて円・実質) */
export function buildAssumptions(s: Snapshot): Assumptions {
  // 昇給カーブ: 年齢 → 年収(円)。simulate 側で現在年齢=1.0 に正規化される
  const incomePoints = s.incomeCurve.map((p) => ({ x: p.age, y: p.incomeMan * MAN }));
  const realIncomeCurve = (age: number) => interpolate(incomePoints, age);

  // 消費年齢カーブ(単身): 年齢 → 月消費(円)。下限年齢のステップ関数(その年齢以下の最大バンド)
  const bands = [...s.consumptionByAge].sort((a, b) => a.fromAge - b.fromAge);
  const consumptionLevelByAge = (age: number) => {
    let level = bands[0]?.monthlyYen ?? 0;
    for (const b of bands) if (age >= b.fromAge) level = b.monthlyYen;
    return level;
  };

  // 手取り率: 額面年収(円) → 手取り(円)。額面を万円に直して率を補間
  const ratePoints = s.netRate.map((p) => ({ x: p.grossMan, y: p.netRatePct }));
  const grossToNetYen = (grossYen: number) => {
    const ratePct = interpolate(ratePoints, grossYen / MAN);
    return grossYen * (ratePct / 100);
  };

  return {
    realIncomeCurve,
    baseAnnualConsumptionYen: s.baseConsumptionSingleMan * MAN,
    consumptionLevelByAge,
    realInvestmentReturnRate: s.realReturnRatePct / 100,
    kaigoInsuranceRateOver40: s.kaigoSelfRatePct / 100,
    realBaseUpRate: 0,
    marriageIncrementYen: (s.monthlyConsumptionCoupleYen - s.monthlyConsumptionSingleYen) * 12,
    grossToNetYen,
    pensionKokuminAnnualYen: s.pensionKokuminMan * MAN,
    pensionKoseiAnnualYen: s.pensionKoseiMan * MAN,
    minimumLivingCostRetirementYen: s.minLivingRetirementMonthlyYen * 12,
  };
}
