/** 画面の骨格系パーツ: 背景・ブランド文字・セクション見出し・CTAボタン */

import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Defs, LinearGradient as SvgLinearGradient, Stop, Svg, Text as SvgText } from 'react-native-svg';

import { BG_COLORS, CTA_COLORS, shared } from './theme';

/** 全画面共通の背景グラデーション＋SafeArea */
export function Bg({ children, center }: { children?: React.ReactNode; center?: boolean }) {
  return (
    <LinearGradient colors={BG_COLORS} style={styles.bg}>
      <SafeAreaView style={[styles.safe, center && styles.center]}>{children}</SafeAreaView>
    </LinearGradient>
  );
}

/** ブランドグラデーションの見出し文字（SVG描画） */
export function GradientText({ text, fontSize = 36 }: { text: string; fontSize?: number }) {
  const w = Math.ceil(text.length * fontSize * 1.04) + 4;
  const h = Math.ceil(fontSize * 1.34);
  return (
    <Svg width={w} height={h}>
      <Defs>
        <SvgLinearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#0ea98e" />
          <Stop offset="0.55" stopColor="#16c2a3" />
          <Stop offset="1" stopColor="#3fd0aa" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={0} y={fontSize} fontSize={fontSize} fontWeight="900" fill="url(#brandGrad)">
        {text}
      </SvgText>
    </Svg>
  );
}

/** セクション見出し。info があれば ⓘ で開閉する説明を付ける */
export function SectionTitle({ title, info }: { title: string; info?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <View style={styles.sectionRow}>
        <Text style={[shared.section, { marginTop: 0 }]}>{title}</Text>
        {info ? (
          <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8}>
            <Text style={shared.infoIcon}>ⓘ</Text>
          </Pressable>
        ) : null}
      </View>
      {open && info ? <Text style={shared.hint}>{info}</Text> : null}
    </>
  );
}

/** メインCTA（グラデーションボタン） */
export function PrimaryButton({
  label,
  onPress,
  style,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable onPress={onPress} style={style}>
      <LinearGradient colors={CTA_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
        <Text style={styles.ctaText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1 },
  safe: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', gap: 16 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  cta: { borderRadius: 16, paddingVertical: 17, alignItems: 'center', marginTop: 18 },
  ctaText: { color: '#ffffff', fontSize: 18, fontWeight: '900' },
});
