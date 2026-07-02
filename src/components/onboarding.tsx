/** 初回だけ出す共感オンボーディング。痛みへの共感 → 約束 → 開始、の順（→ PRODUCT.md） */

import { StyleSheet, Text, View } from 'react-native';

import { Bg, PrimaryButton } from '@/components/ui/layout';
import { C } from '@/components/ui/theme';

export function Onboarding({ onStart }: { onStart: () => void }) {
  return (
    <Bg center>
      <View style={styles.onbWrap}>
        <Text style={styles.onbBrand}>ツカオ</Text>
        <Text style={styles.onbTitle}>{'将来のお金が不安で、\n"今" を我慢していませんか？'}</Text>
        <Text style={styles.onbBody}>
          {'足りるか分からないと、つい使えない。\nだからツカオは、あなたの未来を平均の一本線で見える化します。'}
        </Text>
        <Text style={styles.onbBody}>
          {'先が見えると、不安は軽くなる。\n「今、使っていい」が、きっと見えてきます。'}
        </Text>
        <PrimaryButton label="自分の未来を見てみる →" onPress={onStart} style={styles.onbBtn} />
        <Text style={styles.onbFoot}>入力は年齢・年収・資産・毎月の支出だけ。数秒で未来が描けます。</Text>
      </View>
    </Bg>
  );
}

const styles = StyleSheet.create({
  onbWrap: { paddingHorizontal: 28, maxWidth: 480, width: '100%', alignSelf: 'center', gap: 18 },
  onbBrand: { color: C.accent, fontSize: 15, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  onbTitle: { color: C.text, fontSize: 26, fontWeight: '900', lineHeight: 38, textAlign: 'center' },
  onbBody: { color: C.sub, fontSize: 15, lineHeight: 24, textAlign: 'center' },
  onbBtn: { width: '100%' },
  onbFoot: { color: C.sub, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: -4 },
});
