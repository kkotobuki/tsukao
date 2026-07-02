/** 入力系パーツ: 自前スライダーと、それを組み込んだ各種入力カード・入力行 */

import { useRef } from 'react';
import type { DimensionValue } from 'react-native';
import { PanResponder, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { C } from './theme';

/** 自前スライダー（新規依存なし）。トラックをドラッグ／タップで値を更新する */
function Slider({
  min,
  max,
  step,
  value,
  onChange,
  color = C.accent,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
  color?: string;
}) {
  // PanResponder は一度しか作らないので、最新の値は ref 越しに読む
  const widthRef = useRef(1);
  const cbRef = useRef(onChange);
  cbRef.current = onChange;
  const cfgRef = useRef({ min, max, step });
  cfgRef.current = { min, max, step };

  const setFromX = (x: number) => {
    const { min, max, step } = cfgRef.current;
    const r = Math.max(0, Math.min(1, x / (widthRef.current || 1)));
    const v = Math.round((min + r * (max - min)) / step) * step;
    cbRef.current(Math.max(min, Math.min(max, v)));
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    }),
  ).current;

  const pct = `${Math.max(0, Math.min(1, (value - min) / (max - min || 1))) * 100}%` as DimensionValue;
  return (
    <View
      style={styles.sliderTrack}
      onLayout={(e) => (widthRef.current = e.nativeEvent.layout.width)}
      {...responder.panHandlers}
    >
      <View style={styles.sliderRail}>
        <View style={[styles.sliderFill, { width: pct, backgroundColor: color }]} />
      </View>
      <View style={[styles.sliderThumb, { left: pct, borderColor: color }]} />
    </View>
  );
}

/** 指標1件の入力カード。アイコンで一目で識別＋大きい数字はタップで直接入力＋スライダーで探る */
export function MetricCard({
  icon,
  tint,
  label,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
}: {
  icon: string;
  tint: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricHead}>
        <View style={[styles.metricIcon, { backgroundColor: tint }]}>
          <Text style={styles.metricIconText}>{icon}</Text>
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
        <View style={styles.metricValueWrap}>
          <TextInput
            style={styles.metricValue}
            keyboardType="number-pad"
            value={String(value)}
            onChangeText={(t) => onChange(Math.max(min, Number(t.replace(/[^0-9]/g, '')) || 0))}
            selectTextOnFocus
          />
          <Text style={styles.metricUnit}>{unit}</Text>
        </View>
      </View>
      <Slider min={min} max={max} step={step} value={value} onChange={onChange} />
      <View style={styles.metricScale}>
        <Text style={styles.metricScaleText}>{min.toLocaleString()}{unit}</Text>
        <Text style={styles.metricScaleText}>{max.toLocaleString()}{unit}</Text>
      </View>
    </View>
  );
}

/** 選択肢の入力カード。アイコン＋ラベルの下に横並びのセグメントを置く */
export function ChoiceCard({
  icon,
  tint,
  label,
  options,
  value,
  onChange,
}: {
  icon: string;
  tint: string;
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricHead}>
        <View style={[styles.metricIcon, { backgroundColor: tint }]}>
          <Text style={styles.metricIconText}>{icon}</Text>
        </View>
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <View style={styles.choiceSeg}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <Pressable key={opt} onPress={() => onChange(opt)} style={[styles.choiceItem, active && styles.choiceItemActive]}>
              <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** アコーディオン内など、カード枠なしで使うスライダー入力行（ラベル＋値＋スライダー） */
export function SliderRow({
  label,
  value,
  unit,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderRowHead}>
        <Text style={styles.sliderRowLabel}>{label}</Text>
        <View style={styles.metricValueWrap}>
          <TextInput
            style={styles.sliderRowValue}
            keyboardType="number-pad"
            value={String(value)}
            onChangeText={(t) => onChange(Math.max(min, Number(t.replace(/[^0-9]/g, '')) || 0))}
            selectTextOnFocus
          />
          {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
        </View>
      </View>
      <Slider min={min} max={max} step={step} value={value} onChange={onChange} />
      <View style={styles.metricScale}>
        <Text style={styles.metricScaleText}>{min.toLocaleString()}{unit}</Text>
        <Text style={styles.metricScaleText}>{max.toLocaleString()}{unit}</Text>
      </View>
    </View>
  );
}

/** ラベル＋横並びセグメントの1行（アコーディオン内のON/OFF等） */
export function Segmented({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.segment}>
        {options.map((opt) => {
          const active = opt === value;
          return (
            <Pressable key={opt} onPress={() => onChange(opt)} style={[styles.segItem, active && styles.segItemActive]}>
              <Text style={[styles.segText, active && styles.segTextActive]}>{opt}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sliderTrack: { height: 28, justifyContent: 'center' },
  sliderRail: { height: 6, borderRadius: 3, backgroundColor: '#e8efeb', overflow: 'hidden' },
  sliderFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  sliderThumb: {
    position: 'absolute', width: 22, height: 22, borderRadius: 11, marginLeft: -11, top: 3,
    backgroundColor: '#ffffff', borderWidth: 3,
    shadowColor: '#0f5e54', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },

  metric: { backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1, borderRadius: 16, padding: 14, gap: 10, marginTop: 10 },
  metricHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metricIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  metricIconText: { fontSize: 18 },
  metricLabel: { color: C.text, fontSize: 15, fontWeight: '700', flex: 1 },
  metricValueWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  metricValue: { color: C.text, fontSize: 24, fontWeight: '900', minWidth: 44, textAlign: 'right', padding: 0 },
  metricUnit: { color: C.sub, fontSize: 13, fontWeight: '700', marginBottom: 3 },
  metricScale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 },
  metricScaleText: { color: C.sub, fontSize: 11 },

  choiceSeg: { flexDirection: 'row', backgroundColor: C.inputBg, borderRadius: 12, padding: 4, gap: 4 },
  choiceItem: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  choiceItemActive: { backgroundColor: C.accent },
  choiceText: { color: C.sub, fontSize: 13, fontWeight: '700' },
  choiceTextActive: { color: '#ffffff' },

  sliderRow: { gap: 8, paddingTop: 2 },
  sliderRowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sliderRowLabel: { color: C.text, fontSize: 14, fontWeight: '600' },
  sliderRowValue: { color: C.text, fontSize: 20, fontWeight: '800', minWidth: 40, textAlign: 'right', padding: 0 },

  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderColor: C.cardBorder, borderWidth: 1,
    borderRadius: 14, paddingVertical: 9, paddingHorizontal: 14,
  },
  rowLabel: { color: C.text, fontSize: 15, flex: 1, paddingRight: 10 },

  segment: { flexDirection: 'row', backgroundColor: C.inputBg, borderRadius: 10, padding: 3 },
  segItem: { paddingVertical: 7, paddingHorizontal: 11, borderRadius: 8 },
  segItemActive: { backgroundColor: C.accent },
  segText: { color: C.sub, fontSize: 12, fontWeight: '700' },
  segTextActive: { color: '#ffffff' },
});
