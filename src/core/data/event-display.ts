/**
 * ライフイベントの「表示」に関する定数・純関数。
 * どのイベントをどう UI に出すか（絵文字・費用ラベル・専用UI扱いの区分）をここに集約する。
 * 計算そのものは simulation/、値の出所は data/snapshot.ts を参照。
 */

import type { LifeEventDef } from '../simulation/types';
import { manYen } from '../format';
import { SNAPSHOT } from './snapshot';

/** 詳細リストにデータ駆動で出さないイベント。house/retire/invest=専用UI、illness/care_home=結果画面の"もしも試算" */
const SPECIAL_EVENT_IDS = new Set(['house', 'retire', 'invest', 'illness', 'care_home']);

/** 人数・頭数で掛けるイベント */
export const COUNTABLE_EVENT_IDS = new Set(['child', 'pet_dog', 'pet_cat']);

/** ルート図の経由地ピンに使う絵文字（イベントid→emoji） */
export const EVENT_EMOJI: Record<string, string> = {
  marriage: '💍', child: '👶', divorce: '💔', parentcare: '🧓', pet_dog: '🐶', pet_cat: '🐱',
  house: '🏠', move: '📦', car: '🚗', second_house: '🏖️', study: '📚', hobby: '🎸',
  insurance: '🛡️', beauty: '💄', overseas: '🌏', illness: '🏥', care_home: '🏥',
};

/** 詳細に並べるオプション（Notion由来の snapshot から自動生成） */
export const OPTION_EVENTS = SNAPSHOT.events.filter((e) => !SPECIAL_EVENT_IDS.has(e.id));

/**
 * イベント費用を「実際のかかり方」の文字列にする（ルート経由地・入力ヒントで共通利用）。
 * - 年別表(scheduleYen)があるもの(子供)は実額の合計「計約◯万（N年）」＝エンジンの計算と一致させる
 * - それ以外の毎年型は「年◯万×N年」、一回スポットは年額を出さず「(一回ラベル)◯万」
 * 年齢の接頭辞は付けない（呼び出し側で「◯歳〜」/「◯歳」を付ける）。
 */
export function eventCadenceLabel(
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
export function hasRecurringCost(def: LifeEventDef, annualOverrideYen?: number | null): boolean {
  if (def.calcKind === '一回スポット') return false;
  return (def.scheduleYen?.length ?? 0) > 0 || (annualOverrideYen ?? def.annualYen ?? 0) > 0;
}
