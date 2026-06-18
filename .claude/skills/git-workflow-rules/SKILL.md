---
name: git-workflow-rules
description: 【MUST USE - git作業時は必ず参照】このプロジェクトでブランチを切る・PRを作成する際のルール。以下のいずれかが該当したら必ずこのスキルを先に読み込む：(1) ブランチを切る／切り替える操作、(2) PRを作成する操作、(3) `/create-pull-request` `/implement-task` `/merge-to-main` のコマンド実行時、(4) ユーザーが「ブランチを切って」「PR作って」「マージしたい」等と依頼した場合。命名規則・PRタイトル・PR本文テンプレ・マージ前チェックの統一ルールを定義する。
---

# Gitワークフロー規則

このプロジェクトで **ブランチ作成 / PR作成 / マージ** を行う際に必ず従うルールです。
既存コマンド（`/implement-task`, `/create-pull-request`, `/merge-to-main`）の動作と整合させること。

---

## 1. ブランチ命名規則

### 形式

```
<type>/<kebab-case-description>
```

### 種別プレフィックス

| プレフィックス | 用途 | 例 |
|---|---|---|
| `feature/` | 新機能追加 | `feature/add-user-login` |
| `fix/` | バグ修正 | `fix/header-overflow-on-mobile` |
| `refactor/` | 内部実装の整理（挙動変更なし） | `refactor/extract-validation-logic` |
| `docs/` | ドキュメントのみの変更 | `docs/update-readme-install` |
| `chore/` | 設定・依存関係・周辺整備 | `chore/upgrade-typescript` |
| `test/` | テストの追加・修正 | `test/add-survey-e2e` |
| `perf/` | パフォーマンス改善 | `perf/optimize-survey-query` |

### 命名のルール

- **kebab-case**（ハイフン区切り・小文字）
- 「動詞-対象-詳細」の順
  - ✅ `feature/add-user-login`
  - ❌ `feature/user-login-add`（動詞が末尾）
  - ❌ `feature/AddUserLogin`（camelCase）
  - ❌ `feature/add_user_login`（snake_case）
- 30文字以内を目安
- 個人名・日付は入れない（`feature/kashima-20260521-login` はNG）

---

## 2. ブランチ作成手順

### 🚨 絶対ルール: 必ず `develop` から切る

**例外なく、すべてのブランチは `develop` から切る**。
hotfix・緊急対応も含めて、main や他のブランチから切ることは禁止。

### 基本フロー

```bash
# 1. developブランチを最新化（必須）
git fetch origin develop

# 2. developから新規ブランチを作成
git checkout -b <type>/<description> origin/develop
```

### developから切れているか確認

ブランチ作成後、念のため以下で確認:

```bash
# 現在のブランチがdevelopから切られたものか確認
git log --oneline origin/develop..HEAD
# → コミットが1つも無ければ「切り立て」状態（OK）

# 万一 main などから切ってしまった場合
# → そのブランチは破棄して develop から切り直すこと
```

### developブランチが存在しない場合

`git ls-remote --heads origin develop` で確認。存在しない場合は **作業を中止してユーザーに確認** すること（勝手に main を base にしない）。

### 作成前のチェック

- 現在のブランチが汚れていないか（`git status --porcelain` で確認）
- 未コミット変更がある場合は stash するか確認
- リモートの develop が最新化されているか（`git fetch origin develop`）

---

## 3. PRタイトル規則（Conventional Commits）

### 形式

```
<type>: <概要>
```

- **70文字以内**
- type はブランチプレフィックスと一致させる（feat / fix / refactor / docs / chore / test / perf）
- 概要は日本語OK、命令形ではなく完了形（「追加した」「修正した」）

### 例

| ✅ Good | ❌ Bad |
|---|---|
| `feat: ユーザーログイン機能を追加` | `ログイン機能` (typeなし) |
| `fix: モバイルでヘッダーが崩れる問題を修正` | `fix:バグ修正` (情報量不足、コロン後スペース無し) |
| `refactor: validation 関数を分割` | `Refactor: validation.tsの整理` (Type大文字) |

