/**
 * Notion 前提値のビルド時スナップショット(2026-06 時点)。
 * SPEC §6.1: アプリは実行時に Notion を読まず、この同梱データを使う。
 * 本来は Notion API から再生成する(TODO: scripts/generate-snapshot)。値は Notion の各 DB に対応。
 *
 * 金額は Notion 表示に合わせ「万円」で持つ。円への変換(×10000)はマッパ(mappers.ts)で行う。
 */

import type { CalcKind } from '../simulation/types';

/** ライフイベント費用DB の1行 */
export interface EventRow {
  id: string;
  name: string;
  category: string;
  calcKind: CalcKind;
  annualMan: number | null; // 年額(万円)
  oneTimeMan: number | null; // 初期費用(万円)
  durationYears: number | null; // 継続年数(空=無期限)
  scheduleMan?: number[]; // 年別表(万円・経過年0始まり)。子供のみ
  semantic?: 'marriage'; // 結婚=世帯消費増分のトリガ
  note?: string; // 算出根拠＋備考(Notion由来)。UIの ⓘ で表示
  source?: string; // 参照源(機関名・調査名。Notion由来)
}

export interface Snapshot {
  /** ライフイベント別 年額コスト(前提値) */
  events: EventRow[];
  /** スカラー前提値(シミュレーション) */
  baseConsumptionSingleMan: number; // 単身 基本消費(万円/年)
  /**
   * 非住居の基本消費のうち「必須(固定費)」とみなす割合(0〜1)。SPEC §3.3 補足/ADR 固定費線。
   * 家計調査2024 単身世帯の費目別(月・円)から較正。住居39,620と教育0は除外し、非住居計=136,536で割る:
   *   食料43,407 / 光熱水道9,004 / 家具家事4,649 / 被服8,102 / 保健医療8,276 / 交通通信19,681 / 教養娯楽24,961 / その他18,456
   * 必須=食料(自炊)・光熱水道・家具家事・保健医療・交通通信、自由=外食・教養娯楽・被服・交際費・その他。
   *   食料を全部必須なら r=85,017/136,536≈0.62、外食(食料の約3割)を自由へ移すと r≈0.53。範囲0.53〜0.62の中間寄りで 0.55 を採用。
   * 出所: 総務省 家計調査(家計収支編)2024 単身世帯。TODO: 外食/交際費の内訳が取れたら再較正。
   */
  necessityRatioOfNonHousing: number;
  monthlyConsumptionSingleYen: number; // 単身 月消費(円)
  monthlyConsumptionCoupleYen: number; // 夫婦のみ 月消費(円)
  realReturnRatePct: number; // 実質運用利回り(%)
  kaigoSelfRatePct: number; // 介護保険(本人分)率(%)。40歳以上に追加控除。1.62%の折半≈0.81%
  pensionKoseiMan: number; // 厚生年金 平均(万円/年)
  pensionKokuminMan: number; // 国民年金 平均(万円/年)
  minLivingRetirementMonthlyYen: number; // 退職後の最低生活費(円/月)。SPEC §3.7
  defaultRetirementAge: number;
  defaultEndAge: number;
  /** 昇給カーブ: 代表年齢 → 年収(万円) */
  incomeCurve: { age: number; incomeMan: number }[];
  /** 手取り率: 額面年収(万円) → 手取り率(%) */
  netRate: { grossMan: number; netRatePct: number }[];
  /** 消費年齢カーブ(単身): 年齢帯の下限 → 月消費(円)。SPEC §3.3 C-1 */
  consumptionByAge: { fromAge: number; monthlyYen: number }[];
}

