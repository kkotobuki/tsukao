/**
 * Life GPS シミュレーション 型定義
 *
 * 方針(ADR: 20260615-simulation-model):
 * - すべて現在価値(今日の円)。物価は無視。昇給率・運用利回りは「実質」で解釈する。
 * - 平均一本線(決定論)。確率分岐はしない。
 * - 金額の単位は「円」で統一する(Notion DB は万円なので、取り込み境界で ×10000 する)。
 */

/** イベントの計算区分(Notion DB「計算区分」に対応) */
export type CalcKind =
  | '毎年支出' // 開始年齢から毎年一定額が乗り続ける
  | '一回スポット' // その年に1回だけかかる(結婚式・頭金・退職金・大病)
  | '収入転換' // 収入側が切り替わる(退職→年金)
  | '運用' // 毎年X円を実質利回りで複利成長(投資)
  | '手入力'; // 社会平均が無く本人が値を入れる(海外居住・住み替え)

/** ライフイベントのマスタ定義(Notion DB「ライフイベント別 年額コスト」1行に対応) */
export interface LifeEventDef {
  id: string;
  name: string; // 例: 子供(1人あたり)
  category: string; // 例: 家族・関係
  calcKind: CalcKind;
  /** 年額(円・現在価値)。'一回スポット'/'手入力' では null のことがある */
  annualYen: number | null;
  /** 初期費用=一回だけの費用(円)。無ければ null */
  oneTimeYen: number | null;
  /**
   * 案1: 継続年数。開始年齢から数えてこの年数だけ年額が乗り、以降は0。
   * null/undefined なら終了年なし(無期限・従来どおり)。例: 住宅ローン=35, 親の介護=5
   */
  durationYears?: number | null;
  /**
   * 案2: 年別スケジュール。経過年(0始まり)→ 年額(円)。配列長を超えた経過年は0。
   * 年で金額が大きく変わるもの(子供など)に使う。指定時は annualYen/durationYears より優先。
   */
  scheduleYen?: number[] | null;
  /**
   * 特別扱いフラグ(SPEC §3.3 状態変化)。
   * 'marriage'=結婚: 開始年以降 結婚増分(夫婦のみ−単身)を消費へ加算。
   * (住宅購入は SimulationInput.housingPlan の選択軸で扱う)
   */
  semantic?: 'marriage';
}

/**
 * 住居プラン(SPEC §3.1 の住居軸)。賃貸/購入/持ち家を1つの選択で表す。
 * '賃貸'/'持ち家' は家賃が base 消費に含まれる/含まれない現状の記述で、計算上の追加はなし。
 * '購入' のみ、購入年から「家賃→ローン＋維持に置換」＋頭金(一回)が効く。
 */
export type HousingPlan =
  | { kind: '賃貸' } // ずっと賃貸(家賃は base 消費に含まれたまま)
  | { kind: '持ち家' } // ずっと持ち家(家賃なし・維持費は base に含む)
  | {
      kind: '購入'; // ◯歳でマイホーム購入(今は賃貸)
      buyAge: number; // 購入する年齢
      annualCostYen: number; // 購入後の年額(ローン＋維持。Notion「住宅購入」行)
      downPaymentYen: number; // 頭金(一回)
      loanDurationYears?: number | null; // 継続年数(超で年額0。v1は全額。例:35)
    };

/** シナリオに配置した1イベント(マスタ + 配置情報 + 任意の上書き) */
export interface PlacedEvent {
  def: LifeEventDef;
  /** このイベントを開始する年齢 */
  startAge: number;
  /** 年額の上書き(円)。手入力やユーザー調整。未指定なら def.annualYen を使う */
  annualOverrideYen?: number | null;
  /** 一回費用の上書き(円)。未指定なら def.oneTimeYen を使う */
  oneTimeOverrideYen?: number | null;
  /** 運用イベント用: 毎年いくら投資に回すか(円) */
  annualInvestmentYen?: number;
  /**
   * 同時の個数(頭数・人数)。未指定=1。年額・初期費用・スケジュール額に乗算する。
   * 例: 犬を2頭同時に飼う=2。「飼い直し(時間差で複数回)」は別の PlacedEvent を時期をずらして配置する。
   */
  count?: number;
}

/** 名前付きシナリオ(結婚バージョン等。複数イベントを重ねられる=ADR 決定A) */
export interface Scenario {
  id: string;
  name: string;
  events: PlacedEvent[];
}

/**
 * 基本消費の出どころ(可変オプション=レバー)。
 * 消費は固定せず、本人がサンドボックスで選択・上書きできる。
 */
