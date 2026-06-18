# モバイルアプリ化と Supabase 単一基盤への集約

**ステータス**: Accepted (2026-06-17)

**読者**: Life GPS の実装者（本人）。**目的**: フロントを Web(Next.js) から モバイルアプリ(Expo) に変更し、サーバー側処理・DB・認証を Supabase 1基盤に集約する決定と、その理由・却下案・暗黙の前提を記録する。本 ADR は `20260615-architecture-and-thin-abstraction.md` の「決定1（フロント/バックを Next.js に集約）」を supersede する。

# Motivation

## 問題

`20260615-architecture-and-thin-abstraction.md` では、UI とサーバー処理を Next.js に集約し、AI 呼び出しを Route Handlers で実装する方針だった。しかし「いずれ App Store に公開したい」という目標が確定したことで、この前提が成り立たなくなった。

1. **配布形態の変更**: App Store 公開には native アプリが必要で、Web/PWA では出せない（Apple は中身が Web だけのラッパーアプリを認めない）。Next.js の Web UI では App Store に到達できない
2. **フロント土台の選択タイミング**: アプリは未実装（コード・`package.json` ともに無い）。Web で作り込んでから native へ移すと UI 層はほぼ作り直しになる。土台を決めるなら、作り込む前の今が最もコストが低い
3. **サーバー処理の置き場所**: フロントを Next.js から外すと Route Handlers（サーバー側）が無くなり、AI 呼び出しの中継先を別途決める必要がある。API キーはアプリに埋め込めない（解析で漏れる）ため、中継は必ずサーバー側に置く

## 目的

1. App Store に公開できる native アプリの土台を、作り込む前に確定する
2. 言語（TypeScript）・思想（薄い抽象・Anthropic 直叩き）・既存の Supabase 採用は維持し、変更をフロント土台と AI 中継の置き場所に限定する
3. ソロ運用の管理対象を増やさない形で、AI 中継の置き場所を決める

# Scope / Out of Scope

## Scope

- フロント土台を Web(Next.js) から モバイル(Expo / React Native) へ変更する決定
- AI 中継処理の置き場所の選定（Supabase Edge Functions vs Vercel）
- サーバー側処理・DB・認証を Supabase 1基盤に集約する方針
- 上記に伴う `20260615-architecture-and-thin-abstraction.md` の決定1の supersede

## Out of Scope

- Anthropic API 直叩き・薄い抽象の方針（`20260615-architecture-and-thin-abstraction.md` の決定3を維持。変更しない）
- Supabase をデータストア・認証に使う方針（同 ADR の決定2を維持）
- Expo の具体的なプロジェクト構成・画面設計・状態管理ライブラリの選定
- Edge Functions の具体的な実装・関数分割
- App Store 申請フロー・審査対応の詳細

# 結果

## Pros

- 未実装の段階で native 土台を選ぶことで、Web → native の作り直しを回避できる
- 言語は TypeScript のまま、Supabase / Anthropic もそのまま使えるため、変更範囲がフロント土台と AI 中継の置き場所に限定される
- AI 中継・DB・認証を Supabase に集約することで、管理画面・契約先・秘密鍵の置き場・認証の受け渡しが 1か所で完結し、ソロ運用の負荷が下がる（`20260615-architecture-and-thin-abstraction.md` の「管理対象を減らす」思想と一貫）
- Expo は Web も同時に出力できる（react-native-web）ため、将来 Web 版が必要になっても同一コードベースで対応できる余地が残る

## Cons

- Supabase Edge Functions は Deno ランタイムであり、Node 前提のコード例をそのまま使えない場合がある（Anthropic 呼び出し自体は標準 fetch ベースで動くため実害は小さい）
- フロントが Expo になることで、Next.js の Web 一体型開発体験は得られない
- Supabase 1社へのロックインが強まる（ただし Postgres ベースで移行余地は残る、という元 ADR の評価は維持）

# 決定 & 結論

## 1. フロント土台は Expo (React Native) を採用する

**決定**: UI の土台を Next.js(Web) から **Expo (React Native)** に変更する。言語は TypeScript を維持する。

App Store 公開には native アプリが必須であり、Web/PWA では到達できない。アプリは未実装のため、土台を native に切り替えるコストは現時点ではゼロに近い一方、Web で作り込んでから移すと UI 層の作り直しが確定する。したがって「先回りして重い抽象を入れない」（元 ADR の方針）に反せず、むしろ確定する作り直しを避ける低リスクな選択として、作り込む前に Expo を選ぶ。

Expo を選ぶ理由（素の React Native ではなく）: 環境構築・ビルド・実機プレビューを肩代わりし、Xcode と直接格闘せずに開始できる。Web 出力（react-native-web）も持つため将来の Web 版の余地も残る。

## 2. AI 中継・DB・認証は Supabase 1基盤に集約する

**決定**: AI 呼び出しの中継処理を **Supabase Edge Functions** に置き、DB・認証と合わせてサーバー側を Supabase 1基盤に集約する。元 ADR の「Route Handlers で AI を呼ぶ」は、置き場所を Edge Functions に変更する形で実質を引き継ぐ（Anthropic 直叩き・薄い抽象は不変）。

### 比較検討した選択肢

| 候補 | 採否と理由 |
|---|---|
| Vercel に Next.js を API 専用で残す（2基盤） | 不採用。Node ランタイムで Anthropic 呼び出しを素直に書ける利点はあるが、UI が Expo に移ると Vercel に残るのは AI 中継の小関数のみで、Vercel 最大の強み（Next.js による UI＋処理の一体開発）が活かせない。小関数1つのために契約・管理画面・秘密鍵の置き場を 2か所に増やすのは、ソロ運用では割に合わない |
| Supabase Edge Functions に集約（採用） | 採用。サーバー処理・DB・認証が 1か所で完結し、管理対象が増えない。Edge Functions は Supabase の認証情報をそのまま検証でき、DB アクセスも内部完結するため配線が少ない |

