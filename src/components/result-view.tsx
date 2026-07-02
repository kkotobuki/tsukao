/** 結果画面: 退職時貯蓄のヒーロー → 人生ルート → 推移グラフ → もしも試算 → 主観反応と提案 */

import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { LineChart } from '@/components/line-chart';
import { RouteMap, type Waypoint } from '@/components/route-map';
import { Accordion } from '@/components/ui/accordion';
import { Segmented, SliderRow } from '@/components/ui/inputs';
import { Bg, GradientText, SectionTitle } from '@/components/ui/layout';
import { C, shared } from '@/components/ui/theme';
import { SNAPSHOT } from '@/core/data/snapshot';
import type { SimulationResult } from '@/core/simulation/types';
import { monthlyYen, yen } from '@/core/format';

export function ResultView({
  result,
  presentHeadroomMonthlyYen,
  currentMonthlyExpenseYen,
  currentAge,
  goalAge,
  waypoints,
  reflection,
  onReflect,
  onBack,
  illness,
  setIllness,
  illnessAge,
  setIllnessAge,
  careHome,
  setCareHome,
  careHomeAge,
  setCareHomeAge,
}: {
  result: SimulationResult;
  presentHeadroomMonthlyYen: number;
  currentMonthlyExpenseYen: number;
  currentAge: number;
  goalAge: number;
  waypoints: Waypoint[];
  reflection: 'more' | 'less' | null;
  onReflect: (r: 'more' | 'less') => void;
  onBack: () => void;
  illness: boolean;
  setIllness: (b: boolean) => void;
  illnessAge: number;
  setIllnessAge: (n: number) => void;
  careHome: boolean;
  setCareHome: (b: boolean) => void;
  careHomeAge: number;
  setCareHomeAge: (n: number) => void;
}) {
  const rt = result.retirement;
  const free = rt.annualFreeSpendingYen;
  const hasRoom = free >= 0;
  const ages = result.years.map((y) => y.age);
  const retireIdx = ages.indexOf(goalAge); // 退職年齢のグラフ上の位置（縦線マーカー用）
  // グラフ幅は画面に合わせる（content padding 20×2 ＋ chartCard padding 12×2 を差し引く。上限560）
  const { width: winW } = useWindowDimensions();
  const chartW = Math.max(240, Math.min(winW, 560) - 64);
  // もしも試算の前提金額（snapshot＝Notion由来）
  const illnessMan = SNAPSHOT.events.find((e) => e.id === 'illness')?.oneTimeMan ?? 0;
  const careRow = SNAPSHOT.events.find((e) => e.id === 'care_home');
  const careMan = careRow?.annualMan ?? 0;
  const careDur = careRow?.durationYears ?? 0;

  // 退職後: 年金(＋パート)で最低生活費をどこまで賄えるか。不足は貯蓄を取り崩す
  const retireIncomeYen = rt.pensionAnnualYen + rt.partTimeAnnualYen;
  const shortfallYen = rt.minimumLivingCostAnnualYen - retireIncomeYen; // >0 なら貯蓄で補う
  const coveredByPension = shortfallYen <= 0;
  const yearsAtMinimum = coveredByPension ? 0 : Math.floor(result.assetsAtRetirementYen / shortfallYen);

  return (
    <Bg>
      <ScrollView contentContainerStyle={shared.content}>
        <View style={styles.brandWrap}>
          <GradientText text="あなたの未来" fontSize={28} />
        </View>

        <LinearGradient
          colors={hasRoom ? ['#2bbf9e', '#0ea98e'] : ['#f4a07a', '#ef7d6f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroLabel}>退職時の貯蓄</Text>
          <Text style={styles.heroValue}>{yen(result.assetsAtRetirementYen)}</Text>
          <Text style={styles.heroTaikan}>今の生活費なら 約{Math.round(result.retirementYearsOfLivingCost)}年分</Text>
          <Text style={styles.heroNote}>
            年金 {monthlyYen(rt.pensionAnnualYen)}/月 ・ 最低生活費 {monthlyYen(rt.minimumLivingCostAnnualYen)}/月
          </Text>
        </LinearGradient>

        <Text style={shared.note}>
          {coveredByPension
            ? '年金だけで最低生活はまかなえます。貯蓄はまるごと使える分です。'
            : `年金で足りない分を貯蓄で補うと、最低生活なら 約${yearsAtMinimum}年分 もちます。`}
        </Text>
        <Text style={shared.hint}>
          ※最低生活費は、家計調査「65歳以上・単身無職世帯」の平均消費支出（食料・住居・光熱・保健医療・通信など生活全般）に基づく概算です。
        </Text>

        <SectionTitle
          title="🗺️ あなたの人生ルート"
          info="いま（現在地）から退職（ゴール）までの道のり。各経由地の費用は実際のかかり方で表示します＝毎年かかるもの（子供・ペット・家のローン等）は『年額×年数』、一回のもの（結婚式・頭金）は『一回◯万』。退職（ゴール）の貯蓄だけは退職時にまとまった残高です。順位や勝ち負けはありません——あなた自身の道のりです。"
        />
        <View style={styles.routeWrap}>
          <RouteMap
            width={chartW}
            currentAge={currentAge}
            goalAge={goalAge}
            goalLabel="退職"
            goalSub={`${goalAge}歳・貯蓄 ${yen(result.assetsAtRetirementYen)}`}
            waypoints={waypoints}
          />
        </View>

        <SectionTitle
          title="📈 収入・支出の推移（生涯）"
          info="収入の計算: 額面年収を起点に、年齢別の昇給カーブ（賃金センサス令和7年・実質）で伸ばし、税・社会保険料を引いて手取りにします（例: 額面400万→手取り約320万）。退職後は年金（種類別）＋パートに切り替え。昇給率は実質で、物価上昇は考慮しません（現在価値）。消費＝基本生活費＋選んだライフイベント費（子供・住宅・ペット等）の実支出。一回きりの費用（大病・結婚式・頭金など）はその年に上乗せ（スパイク）して表示します。固定費＝住居費＋生活必須費＋イベント費（コミット分）。消費線と固定費線の差が、いま自由に使えているお金（裁量の娯楽費）です。縦の点線が退職＝ここから収入が年金＋パートに切り替わります。"
        />
        <View style={styles.chartCard}>
          <LineChart
            width={chartW}
            height={190}
            xLabels={ages.map((a) => `${a}歳`)}
            markerIndex={retireIdx}
            markerLabel="退職"
            bands={[
              {
                upper: result.years.map((y) => y.consumptionYen + y.eventAnnualYen + y.eventOneTimeYen),
                lower: result.years.map((y) => y.fixedCostYen + y.eventAnnualYen + y.eventOneTimeYen),
                color: '#f59e0b',
                opacity: 0.20,
                label: '自由に使えるお金',
              },
            ]}
            series={[
              { label: '年収', color: '#7cc5f0', values: result.years.map((y) => y.grossIncomeYen) },
              { label: '手取り', color: '#0ea98e', values: result.years.map((y) => y.netIncomeYen) },
              { label: '消費', color: '#f59e0b', values: result.years.map((y) => y.consumptionYen + y.eventAnnualYen + y.eventOneTimeYen) },
              { label: '固定費（必要な支出）', color: '#b9760a', values: result.years.map((y) => y.fixedCostYen + y.eventAnnualYen + y.eventOneTimeYen) },
            ]}
          />
        </View>

        <SectionTitle
          title="📊 資産の推移（生涯）"
          info="消費の計算: 入力した毎月の支出を基準に、家計調査の年齢別消費カーブで増減（現役はほぼ横ばい、60歳で約−14%、以降微減）。物価は考慮しません（現在価値）。退職後は最低生活費（約14.9万/月＝家計調査 高齢単身無職）で取り崩し。資産＝毎年「手取り−消費−イベント＋運用益」を積み上げ、退職後は年金で足りない分を貯蓄から取り崩します。縦の点線が退職＝ここから資産が減りはじめます。"
        />
        <View style={styles.chartCard}>
          <LineChart
            width={chartW}
            height={190}
            xLabels={ages.map((a) => `${a}歳`)}
            markerIndex={retireIdx}
            markerLabel="退職"
            series={[
              { label: '資産', color: '#0ea98e', kind: 'area', values: result.years.map((y) => y.assetsYen) },
            ]}
          />
        </View>

        <Text style={shared.section}>🧪 もしもの試算</Text>
        <Text style={shared.hint}>未来を見たうえで、起きると大きい出費を試せます。切り替えると上のグラフと数字が変わります。</Text>
        <View style={shared.detailBox}>
          <Accordion icon="🏥" title="大病をしたら" summary={illness ? '見る' : '—'} active={illness}>
            <Segmented label="試す" options={['見ない', '見る']} value={illness ? '見る' : '見ない'} onChange={(v) => setIllness(v === '見る')} />
            <Text style={shared.hint}>{illnessAge}歳で 約{illnessMan}万円 を1回（治療費の自己負担＋療養中の収入減の概算）</Text>
            {illness && <SliderRow label="その年齢" value={illnessAge} unit="歳" min={18} max={99} onChange={setIllnessAge} />}
          </Accordion>
          <Accordion icon="🧓" title="介護施設に入ったら" summary={careHome ? '入る' : '—'} active={careHome}>
            <Segmented label="試す" options={['入らない', '入る']} value={careHome ? '入る' : '入らない'} onChange={(v) => setCareHome(v === '入る')} />
            <Text style={shared.hint}>{careHomeAge}歳から 年{careMan}万円 × {careDur}年 ＝ 計 約{careMan * careDur}万円（{careDur}年＝平均介護期間 約4年7ヶ月。入居一時金は別途・要手入力）</Text>
            {careHome && <SliderRow label="入る年齢" value={careHomeAge} unit="歳" min={60} max={99} onChange={setCareHomeAge} />}
          </Accordion>
        </View>

        <Text style={shared.section}>💭 この数字、どう感じましたか？</Text>
        <View style={styles.reflectRow}>
          <Pressable onPress={() => onReflect('less')} style={[styles.reflectBtn, reflection === 'less' && styles.reflectActive]}>
            <Text style={styles.reflectText}>思ったより少ない</Text>
          </Pressable>
          <Pressable onPress={() => onReflect('more')} style={[styles.reflectBtn, reflection === 'more' && styles.reflectActive]}>
            <Text style={styles.reflectText}>思ったより多い</Text>
          </Pressable>
        </View>

        {reflection && (
          <Suggestion
            hasRoom={hasRoom}
            presentHeadroomMonthlyYen={presentHeadroomMonthlyYen}
            currentMonthlyExpenseYen={currentMonthlyExpenseYen}
            retirementFreeMonthlyYen={free / 12}
            reflection={reflection}
          />
        )}

        <Accordion title="📖 計算方法・前提（詳しく知りたい人へ）">
          <Text style={shared.note}>・すべて現在価値（今日の円）。物価上昇は考慮せず、昇給率・運用利回りは実質で扱います。</Text>
          <Text style={shared.note}>・収入: 額面年収を起点に、年齢別の昇給カーブ（賃金センサス・実質）で伸ばし、税・社会保険料を引いて手取りにします（例: 額面400万→手取り約320万）。</Text>
          <Text style={shared.note}>・消費: 入力した「毎月の支出」を基準に、家計調査の年齢別カーブで増減（現役はほぼ横ばい、退職後は減）。</Text>
          <Text style={shared.note}>・ライフイベント: 選んだ項目の年額／一回費用を加算（出所＝家計調査・各種統計）。住宅は賃貸→購入で家賃を維持費＋ローンに置換。</Text>
          <Text style={shared.note}>・退職後: 収入＝年金（国民 約5.9万／厚生 約15.1万・月）＋パート。支出＝最低生活費（約14.9万/月＝家計調査 高齢単身無職）。不足は貯蓄を取り崩し、資産が尽きるまで描きます。</Text>
          <Text style={shared.note}>・積立投資: 退職まで毎月積み立て、実質利回り約2.5%（GPIF設立来+4.71%−物価）で複利運用。</Text>
          <Text style={shared.hint}>出所: 賃金構造基本統計調査／家計調査／厚労省 年金事業概況／GPIF／国立成育医療研究センター ほか。</Text>
          <Text style={shared.hint}>限界: 「平均どおりに進めば」の1本線で、確率や個人の振れ（テールリスク）は表現しません。年齢別データは“ある時点の断面”（合成コホート）で、同一個人の生涯推移ではありません。</Text>
        </Accordion>

        <Pressable onPress={onBack} style={styles.secondaryBtn}>
          <Text style={styles.secondaryText}>条件を変えてもう一度</Text>
        </Pressable>
      </ScrollView>
    </Bg>
  );
}

function Suggestion({
  hasRoom,
  presentHeadroomMonthlyYen,
  currentMonthlyExpenseYen,
  retirementFreeMonthlyYen,
  reflection,
}: {
  hasRoom: boolean;
  presentHeadroomMonthlyYen: number;
  currentMonthlyExpenseYen: number;
  retirementFreeMonthlyYen: number;
  reflection: 'more' | 'less';
}) {
  if (!hasRoom) {
    return (
      <View style={styles.suggest}>
        <Text style={styles.suggestTitle}>悲観しなくて大丈夫</Text>
        <Text style={styles.suggestBody}>
          今のままだと退職後がやや厳しめ。でも変えられる余地はたくさんあります。{'\n'}
          ・退職を1〜2年延ばす ・退職後に少しだけ働く ・投資を始める{'\n'}
          条件を変えて、どれが効くか試してみましょう。
        </Text>
      </View>
    );
  }
  // SPEC §5.6 の核: 「今の生活に 月△△円 まで上乗せできる」という"今を楽しむ許可"
  const upMonthly = Math.max(0, Math.round(presentHeadroomMonthlyYen / 1000) * 1000);
  const up = upMonthly.toLocaleString();
  const pct = currentMonthlyExpenseYen > 0 ? Math.round((upMonthly / currentMonthlyExpenseYen) * 100) : 0;
  const retire = Math.round(retirementFreeMonthlyYen).toLocaleString();
  return (
    <View style={styles.suggest}>
      <Text style={styles.suggestTitle}>
        {reflection === 'more' ? 'やっぱり、余裕がありました' : 'それでも、ちゃんと余裕はあります'}
      </Text>
      <Text style={styles.permitLead}>今の生活に</Text>
      <Text style={styles.permitValue}>月 {up}円</Text>
      <Text style={styles.permitValueLabel}>まで上乗せできます</Text>
      <Text style={styles.permitNote}>
        毎月の支出を月 {up}円（今の約{pct}%）増やしても、退職後の最低生活は守れます。
      </Text>
      <Text style={styles.suggestBody}>
        将来のために我慢している「今しかできないこと」、その範囲で少し始めてみませんか？
      </Text>
      <View style={styles.ideaRow}>
        <Idea text="🌏 旅行に行く" />
        <Idea text="🎸 趣味を始める" />
        <Idea text="📚 学びに投資" />
      </View>
      <Text style={styles.suggestHint}>
        ※この「上乗せできる額」は、退職後に最低生活を守れる範囲の上限です（退職後も月 {retire}円 自由に使える試算）。
        ホームの「詳細」で“やりたいこと”に金額を入れると、それでも将来が大丈夫か確かめられます。
      </Text>
    </View>
  );
}

function Idea({ text }: { text: string }) {
  return (
    <View style={styles.idea}>
      <Text style={styles.ideaText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brandWrap: { marginBottom: 10 },

  hero: { borderRadius: 20, padding: 22, gap: 6 },
  heroLabel: { color: '#e7f6ef', fontSize: 13, fontWeight: '600' },
  heroValue: { color: '#ffffff', fontSize: 42, fontWeight: '900' },
  heroTaikan: { color: '#ffffff', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  heroNote: { color: '#eafaf3', fontSize: 12, lineHeight: 18 },

  chartCard: { backgroundColor: '#ffffff', borderColor: '#e4ece8', borderWidth: 1, borderRadius: 14, padding: 12 },
  routeWrap: { alignItems: 'center' },

  secondaryBtn: { borderColor: C.cardBorder, borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  secondaryText: { color: C.sub, fontSize: 14, fontWeight: '700' },

  reflectRow: { flexDirection: 'row', gap: 10 },
  reflectBtn: {
    flex: 1, backgroundColor: C.card, borderRadius: 14, paddingVertical: 15,
    alignItems: 'center', borderWidth: 1, borderColor: C.cardBorder,
  },
  reflectActive: { borderColor: C.accent, backgroundColor: 'rgba(14,169,142,0.10)' },
  reflectText: { color: C.text, fontSize: 14, fontWeight: '700' },

  suggest: { backgroundColor: 'rgba(14,169,142,0.07)', borderColor: 'rgba(14,169,142,0.22)', borderWidth: 1, borderRadius: 16, padding: 16, gap: 8, marginTop: 4 },
  suggestTitle: { color: '#0e9b86', fontSize: 16, fontWeight: '900' },
  permitLead: { color: C.sub, fontSize: 13, marginTop: 2 },
  permitValue: { color: '#d97706', fontSize: 30, fontWeight: '900', lineHeight: 36 },
  permitValueLabel: { color: '#d97706', fontSize: 15, fontWeight: '800', marginTop: -2, marginBottom: 2 },
  permitNote: { color: C.text, fontSize: 13, lineHeight: 20 },
  suggestBody: { color: C.text, fontSize: 13, lineHeight: 20 },
  suggestHint: { color: C.sub, fontSize: 11, lineHeight: 17, marginTop: 4 },
  ideaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  idea: { backgroundColor: '#fdf2dc', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  ideaText: { color: '#b9760a', fontSize: 13, fontWeight: '700' },
});