export type ConsumptionBasis =
  | { kind: 'fromSavings' } // 既定: 手取り − 毎月貯蓄×12(本人の実態から逆算)
  | { kind: 'average' } // Notion の単身平均(assumptions.baseAnnualConsumptionYen)
  | { kind: 'explicit'; annualYen: number }; // 直接指定(円・現在価値)

/** 利用者の入力(必須4項目 + 試算設定) */
export interface SimulationInput {
  /** 現在の年齢 */
  currentAge: number;
  /** 額面年収(現在価値・円) */
  grossAnnualIncomeYen: number;
  /** 現在の金融資産(円) */
  currentAssetsYen: number;
  /** 毎月の貯蓄額(円) — 現状のグラウンドトゥルース */
  monthlySavingsYen: number;
  /** 退職年齢(任意・既定は DEFAULT_RETIREMENT_AGE) */
  retirementAge: number;
  /** 試算の終端年齢(任意・既定は DEFAULT_END_AGE) */
  endAge: number;
  /** 基本消費の出どころ(未指定なら { kind: 'fromSavings' }) */
  consumptionBasis?: ConsumptionBasis;
  /** 現在の世帯パターン(未指定なら '単身')。将来の結婚は marriage イベントで足す */
  householdPattern?: '単身' | '夫婦のみ';
  /** 住居プラン(選択軸)。賃貸/持ち家/◯歳で購入。未指定なら { kind: '賃貸' } */
  housingPlan?: HousingPlan;
  /** 現在の家賃(円/年)。housingPlan='購入'時、購入年以降この額を消費から除く(家賃置換) */
  currentRentYen?: number;
  /** 退職後パートの収入(円/年)。退職後の手取りに加算する */
  retirementPartTimeYen?: number;
}

/** 前提値(Notion 由来。すべて実質・現在価値) */
export interface Assumptions {
  /**
   * 年齢 → その年齢の実質年収係数(現在の年収を 1.0 とした相対カーブ)。
   * 例: 現在30歳=1.0, 45歳=1.3 のような昇給カーブ(賃金センサス由来・実質)。
   */
  realIncomeCurve: (age: number) => number;
  /** 単身ベースの年間消費(円・現在価値)。家計調査由来 */
  baseAnnualConsumptionYen: number;
  /**
   * 年齢別の消費水準(相対値)。SPEC §3.3/C-1 の消費増加率カーブ(単身・実質)。
   * simulate は現在年齢で正規化して係数化する: 係数(age) = level(age)/level(currentAge)。
   * 例: 現役ほぼ一定 → 60歳で約-14% → 65歳以降 約-0.6%/年。
   */
  consumptionLevelByAge: (age: number) => number;
  /** 実質運用利回り(例: 0.03 = 年3%) */
  realInvestmentReturnRate: number;
  /** 実質ベースアップ率(物価超の実質賃上げ・年率)。既定0(省略可) */
  realBaseUpRate?: number;
  /** 結婚増分(円/年)。結婚(marriage)イベント発生後に消費へ加算。夫婦のみ−単身 */
  marriageIncrementYen?: number;
  /** 額面年収(円) → 手取り(円) 変換(所得税・住民税・社会保険料を控除) */
  grossToNetYen: (grossYen: number) => number;
  /** 退職後の公的年金(年額・円・現在価値) */
  pensionAnnualYen: number;
}

/** 1年分の試算結果 */
export interface YearProjection {
  age: number;
  grossIncomeYen: number; // 額面収入(退職後は0)
  netIncomeYen: number; // 手取り(退職後は年金)
  consumptionYen: number; // 基本消費
  eventAnnualYen: number; // イベントの毎年支出合計
  eventOneTimeYen: number; // イベントの一回費用(その年に発生した分)
  annualInvestmentYen: number; // その年に実際に投資ポットへ移した額(現金が許す範囲)
  investmentReturnYen: number; // 投資ポットの当年の運用リターン
  withdrawnYen: number; // 現金不足を補うため投資ポットから取り崩した額(売却)
  investedYen: number; // 年末の投資ポット残高(含む含み益)
  netFlowYen: number; // 当年の純資産増減(手取り - 消費 - イベント + 運用リターン)
  assetsYen: number; // 年末の総資産(現金 + 投資ポット)
}

/** シミュレーション全体の結果 */
export interface SimulationResult {
  years: YearProjection[];
  /** 退職時点の資産(円) */
  assetsAtRetirementYen: number;
  /** 終端年齢時点の資産(円) */
  assetsAtEndYen: number;
  /** 体感変換: 退職時資産が「今の年間生活費の何年分」か(ADR: 自己参照的充足) */
  retirementYearsOfLivingCost: number;
  /** 資金が尽きる(総資産が初めてマイナスになる)年齢。最後まで尽きなければ null */
  depletionAge: number | null;
}