### typeとブランチプレフィックスの対応

| ブランチ | PRタイトル type |
|---|---|
| `feature/...` | `feat:` |
| `fix/...` | `fix:` |
| `refactor/...` | `refactor:` |
| その他 | 同名 |

---

## 4. PR本文テンプレート

```markdown
## 概要

- このPRで何をしたか・なぜしたかを1-3行で記述

## 変更内容

- 主な変更点を箇条書き（5項目程度）
- ファイル単位ではなく「機能・観点」単位で書く

## 動作確認

- [ ] {変更内容に応じた具体的な確認項目}
- [ ] {例: ログイン画面でメールアドレスを入力して送信→ダッシュボードに遷移}

## チェック項目

- [x] このPRは `/create-pull-request` で作成した
- [ ] `/pre-review` を実行し、指摘事項を解消済み
- [ ] `pnpm lint` 通過
- [ ] `pnpm build` 通過
```

### 本文作成時のルール

- 各セクションはコミットメッセージや差分から読み取れる情報で埋める
- 推測で補えない情報は **ユーザーに確認してから埋める**
- 「動作確認」は変更内容に応じて **具体的な手順** を生成する（汎用的なテンプレ文言にしない）
- 嘘・誇大表現は書かない（`/pre-review` をやってないなら `[ ]` のまま）

---

## 5. マージ前チェック（必須）

PR作成前に以下を必ず実行：

| # | チェック | コマンド |
|---|---|---|
| 1 | lint通過 | `pnpm lint`（変更があるアプリディレクトリで） |
| 2 | build通過 | `pnpm build`（同上） |
| 3 | 未コミット無し | `git status --porcelain` |
| 4 | コミット履歴の整理 | `git log origin/develop..HEAD --oneline` でWIPコミット等が無いか確認 |
| 5 | `/pre-review` 実行 | マルチエージェントレビュー |

これらは `/pre-review` コマンドで自動化されている。手動でPR作成する場合も同等の確認を行うこと。

---

## 6. マージ運用

### feature → develop

- **PR経由**（`/create-pull-request` で作成）
- Open で作成（Draft では作らない）→ セルフレビュー → マージ
- マージ方式: **Merge commit**（developの履歴を保持）
- Squash・Rebase は使わない

### develop → main

- **PR経由**（`/merge-to-main` で作成）
- developにあるコミットは全て含める（部分マージ・cherry-pick禁止）
- マージ方式: **Merge commit**
- マージ後は `version-tagging` スキルでタグを打つ

---

## 7. 禁止事項

| ❌ NG | 理由 |
|---|---|
| **`develop` 以外のブランチからブランチを切る** | 絶対ルール違反。必ず `develop` から切ること |
| `main` / `develop` への直接コミット | レビュー無しの本番反映を防ぐ |
| `git push --force` to `main` / `develop` | 履歴破壊。他者の作業を巻き戻す |
| `--no-verify` フラグでhookスキップ | pre-commit hookが無効化される |
| レビュー無しでのfeature→developマージ | 品質低下 |
| 個人名・日付入りブランチ名 | スケールしない |
| 巨大PR（差分1000行超） | レビュー困難。500行を目安に分割 |

---

## 8. 緊急対応（hotfix）も必ず develop から

本番障害でも例外なく **`develop` から `fix/` ブランチを切る**：

```bash
# 1. developを最新化
git fetch origin develop

# 2. developから fix/ ブランチを切る
git checkout -b fix/<description> origin/develop

# 3. 修正・コミット → /pre-review → /create-pull-request（base=develop）
# 4. developにマージ後、/merge-to-main で develop→main を実行
```

**理由**: 例外を作るとブランチ運用が複雑化し、事故が増える。緊急時こそ通常フローを通すことで安全性を担保する。
mainから直接切る運用は本プロジェクトでは認めない。