### 逆転条件（この決定を再評価する契機）

以下が現実になった場合は、Vercel 併用（2基盤）を改めて検討する。先回りはしない。

- AI 処理が重くなる（応答ストリーミング、複数回の連鎖呼び出し、Node 専用 npm への依存）— Node ランタイムの優位が効く場面
- App Store 公開に合わせて宣伝用 Web サイト/LP を作る — Next.js + Vercel が得意（ただし LP は後からどこにでも追加でき、現時点の決め手にはならない）

# 備考 & 資料

## 暗黙の前提（明文化）

- **Apple Developer Program は年 $99 の固定費**。App Store 公開には必須で回避できない。開発・実機テストまでは無料だが、ストア公開の権利のみ有料
- **Anthropic API は従量課金**（AI 相談のたびにトークン費用が発生）。個人利用なら少額だが無料ではない
- **Supabase 無料プランのプロジェクトは一定期間未使用で一時停止する**。たまにしか使わない個人ツールでは、再開操作が要る点を運用上の前提とする
- これらにより、「作って自分のスマホで動かす」までは実質無料、「App Store 公開 ＋ AI 利用」段階で初めて費用が発生する、という費用構造になる

## 関連ADR

- `20260615-architecture-and-thin-abstraction.md` — 本 ADR が決定1を supersede。決定2（Supabase）・決定3（Anthropic 直叩き・薄い抽象）は維持
- `20260615-ai-advisory-layer.md` — AI 中継（Edge Functions）が呼び出す相談層
- `20260615-simulation-model.md` / `20260615-input-model-and-data-sources.md` — フロント（Expo）または Edge Functions で動く計算ロジック

## 今後検討すべき項目

- シミュレーション計算をフロント(Expo)とサーバー(Edge Functions)のどちらで回すか（応答速度と純粋関数としての再利用性の兼ね合い）
- Edge Functions（Deno）での Anthropic 呼び出しの具体実装と、薄いラッパ1枚の形
- Expo の状態管理・ナビゲーション・双六UIの描画手段の選定
- App Store 申請に必要な要件（プライバシー表記・サインイン要件等）の洗い出し

---

# 追補 (2026-06-19): v1 のデータストアは Notion、Supabase は採用見送り

**目的**: 本 ADR の決定2（AI 中継・DB・認証を Supabase 1基盤に集約）を、v1 について見直す。Supabase は当面採用せず、データストアは Notion とする。本追補は決定2を v1 の範囲で supersede する（個人ツールの範疇を超えたら Supabase へ移行する前提は維持）。

## 決定E. v1 は Notion をデータストアとし、Supabase は採用しない

**決定**: v1 のデータは Notion に置く。前提値マスタ（ライフイベント別 年額コスト等）は既に Notion DB にあり、アプリはそこから読む。Supabase は v1 では使わない。

**Why**: 利用者は本人1人で、前提値は読むだけ・ユーザーデータも書込頻度が低い。Notion API の遅さ・レート制限（毎秒数回）は個人利用では実害が小さく、インフラ・契約・運用がゼロになる（単一基盤よりさらに身軽）。前提値を Notion 上で手編集できる利点も活きる。

**移行条件**: 個人アプリの範疇を超える（他人も使う／同時利用／App Store 本格公開で規模が出る）場合に Supabase へ移行する。Postgres ベースで移行余地がある、という元 ADR の評価は維持。

## 決定F. 核アプリはステートレス（保存機能なしでも成立させる）

**決定**: アプリの核（入力 → 未来を計算 → 表示、what-if サンドボックス）は端末内で完結するステートレスな処理とし、**保存機能が無くても使える**ようにする。シナリオ・入力履歴・主観反応ログの保存は、後から足す**任意レイヤ**とする。

**Why**: 最小で価値（現在地と未来が見える）を出せる。保存・認証・サーバを後回しにでき、v1 の実装と公開が速い。

## 暗黙の前提（明文化）— シークレットの扱い

- Notion API は**シークレットトークン**を要する。モバイルアプリから直接呼ぶとトークンがアプリに埋まり漏洩する。よって:
  - **前提値の読み取り（実装中）= Notion API を直接読む**（決定: 実装中は値を頻繁に変えるため、JSON 凍結より直読みが手戻りなく速い）。トークンは**開発機の `.env` のみ**に置き、コミット・配布しない。Notion のレート制限（毎秒数回）を避けるため、起動時に一括取得してメモリにキャッシュし、ポーリングはしない。
  - **配布時（公開前に再判断）**: トークンは配布アプリに埋められないため、(a) 前提値を JSON に凍結して同梱する、(b) 読みを小さな中継(proxy)に通す、のどちらかを選ぶ。実装中の直読みは開発フェーズ限定の運用とする。
  - **保存（Notion への書込）・AI 相談（Anthropic 呼び出し）**を足す段では、トークン／API キーを隠す小さな中継（serverless 等）が必要。**その時点で置き場所を決める**（本 ADR では未決）。
- これにより v1（読むだけ＋保存なし）はサーバー・シークレットなしで最小公開できる。

## 決定2（Supabase Edge Functions に AI 中継を集約）への影響

AI 相談層を実装する段で、Anthropic キーを隠す中継先を改めて決める（Supabase に戻す／別の serverless にする）。v1 に AI 相談を含めないなら、この判断自体を後ろ倒しできる。
