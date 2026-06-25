import { StyleSheet, Text, View } from 'react-native';
import { Line, Polygon, Polyline, Rect, Svg, Text as SvgText } from 'react-native-svg';

export interface Series {
  label: string;
  color: string;
  values: number[];
  /** 'bar' なら棒グラフで描く（既定は折れ線）。資産など"残高"の表示に向く */
  kind?: 'line' | 'bar';
}

/** 2系列(upper/lower)の間を塗る帯。例: 消費〜固定費の差＝「自由に使えるお金」 */
export interface Band {
  upper: number[];
  lower: number[];
  color: string;
  opacity?: number;
  /** 凡例に出すラベル（省略時は凡例に出さない） */
  label?: string;
}

/** 年次の折れ線グラフ(svg)。複数系列を同一スケールで重ねて描く */
export function LineChart({
  series,
  xLabels,
  width = 320,
  height = 180,
  bands = [],
}: {
  series: Series[];
  xLabels: string[];
  width?: number;
  height?: number;
  bands?: Band[];
}) {
  const pad = { l: 44, r: 6, t: 10, b: 18 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const len = series[0]?.values.length ?? 0;
  const n = Math.max(1, len - 1);
  const all = series.flatMap((s) => s.values);
  const maxV = Math.max(1, ...all);
  const minV = Math.min(0, ...all);
  const range = maxV - minV || 1;
  const x = (i: number) => pad.l + (i / n) * w;
  const y = (v: number) => pad.t + h - ((v - minV) / range) * h;

  // 5年ごとの区切り線（年齢が5の倍数の位置）
  const gridIdx = xLabels
    .map((l, i) => ({ a: parseInt(l, 10), i }))
    .filter(({ a }) => Number.isFinite(a) && a % 5 === 0);

  // 縦軸の目盛り（金額・万円）。minV〜maxV を等分
  const tickCount = 4;
  const yTicks = Array.from({ length: tickCount + 1 }, (_, k) => minV + (range * k) / tickCount);

  return (
    <View>
      <Svg width={width} height={height}>
        {yTicks.map((v, k) => (
          <Line key={`yg-${k}`} x1={pad.l} y1={y(v)} x2={pad.l + w} y2={y(v)} stroke="#202b40" strokeWidth={1} />
        ))}
        {yTicks.map((v, k) => (
          <SvgText key={`yl-${k}`} x={pad.l - 4} y={y(v) + 3} fill="#6f80a0" fontSize={9} textAnchor="end">
            {`${Math.round(v / 10000).toLocaleString()}万`}
          </SvgText>
        ))}
        {gridIdx.map(({ a, i }) => (
          <Line key={`grid-${a}`} x1={x(i)} y1={pad.t} x2={x(i)} y2={pad.t + h} stroke="#2a3650" strokeWidth={1} />
        ))}
        {gridIdx.map(({ a, i }) => (
          <SvgText key={`gl-${a}`} x={x(i)} y={height - 5} fill="#6f80a0" fontSize={10} textAnchor="middle">
            {`${a}`}
          </SvgText>
        ))}
        <Line x1={pad.l} y1={y(0)} x2={pad.l + w} y2={y(0)} stroke="#33405c" strokeWidth={1} />
        {bands.map((bd, bi) => {
          const up = bd.upper.map((v, i) => `${x(i)},${y(v)}`);
          const lo = bd.lower.map((v, i) => `${x(i)},${y(v)}`).reverse();
          return (
            <Polygon
              key={`band-${bi}`}
              points={[...up, ...lo].join(' ')}
              fill={bd.color}
              opacity={bd.opacity ?? 0.18}
            />
          );
        })}
        {series
          .filter((s) => s.kind === 'bar')
          .flatMap((s) => {
            const bw = Math.max(2, (w / Math.max(1, len)) * 0.55);
            return s.values.map((v, i) => (
              <Rect
                key={`${s.label}-${i}`}
                x={x(i) - bw / 2}
                y={Math.min(y(v), y(0))}
                width={bw}
                height={Math.abs(y(0) - y(v))}
                fill={s.color}
                opacity={0.55}
              />
            ));
          })}
        {series
          .filter((s) => s.kind !== 'bar')
          .map((s) => (
            <Polyline
              key={s.label}
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth={2.5}
            />
          ))}
      </Svg>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.label} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>{s.label}</Text>
          </View>
        ))}
        {bands
          .filter((bd) => bd.label)
          .map((bd, bi) => (
            <View key={`bl-${bi}`} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: bd.color, opacity: (bd.opacity ?? 0.18) + 0.15 }]} />
              <Text style={styles.legendText}>{bd.label}</Text>
            </View>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 14, marginTop: 8, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  swatch: { width: 14, height: 10, borderRadius: 2 },
  legendText: { color: '#9fb0cc', fontSize: 12 },
  xrow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  xlabel: { color: '#6f80a0', fontSize: 11 },
});
