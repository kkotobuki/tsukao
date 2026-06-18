---
name: init-project
description: 【新規プロジェクト立ち上げ - 自動発火】AI 自律化テンプレ (CLAUDE.md / hooks / commands / skills) を新規プロジェクトに適用する。以下のいずれかで自動発火する：(1) ユーザーが「新しいプロジェクトを作成する」「新プロジェクト始めます」「init-project」「bootstrap」「ブートストラップ」などの語を発した時、(2) 現在のディレクトリに .claude/ が無い新規プロジェクトで Claude Code を起動した時、(3) /init-project コマンドが叩かれた時。発動したら「AI 自律化テンプレを適用します」と宣言してから手順を実行する。
---

# init-project

新規プロジェクトに AI 自律化テンプレを適用するスキル。

---

## 前提

- **テンプレ場所**: `/Users/jemka/Desktop/productivity improvement`
- `bootstrap.sh` が実行可能になっていること

このパスは固定。別マシンに移行した場合は SKILL.md 内のパスを書き換える。

---

## 手順

### 1. target ディレクトリの確認

ユーザーから「どこに適用するか」を聞く。引数で受け取っていればそれを使う。

ヒアリング例:
> 「どのディレクトリに AI 自律化テンプレを適用しますか? (絶対パスで指定してください)」

target が以下のいずれかなら中断する:
- テンプレ自身 (`/Users/jemka/Desktop/productivity improvement`)
- ホームディレクトリ直下 (`/Users/jemka`)
- ルート (`/`)

### 2. bootstrap.sh を実行

ユーザーに「AI 自律化テンプレを適用します」と宣言してから:

```bash
bash "/Users/jemka/Desktop/productivity improvement/bootstrap.sh" <target-directory>
```

bootstrap が以下を対話で聞いてくるので、ユーザーに転送する:
- プロジェクト概要 (1-2 行で何のシステムか・誰が使うか)
- 技術スタック (フレームワーク・DB・認証等)

bootstrap は package.json があれば scripts を自動抽出する。

### 3. 整備度チェック

bootstrap 完了後、target ディレクトリで整備度チェックを実行:

```bash
cd <target-directory>
bash scripts/check_readiness.sh
```

判定が「◎ AI 完全自律可能」と出れば成功。出ない場合は出力を読んで不足項目を特定する。

### 4. ユーザーに次のアクションを伝える

成功時のメッセージ例:

```
✅ AI 自律化テンプレ適用完了 (<target-directory>)

次にやること:
  1. cd <target-directory>
  2. claude   ← このディレクトリで Claude Code を起動
  3. CLAUDE.md を編集 (任意項目: ディレクトリ構成・テスト方針・ドメイン知識)
```

---

## 注意事項

- bootstrap.sh は破壊的ではない。既存ファイルとの衝突は対話で Override / Skip / Backup を選択する形になる
- target ディレクトリが存在しない場合は bootstrap が作成可否を確認する
- hook が動作するのは新規 target ディレクトリで Claude Code を**起動した後**から (起動済みセッションには反映されない)

---

## 参考

- 関連 skill / command（v0.4.0 以降は project 配下にバンドル）:
  - `/checkpoint` `/checkpoints` `/resume` — チェックポイント保存/復元
  - `/merge-to-main` — develop → main リリースPR
  - `/measure-ai-usage` — 月次計測
  - `/create-pull-request` `/implement-task` — 作業フロー系
- テンプレ詳細:
  - `<TEMPLATE>/CLAUDE.md` — 共通安全ルール + skeleton（§6 で日本語前提を明文化）
  - `<TEMPLATE>/.claude/settings.json` — hooks 7種類設定（pnpm 前提）
  - `<TEMPLATE>/.claude/hooks/*.sh` — UserPromptSubmit / PreToolUse / PostToolUse / PreCompact / SessionStart / SessionEnd / Stop
  - `<TEMPLATE>/scripts/check_readiness.sh` — 整備度チェック
