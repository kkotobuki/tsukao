/**
 * Notion 前提値のビルド時スナップショット(2026-06 時点)。
 * SPEC §6.1: アプリは実行時に Notion を読まず、この同梱データを使う。
 * 本来は Notion API から再生成する(TODO: scripts/generate-snapshot)。値は Notion の各 DB に対応。
 *
 * 金額は Notion 表示に合わせ「万円」で持つ。円への変換(×10000)はマッパ(mappers.ts)で行う。
 */

import type { CalcKind } from '../simulation/types';

/** ライフイベント費用DB の1行 */
export interface EventRow {
  id: string;
  name: string;
  category: string;
  calcKind: CalcKind;
  annualMan: number | null; // 年額(万円)
  oneTimeMan: number | null; // 初期費用(万円)
  durationYears: number | null; // 継続年数(空=無期限)
  scheduleMan?: number[]; // 年別表(万円・経過年0始まり)。子供のみ
  semantic?: 'marriage'; // 結婚=世帯消費増分のトリガ
}

export interface Snapshot {
  /** ライフイベント別 年額コスト(前提値) */
  events: EventRow[];
  /** スカラー前提値(シミュレーション) */
  baseConsumptionSingleMan: number; // 単身 基本消費(万円/年)
  monthlyConsumptionSingleYen: number; // 単身 月消費(円)
  monthlyConsumptionCoupleYen: number; // 夫婦のみ 月消費(円)
  realReturnRatePct: number; // 実質運用利回り(%)
  kaigoSelfRatePct: number; // 介護保険(本人分)率(%)。40歳以上に追加控除。1.62%の折半≈0.81%
  pensionKoseiMan: number; // 厚生年金 平均(万円/年)
  pensionKokuminMan: number; // 国民年金 平均(万円/年)
  minLivingRetirementMonthlyYen: number; // 退職後の最低生活費(円/月)。SPEC §3.7
  defaultRetirementAge: number;
  defaultEndAge: number;
  /** 昇給カーブ: 代表年齢 → 年収(万円) */
  incomeCurve: { age: number; incomeMan: number }[];
  /** 手取り率: 額面年収(万円) → 手取り率(%) */
  netRate: { grossMan: number; netRatePct: number }[];
  /** 消費年齢カーブ(単身): 年齢帯の下限 → 月消費(円)。SPEC §3.3 C-1 */
  consumptionByAge: { fromAge: number; monthlyYen: number }[];
}

