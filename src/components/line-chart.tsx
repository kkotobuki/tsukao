import { StyleSheet, Text, View } from 'react-native';
import { Line, Path, Rect, Svg, Text as SvgText } from 'react-native-svg';

export interface Series {
  label: string;
  color: string;
  values: number[];
  /** 'bar'=棒 / 'area'=なめらかな線＋下方塗り（残高の表示向き）。既定は折れ線 */
  kind?: 'line' | 'bar' | 'area';
  /** 'right'=右の第2軸で描く（桁の違う資産などを同じ図に重ねる時）。既定は左軸 */
  axis?: 'left' | 'right';
}

/** 2系列(upper/lower)の間を塗る帯。例: 消費〜固定費の差＝「自由に使えるお金」 */
export interface Band {
  upper: number[];
  lower: number[];
  color: string;
  opacity?: number;
  /** 凡例に出すラベル（省略時は凡例に出さない） */
  label?: string;
  axis?: 'left' | 'right';
}

/** Catmull-Rom を3次ベジェに変換し、点列をなめらかな曲線パスにする */
function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return '';
  if (pts.length < 3) return `M ${pts.map((p) => p.join(',')).join(' L ')}`;
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** 年次の折れ線グラフ(svg)。複数系列を重ね、桁の違う系列は右の第2軸で描ける */
export function LineChart({
  series,
  xLabels,
  width = 320,
  height = 180,
  bands = [],
  markerIndex,
  markerLabel,
}: {
  series: Series[];
  xLabels: string[];
  width?: number;
  height?: number;
  bands?: Band[];
  /** 縦の目印線を引く位置（values 配列のインデックス）。例: 退職年齢 */
  markerIndex?: number;
  markerLabel?: string;
}) {
  const hasRight = series.some((s) => s.axis === 'right') || bands.some((b) => b.axis === 'right');
  const pad = { l: 44, r: hasRight ? 40 : 6, t: 12, b: 18 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const len = series[0]?.values.length ?? 0;
  const n = Math.max(1, len - 1);
  const x = (i: number) => pad.l + (i / n) * w;

  // 左右それぞれの軸スケール（その軸に属する系列・帯の値域から決める）
  const makeScale = (axis: 'left' | 'right') => {
    const all = [
      ...series.filter((s) => (s.axis ?? 'left') === axis).flatMap((s) => s.values),
      ...bands.filter((b) => (b.axis ?? 'left') === axis).flatMap((b) => [...b.upper, ...b.lower]),
    ];
    const maxV = Math.max(1, ...all);
    const minV = Math.min(0, ...all);
    const range = maxV - minV || 1;
    return { maxV, minV, range, y: (v: number) => pad.t + h - ((v - minV) / range) * h };
  };
  const L = makeScale('left');
  const R = hasRight ? makeScale('right') : L;
  const axisOf = (s: { axis?: 'left' | 'right' }) => (s.axis === 'right' ? R : L);

  // 5年ごとの区切り線（年齢が5の倍数の位置）
  const gridIdx = xLabels
    .map((l, i) => ({ a: parseInt(l, 10), i }))
    .filter(({ a }) => Number.isFinite(a) && a % 5 === 0);

  const tickCount = 4;
  const yTicksL = Array.from({ length: tickCount + 1 }, (_, k) => L.minV + (L.range * k) / tickCount);
  const yTicksR = Array.from({ length: tickCount + 1 }, (_, k) => R.minV + (R.range * k) / tickCount);
  const man = (v: number) => `${Math.round(v / 10000).toLocaleString()}万`;

  return (
    <View>
      <Svg width={width} height={height}>
        {yTicksL.map((v, k) => (
          <Line key={`yg-${k}`} x1={pad.l} y1={L.y(v)} x2={pad.l + w} y2={L.y(v)} stroke="#eef1f4" strokeWidth={1} />
        ))}
        {yTicksL.map((v, k) => (
          <SvgText key={`yl-${k}`} x={pad.l - 4} y={L.y(v) + 3} fill="#9aa6b2" fontSize={9} textAnchor="end">
            {man(v)}
          </SvgText>
        ))}
        {hasRight &&
          yTicksR.map((v, k) => (
            <SvgText key={`yr-${k}`} x={pad.l + w + 4} y={R.y(v) + 3} fill="#9aa6b2" fontSize={9} textAnchor="start">
              {man(v)}
            </SvgText>
          ))}
        {gridIdx.map(({ a, i }) => (
          <Line key={`grid-${a}`} x1={x(i)} y1={pad.t} x2={x(i)} y2={pad.t + h} stroke="#f1f3f6" strokeWidth={1} />
        ))}
        {gridIdx.map(({ a, i }) => (
          <SvgText key={`gl-${a}`} x={x(i)} y={height - 5} fill="#9aa6b2" fontSize={10} textAnchor="middle">
            {`${a}`}
          </SvgText>
        ))}
        <Line x1={pad.l} y1={L.y(0)} x2={pad.l + w} y2={L.y(0)} stroke="#d6dde2" strokeWidth={1} />

        {markerIndex != null && markerIndex >= 0 && (
          <>
            <Line
              x1={x(markerIndex)}
              y1={pad.t}
              x2={x(markerIndex)}
              y2={pad.t + h}
              stroke="#e0b75e"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            {markerLabel ? (
              <SvgText x={x(markerIndex)} y={pad.t + 8} fill="#b9760a" fontSize={9} fontWeight="700" textAnchor="middle">
                {markerLabel}
              </SvgText>
            ) : null}
          </>
        )}

        {/* エリア塗り（なめらかな上辺＋ベースラインまで閉じる） */}
        {series
          .filter((s) => s.kind === 'area')
          .map((s) => {
            const { y, minV } = axisOf(s);
            const top = smoothPath(s.values.map((v, i) => [x(i), y(v)]));
            const d = `${top} L ${x(len - 1)},${y(minV)} L ${x(0)},${y(minV)} Z`;
            return <Path key={`area-${s.label}`} d={d} fill={s.color} opacity={0.16} />;
          })}

        {/* 帯（消費〜固定費の差＝自由に使えるお金など） */}
        {bands.map((bd, bi) => {
          const { y } = bd.axis === 'right' ? R : L;
          const up = bd.upper.map((v, i) => `${x(i)},${y(v)}`);
          const lo = bd.lower.map((v, i) => `${x(i)},${y(v)}`).reverse();
          return (
            <Path
              key={`band-${bi}`}
              d={`M ${[...up, ...lo].join(' L ')} Z`}
              fill={bd.color}
              opacity={bd.opacity ?? 0.18}
            />
          );
        })}

        {/* 棒グラフ */}
        {series
          .filter((s) => s.kind === 'bar')
          .flatMap((s) => {
            const { y } = axisOf(s);
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

        {/* 折れ線（なめらかな曲線。エリアの上辺もここで線を描く） */}
        {series
          .filter((s) => s.kind !== 'bar')
          .map((s) => {
            const { y } = axisOf(s);
            return (
              <Path
                key={s.label}
                d={smoothPath(s.values.map((v, i) => [x(i), y(v)]))}
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}
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
  legendText: { color: '#5b6b7a', fontSize: 12 },
});
