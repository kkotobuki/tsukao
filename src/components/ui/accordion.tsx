/** 開閉式のカード。詳細オプションや「計算方法」の折りたたみに使う */

import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { C, shared } from './theme';

export function Accordion({
  title,
  icon,
  summary,
  active,
  info,
  children,
}: {
  title: string;
  icon?: string; // 一目で識別するためのアイコン（絵文字）
  summary?: string;
  active?: boolean;
  info?: string; // ⓘ で開く「算出根拠・出所」（Notion由来）
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <View style={[styles.acc, active && styles.accActive]}>
      <View style={styles.accHead}>
        <Pressable onPress={() => setOpen((o) => !o)} style={styles.accHeadMain}>
          <View style={styles.accTitleWrap}>
            {icon ? (
              <View style={styles.accIcon}>
                <Text style={styles.accIconText}>{icon}</Text>
              </View>
            ) : null}
            <Text style={styles.accTitle}>{title}</Text>
          </View>
          <View style={styles.accRight}>
            {summary ? <Text style={[styles.accSummary, active && styles.accSummaryOn]}>{summary}</Text> : null}
            <Text style={styles.accChevron}>{open ? '▲' : '▼'}</Text>
          </View>
        </Pressable>
        {info ? (
          <Pressable onPress={() => setInfoOpen((v) => !v)} hitSlop={8} style={styles.accInfoBtn}>
            <Text style={shared.infoIcon}>ⓘ</Text>
          </Pressable>
        ) : null}
      </View>
      {infoOpen && info ? (
        <View style={styles.accInfoBox}>
          <Text style={shared.hint}>{info}</Text>
        </View>
      ) : null}
      {open && <View style={styles.accBody}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  acc: { backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  accActive: { borderColor: C.accent },
  accHead: { flexDirection: 'row', alignItems: 'center' },
  accHeadMain: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingLeft: 14, paddingRight: 8 },
  accInfoBtn: { paddingHorizontal: 12, paddingVertical: 13 },
  accInfoBox: { paddingHorizontal: 14, paddingBottom: 10, paddingTop: 2, backgroundColor: 'rgba(14,169,142,0.05)' },
  accTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  accIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  accIconText: { fontSize: 16 },
  accTitle: { color: C.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  accRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accSummary: { color: C.sub, fontSize: 13, fontWeight: '700' },
  accSummaryOn: { color: C.accent },
  accChevron: { color: C.sub, fontSize: 10 },
  accBody: { paddingHorizontal: 12, paddingBottom: 12, paddingTop: 2, gap: 10, backgroundColor: 'rgba(14,169,142,0.05)' },
});