export const SNAPSHOT: Snapshot = {
  events: [
    { id: 'marriage', name: '結婚', category: '家族・関係', calcKind: '一回スポット', annualMan: 0, oneTimeMan: 454, durationYears: null, semantic: 'marriage' },
    { id: 'divorce', name: '離婚', category: '家族・関係', calcKind: '毎年支出', annualMan: 49, oneTimeMan: null, durationYears: 18 },
    { id: 'child', name: '子供(1人あたり)', category: '家族・関係', calcKind: '毎年支出', annualMan: 120, oneTimeMan: null, durationYears: 22,
      scheduleMan: [90, 90, 90, 100, 100, 100, 100, 100, 100, 100, 100, 100, 120, 120, 120, 130, 130, 130, 140, 140, 140, 140] },
    { id: 'parentcare', name: '親の介護', category: '家族・関係', calcKind: '毎年支出', annualMan: 63.6, oneTimeMan: 47.2, durationYears: 5 },
    { id: 'pet_dog', name: 'ペット飼育(犬)', category: '家族・関係', calcKind: '毎年支出', annualMan: 41.4, oneTimeMan: null, durationYears: 15 },
    { id: 'pet_cat', name: 'ペット飼育(猫)', category: '家族・関係', calcKind: '毎年支出', annualMan: 17.8, oneTimeMan: null, durationYears: 15 },
    { id: 'house', name: '住宅購入(持ち家)', category: '住まい・モノ', calcKind: '毎年支出', annualMan: 40, oneTimeMan: 620, durationYears: 35 },
    { id: 'move', name: '住み替え・引っ越し', category: '住まい・モノ', calcKind: '手入力', annualMan: null, oneTimeMan: 10, durationYears: null },
    { id: 'car', name: '自動車購入・保有', category: '住まい・モノ', calcKind: '毎年支出', annualMan: 16.7, oneTimeMan: null, durationYears: null },
    { id: 'second_house', name: 'セカンドハウス・別荘', category: '住まい・モノ', calcKind: '毎年支出', annualMan: 50, oneTimeMan: null, durationYears: null },
    { id: 'study', name: '学び直し・資格・大学院', category: '自分への支出', calcKind: '毎年支出', annualMan: 65, oneTimeMan: null, durationYears: 2 },
    { id: 'hobby', name: '特定の趣味(追加分)', category: '自分への支出', calcKind: '手入力', annualMan: null, oneTimeMan: null, durationYears: null },
    { id: 'insurance', name: '保険加入', category: '自分への支出', calcKind: '毎年支出', annualMan: 35.3, oneTimeMan: null, durationYears: null },
    { id: 'beauty', name: '特定の美容・整形(追加分)', category: '自分への支出', calcKind: '手入力', annualMan: null, oneTimeMan: null, durationYears: null },
    { id: 'invest', name: '投資・資産運用', category: 'お金', calcKind: '運用', annualMan: null, oneTimeMan: null, durationYears: null },
    { id: 'overseas', name: '海外居住', category: '老後・移動', calcKind: '手入力', annualMan: null, oneTimeMan: null, durationYears: null },
    { id: 'retire', name: '退職', category: '老後・移動', calcKind: '収入転換', annualMan: 181, oneTimeMan: 1896, durationYears: null },
    { id: 'care_home', name: '介護施設への入居', category: '老後・移動', calcKind: '毎年支出', annualMan: 180, oneTimeMan: null, durationYears: 5 },
    { id: 'illness', name: '大病・長期療養', category: '自分への支出', calcKind: '一回スポット', annualMan: 0, oneTimeMan: 150, durationYears: null },
  ],
  baseConsumptionSingleMan: 208,
  monthlyConsumptionSingleYen: 173042,
  monthlyConsumptionCoupleYen: 293511,
  realReturnRatePct: 2.5,
  kaigoSelfRatePct: 0.81,
  pensionKoseiMan: 181,
  pensionKokuminMan: 71,
  minLivingRetirementMonthlyYen: 149000,
  defaultRetirementAge: 65,
  defaultEndAge: 95,
  incomeCurve: [
    { age: 19, incomeMan: 254.9 }, { age: 22, incomeMan: 318.7 }, { age: 27, incomeMan: 389.3 },
    { age: 32, incomeMan: 442.5 }, { age: 37, incomeMan: 493.5 }, { age: 42, incomeMan: 532.7 },
    { age: 47, incomeMan: 565.9 }, { age: 52, incomeMan: 580.2 }, { age: 57, incomeMan: 597.2 },
    { age: 62, incomeMan: 460.0 }, { age: 67, incomeMan: 370.5 },
  ],
  netRate: [
    { grossMan: 300, netRatePct: 80.2 }, { grossMan: 400, netRatePct: 79.2 }, { grossMan: 500, netRatePct: 78.1 },
    { grossMan: 600, netRatePct: 77.1 }, { grossMan: 700, netRatePct: 75.8 }, { grossMan: 800, netRatePct: 74.1 },
    { grossMan: 1000, netRatePct: 71.2 }, { grossMan: 1200, netRatePct: 69.7 }, { grossMan: 1500, netRatePct: 67.2 },
  ],
  consumptionByAge: [
    { fromAge: 0, monthlyYen: 176160 }, // 〜34歳
    { fromAge: 35, monthlyYen: 184749 }, // 35〜59歳
    { fromAge: 60, monthlyYen: 159249 }, // 60〜64歳
    { fromAge: 65, monthlyYen: 154601 }, // 65歳〜
  ],
};
