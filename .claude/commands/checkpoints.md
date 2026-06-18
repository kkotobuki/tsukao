---
description: 保存されているチェックポイント一覧を表示する
---

グローバルチェックポイント領域から、現在のプロジェクトのチェックポイント一覧を表示してください。

## 保存場所

```
~/.claude/checkpoints/<エンコード済プロジェクトパス>/
```

エンコード規則: 現在の作業ディレクトリ（`pwd`）の `[^a-zA-Z0-9._]` を `-` に置換。

## 動作

### Step 1: チェックポイントを列挙

```bash
CHECKPOINTS_DIR="$HOME/.claude/checkpoints/<エンコード>"
ls -lt "$CHECKPOINTS_DIR"/*.md 2>/dev/null
```

存在しない場合は「このプロジェクトにはチェックポイントが保存されていません」と伝えて終了。

### Step 2: 各ファイルの frontmatter を読み取る

各 `.md` ファイルを `Read` で開き、frontmatterから以下を抽出:
- `type` (auto / manual)
- `created`
- `expires`
- `tag`
- `git_branch`

### Step 3: 期限判定

- `expires` が現在時刻より前 → **期限切れ**としてマーク
- 残り日数を計算

### Step 4: 一覧を表形式で表示

```
📋 チェックポイント一覧（<プロジェクト名>）

| 状態 | ファイル名 | 種別 | タグ | ブランチ | 残り |
|---|---|---|---|---|---|
| ✅ | _latest.md | 自動 | (auto) | feature/login-form | 7日 |
| ✅ | 20260521-1430-pr-review-中.md | 手動 | pr-review-中 | feature/login-form | 30日 |
| ✅ | 20260520-1100-refactor-start.md | 手動 | refactor-start | refactor/api | 29日 |
| ⚠️ | 20260513-1500-old-bug.md | 手動 | old-bug | feature/old | 期限切れ |

合計: 4件（有効3、期限切れ1）

期限切れのチェックポイントは次のSessionStart時に自動削除されます。
即時削除したい場合は「期限切れを削除して」と指示してください。
```

### Step 5: 操作の案内

一覧表示後、以下を案内:

> 操作:
> - `/resume <タグ>` で復元
> - 「期限切れを削除して」で即時クリーンアップ
> - 「<タグ> を削除して」で個別削除
> - 全プロジェクトのチェックポイントを見るには `ls ~/.claude/checkpoints/`

## オプション: 全プロジェクト横断表示

ユーザーが「全プロジェクト」「全部」「all」等と指示した場合:

```bash
ls -lt ~/.claude/checkpoints/*/*.md 2>/dev/null
```

を実行し、プロジェクト別にグルーピングして表示。

## オプション: 期限切れの即時削除

ユーザーが「期限切れを削除」「クリーンアップ」等と指示した場合:

```bash
# expiresが現在時刻より前のチェックポイントを削除（_latest.mdは除外）
```

削除後に削除件数を報告。