export const SNAPSHOT: Snapshot = {
  events: [
    { id: 'marriage', name: '結婚', category: '家族・関係', calcKind: '一回スポット', annualMan: 0, oneTimeMan: 454, durationYears: null, semantic: 'marriage', note: "挙式・新婚旅行等の一回費用が主で総額平均454.3万(うち親援助平均183.5万)。毎年の生活費差は公的統計が無く世帯統合で効率化するため年額0扱い、一回スポットで454万を計上。", source: "リクルート ゼクシィ結婚トレンド調査2024／総務省 家計調査2024" },
    { id: 'divorce', name: '離婚', category: '家族・関係', calcKind: '毎年支出', annualMan: 49, oneTimeMan: null, durationYears: 18, note: "養育費 子1人 月40,468円×12で年約48.6万(受給世帯ベース、継続18年)。受給率は母子世帯で約3割と低く、慰謝料は有責時のみ数十〜300万の一回相場で要確認。", source: "厚労省 令和3年度 全国ひとり親世帯等調査／最高裁 司法統計 令和5年" },
    { id: 'child', name: '子供(1人あたり)', category: '家族・関係', calcKind: '毎年支出', annualMan: 120, oneTimeMan: null, durationYears: 22,
      scheduleMan: [90, 90, 90, 100, 100, 100, 100, 100, 100, 100, 100, 100, 120, 120, 120, 130, 130, 130, 140, 140, 140, 140],
      note: "年齢で大きく変動するため年別表を使い0〜21歳で計上(0〜21歳合計 約2,480万、大学含む)、表示用の年額は段階平均120万。公立・国公立大学・自宅前提で私立や一人暮らしは大きく増。", source: "国立成育医療研究センター2025／文科省 令和5年度 子供の学習費調査／内閣府 子育て費用調査" },
    { id: 'parentcare', name: '親の介護', category: '家族・関係', calcKind: '毎年支出', annualMan: 63.6, oneTimeMan: 47.2, durationYears: 5, note: "在宅介護 月5.3万×12で年約63.6万(施設込み全体平均は月9.0万)。平均介護期間55.0ヶ月で本来有限のため終了年なしだと過大計上、介護度や在宅/施設で大きく変動。", source: "生命保険文化センター 2024年度 生命保険に関する全国実態調査" },
    { id: 'pet_dog', name: 'ペット飼育(犬)', category: '家族・関係', calcKind: '毎年支出', annualMan: 41.4, oneTimeMan: null, durationYears: 15, note: "アニコム調査の犬 年414,159円(約41.4万、継続15年)。ペット保険契約者が対象で平均より高めの母集団バイアスの可能性、物価高で上昇傾向。", source: "アニコム損保 2024最新版 ペットにかける年間支出調査" },
    { id: 'pet_cat', name: 'ペット飼育(猫)', category: '家族・関係', calcKind: '毎年支出', annualMan: 17.8, oneTimeMan: null, durationYears: 15, note: "アニコム調査の猫 年178,418円(約17.8万、継続15年)で犬より安価。ペット保険契約者が対象で平均より高めの母集団バイアスの可能性。", source: "アニコム損保 2024最新版 ペットにかける年間支出調査" },
    { id: 'house', name: '住宅購入(持ち家)', category: '住まい・モノ', calcKind: '毎年支出', annualMan: 40, oneTimeMan: 620, durationYears: 35, note: "維持費の社会平均で年約40万(固定資産税+修繕積立+保険、一戸建て/マンション中位)。ローンは35年で完済し維持費は本来継続するがv1は簡便に35年で全額0としたため長期で維持費を過小評価、本体価格や頭金620万は別前提。", source: "国交省 令和5年度マンション総合調査／SUUMO 戸建ての維持費試算／住宅金融支援機構 フラット35利用者調査" },
    { id: 'move', name: '住み替え・引っ越し', category: '住まい・モノ', calcKind: '一回スポット', annualMan: null, oneTimeMan: 10, durationYears: null, note: "年間家賃増分は社会平均の確報が無く個別の手入力、引っ越し費用は2人約10万+敷礼で家賃4〜6ヶ月分を一回(初期費用)扱い。", source: "総務省 家計調査2023(住居費)／引越し侍 相場" },
    { id: 'car', name: '自動車購入・保有', category: '住まい・モノ', calcKind: '毎年支出', annualMan: 16.7, oneTimeMan: null, durationYears: null, note: "ソニー損保調査の月平均維持費13,900円×12で年約16.7万(税・保険・車検・燃料込み、軽12.8万/セダン21.5万)。自己申告で駐車場代を含まず過少傾向、車両購入費(ローン)は別枠。", source: "ソニー損保 2024年 全国カーライフ実態調査" },
    { id: 'second_house', name: 'セカンドハウス・別荘', category: '住まい・モノ', calcKind: '毎年支出', annualMan: 50, oneTimeMan: null, durationYears: null, note: "2軒目の年間維持費(固定資産税5〜7万+光熱基本料+管理費)の積上げで中央域 年40万前後、公的統計が無く概算50万で確定。管理費はサービスで桁違い、物件購入費は別。", source: "民間ポータル(besso.info、ALSOK)・公的統計なし" },
    { id: 'study', name: '学び直し・資格・大学院', category: '自分への支出', calcKind: '毎年支出', annualMan: 65, oneTimeMan: null, durationYears: 2, note: "国立大学院(修士)入学金28.2万+授業料53.58万/年を2年按分で約67.5万/年(目安65万)。年間学費の公的統計は乏しく私立やMBAは年100万超、専門実践教育訓練給付(最大70%)で実質減。", source: "文科省 国立大学等授業料省令／文科省 社会人の学び直し" },
    { id: 'hobby', name: '特定の趣味(追加分)', category: '自分への支出', calcKind: '手入力', annualMan: null, oneTimeMan: null, durationYears: null, note: "base消費の平均的な教養娯楽費(家計調査 年35.7万)とは別に、特定趣味で追加でかかる分のみを手入力。base平均と重ねず二重計上を回避。", source: "総務省 家計調査2023" },
    { id: 'insurance', name: '保険加入', category: '自分への支出', calcKind: '毎年支出', annualMan: 35.3, oneTimeMan: null, durationYears: null, note: "生保文化センター2024年度調査の2人以上世帯 年間払込保険料平均35.3万(個人年金含む、世帯単位)。分布の山が広く若年単身は年10万前後で平均は高めに引かれる。", source: "生命保険文化センター 2024年度 生命保険に関する全国実態調査" },
    { id: 'beauty', name: '特定の美容・整形(追加分)', category: '自分への支出', calcKind: '手入力', annualMan: null, oneTimeMan: null, durationYears: null, note: "base消費の保健医療・理美容とは別に、特定の美容・整形・高額ジム等で追加でかかる分のみを手入力。base平均と重ねず二重計上を回避。", source: "総務省 家計調査2023(保健医療,参考)／ジム相場(fitmap)" },
    { id: 'invest', name: '投資・資産運用', category: 'お金', calcKind: '運用', annualMan: null, oneTimeMan: null, durationYears: null, note: "NISAつみたて枠1口座 月約14,974円で年約18万(利用者平均)、想定利回り年+4.71%(GPIF設立来)。コストでなく年X万を利回りY%で複利成長させる扱いで、利回りは将来保証なく下振れは決定論モデルで表現不可。", source: "金融庁 NISA／GPIF 2024年度運用状況" },
    { id: 'overseas', name: '海外居住', category: '老後・移動', calcKind: '手入力', annualMan: null, oneTimeMan: null, durationYears: null, note: "v1は手入力で物価自動計算しない。世界単一平均は存在せず国・都市差が極端なため、現地年間生活費・家賃・医療・税・為替前提レートを手入力させる方針。", source: "外務省 世界の医療事情／JETRO 投資関連コスト比較／OECD PPP／Numbeo" },
    { id: 'retire', name: '退職', category: '老後・移動', calcKind: '収入転換', annualMan: 181, oneTimeMan: 1896, durationYears: null },
    { id: 'care_home', name: '介護施設への入居', category: '老後・移動', calcKind: '毎年支出', annualMan: 180, oneTimeMan: null, durationYears: 5, note: "特養ユニット型個室 年約170〜180万、介護付き有料 年約180〜420万で中位デフォルト180万。施設種別・要介護度・地域で2〜3倍変動、有料は入居一時金が別途(数百万〜)で要手入力、平均介護期間4年7ヶ月。", source: "生命保険文化センター 2024年度調査／施設相場(LIFULL介護)" },
    { id: 'illness', name: '大病・長期療養', category: '自分への支出', calcKind: '一回スポット', annualMan: 0, oneTimeMan: 150, durationYears: null, note: "毎年でなく一回スポット費用 約150万(療養半年・月収30万・区分ウ想定で自己負担+収入減の積上げ、年額0)。療養期間や所得で大きく変動、傷病手当金が就労不能の約2/3を最長1年半カバー、2026年8月の高額療養費上限引上げは小幅で影響軽微。", source: "厚労省 高額療養費制度／生命保険文化センター 2022年度 生活保障に関する調査／厚労省 令和5年 患者調査" },
  ],
  baseConsumptionSingleMan: 208,
  necessityRatioOfNonHousing: 0.55,
  monthlyConsumptionSingleYen: 173042,
  monthlyConsumptionCoupleYen: 293511,
  realReturnRatePct: 2.5,
  kaigoSelfRatePct: 0.81,
  pensionKoseiMan: 181,
  pensionKokuminMan: 71,
  minLivingRetirementMonthlyYen: 149000,
  defaultRetirementAge: 65,
  defaultEndAge: 95,
  incomeCurve: [
    { age: 19, incomeMan: 254.9 }, { age: 22, incomeMan: 318.7 }, { age: 27, incomeMan: 389.3 },
    { age: 32, incomeMan: 442.5 }, { age: 37, incomeMan: 493.5 }, { age: 42, incomeMan: 532.7 },
    { age: 47, incomeMan: 565.9 }, { age: 52, incomeMan: 580.2 }, { age: 57, incomeMan: 597.2 },
    { age: 62, incomeMan: 460.0 }, { age: 67, incomeMan: 370.5 },
  ],
  netRate: [
    { grossMan: 300, netRatePct: 80.2 }, { grossMan: 400, netRatePct: 79.2 }, { grossMan: 500, netRatePct: 78.1 },
    { grossMan: 600, netRatePct: 77.1 }, { grossMan: 700, netRatePct: 75.8 }, { grossMan: 800, netRatePct: 74.1 },
    { grossMan: 1000, netRatePct: 71.2 }, { grossMan: 1200, netRatePct: 69.7 }, { grossMan: 1500, netRatePct: 67.2 },
  ],
  consumptionByAge: [
    { fromAge: 0, monthlyYen: 176160 }, // 〜34歳
    { fromAge: 35, monthlyYen: 184749 }, // 35〜59歳
    { fromAge: 60, monthlyYen: 159249 }, // 60〜64歳
    { fromAge: 65, monthlyYen: 154601 }, // 65歳〜
  ],
};
