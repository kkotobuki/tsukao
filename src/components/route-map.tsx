import { StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';

/** ルート上の経由地（ライフイベント）。age に置き、emoji ピン＋ラベルで示す */
export interface Waypoint {
  age: number;
  label: string;
  emoji: string;
  sub?: string;
}

/**
 * 人生ルート図（Google Maps の経路案内風）。
 * 下＝現在地（いま）→ 上＝ゴール（退職）へ伸びる1本道に、ライフイベントを経由地ピンで配置する。
 * スコア・順位・勝敗は持たない（GPSの「現在地→目的地」案内のメタファーのみ）。
 */
export function RouteMap({
  currentAge,
  goalAge,
  goalLabel,
  goalSub,
  waypoints,
  width = 340,
}: {
  currentAge: number;
  goalAge: number;
  goalLabel: string;
  goalSub?: string;
  waypoints: Waypoint[];
  width?: number;
}) {
  type Node = Waypoint & { isNow?: boolean; isGoal?: boolean };
  // いま・ゴール（退職）・各イベントを年齢順に並べる。退職後のイベント（介護施設など）は退職の先に出す。
  const nodes: Node[] = [
    { age: currentAge, label: 'いま', emoji: '📍', sub: `${currentAge}歳・現在地`, isNow: true },
    { age: goalAge, label: goalLabel, emoji: '🏁', sub: goalSub, isGoal: true },
    ...waypoints.filter((w) => w.age >= currentAge && w.age <= 100),
  ].sort((a, b) => a.age - b.age);

  const padTop = 26;
  const padBot = 30;
  // ノード間隔は「年齢差」に比例させる（同年齢なら最小ギャップで近接＝時間差があるように見せない）。
  // ただしラベルが潰れないよう最小ギャップを確保する。
  const minGap = 46; // ラベル2行ぶんの下限
  const ageStep = 4.4; // 年齢1歳あたりの追加px
  const maxGap = 150; // 1区間の上限（離れすぎ防止）
  const gaps = nodes.slice(1).map((n, i) => {
    const ageDiff = n.age - nodes[i].age;
    return Math.min(maxGap, minGap + ageDiff * ageStep);
  });
  const cum = gaps.reduce<number[]>((acc, g) => [...acc, acc[acc.length - 1] + g], [0]); // 累積（i=0 が 0）
  const H = padTop + padBot + (cum[cum.length - 1] ?? 0);
  // y: i=0(いま)を下に、最後(ゴール/最年長)を上に。
  const yOf = (i: number) => H - padBot - cum[i];

  const baseX = 34;
  const wiggle = (i: number) => Math.sin((i / Math.max(1, nodes.length - 1)) * Math.PI * 3) * 9;
  const xOf = (i: number) => baseX + wiggle(i);

  // 道のパス（ノードを下から上へ滑らかに繋ぐ）
  const pts = nodes.map((_, i) => `${xOf(i).toFixed(1)},${yOf(i).toFixed(1)}`);
  const d = `M ${pts.join(' L ')}`;

  return (
    <View style={[styles.card, { width, height: H }]}>
      <Svg width={width} height={H} style={StyleSheet.absoluteFill}>
        {/* 道の縁取り＋本体（Maps の道路風） */}
        <Path d={d} stroke="#c4d2ea" strokeWidth={11} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={d} stroke="#5a8def" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      {nodes.map((n, i) => {
        const cx = xOf(i);
        const cy = yOf(i);
        return (
          <View key={`n-${i}`} pointerEvents="none">
            <View style={[styles.pinWrap, { left: cx - 14, top: cy - 14 }]}>
              <View style={[styles.pin, n.isNow && styles.pinNow, n.isGoal && styles.pinGoal]}>
                <Text style={styles.pinEmoji}>{n.emoji}</Text>
              </View>
            </View>
            <View style={[styles.label, { top: cy - 17, left: baseX + 34, maxWidth: width - (baseX + 34) - 10 }]}>
              <Text style={[styles.labelTitle, n.isGoal && styles.labelGoal]} numberOfLines={1}>
                {n.label}
              </Text>
              {n.sub ? (
                <Text style={styles.labelSub} numberOfLines={1}>
                  {n.sub}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#eef2f8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dde4ef',
    position: 'relative',
  },
  pinWrap: { position: 'absolute', width: 28, height: 28 },
  pin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#5a8def',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1b2a4a',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  pinNow: { borderColor: '#7c5cfc' },
  pinGoal: { borderColor: '#ff6fb5' },
  pinEmoji: { fontSize: 15, lineHeight: 19 },
  label: { position: 'absolute' },
  labelTitle: { color: '#1b2a4a', fontSize: 14, fontWeight: '800' },
  labelGoal: { color: '#c23d7b' },
  labelSub: { color: '#5b6b86', fontSize: 11, marginTop: 1 },
});
