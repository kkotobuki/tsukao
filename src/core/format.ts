/** 金額の単位変換・表示フォーマッタ（UI とマッパで共通利用） */

/** 万円 → 円 の倍率 */
export const MAN = 10000;

/** 円 → 「◯万円」表示（万円に丸め） */
export const yen = (v: number) => `${Math.round(v / MAN).toLocaleString()}万円`;

/** 年額(円) → 「◯円」の月額表示 */
export const monthlyYen = (annual: number) => `${Math.round(annual / 12).toLocaleString()}円`;

/** 円 → 万円の数字文字列（単位なし。「◯万」の組み立て用） */
export const manYen = (v: number) => Math.round(v / MAN).toLocaleString();
