/** 配色トークンと画面をまたいで使う共通スタイル */

import { StyleSheet } from 'react-native';

export const C = {
  card: '#ffffff',
  cardBorder: '#e4ece8',
  text: '#1f3a34',
  sub: '#6b7a73',
  accent: '#0ea98e',
  accentSoft: 'rgba(14,169,142,0.10)',
  inputBg: '#eef6f2',
};

/** 画面全体の背景グラデーション */
export const BG_COLORS = ['#f4faf7', '#eef5f1', '#f3f8fb'] as const;

/** CTA ボタンのグラデーション */
export const CTA_COLORS = ['#16c2a3', '#0ea98e'] as const;

export const shared = StyleSheet.create({
  /** ScrollView の contentContainerStyle（全画面共通の余白・最大幅） */
  content: { padding: 20, gap: 10, maxWidth: 560, width: '100%', alignSelf: 'center' },
  /** セクション見出し */
  section: { color: C.accent, fontSize: 14, fontWeight: '800', marginTop: 16 },
  /** 本文寄りの補足 */
  note: { color: C.text, fontSize: 13, lineHeight: 19, marginTop: 2 },
  /** 小さい注記・出所表示 */
  hint: { color: C.sub, fontSize: 11, lineHeight: 16 },
  /** ⓘ アイコン */
  infoIcon: { color: C.accent, fontSize: 16, fontWeight: '700' },
  /** アコーディオン等を縦に並べる箱 */
  detailBox: { gap: 10 },
});
