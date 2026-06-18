---
description: 現在の作業状態を明示的にチェックポイントとして保存する（30日TTL）
argument-hint: <tag-name>（例: pr-review, bug-investigation）
---

現在のセッションの作業状態を、グローバルチェックポイント領域に明示保存してください。

## 引数

- `$ARGUMENTS` にユーザーが指定したタグ名が入る（例: `pr-review-中`）
- 未指定の場合は「current」をタグ名として使用

## 保存先（グローバル）

```
~/.claude/checkpoints/<エンコード済プロジェクトパス>/<YYYYMMDD-HHMM>-<tag>.md
```

エンコード規則: 現在の作業ディレクトリのフルパスから、`[^a-zA-Z0-9._]` を全て `-` に置換。

例: `/Users/jemka/Desktop/EVeM/survey/survey_monorepo`
→ `-Users-jemka-Desktop-EVeM-survey-survey_monorepo`
→ `~/.claude/checkpoints/-Users-jemka-Desktop-EVeM-survey-survey_monorepo/20260521-1430-pr-review-中.md`

## 事前準備

1. 保存先ディレクトリを取得:
   - 現在の作業ディレクトリ（`pwd` で取得）をエンコード
   - `mkdir -p ~/.claude/checkpoints/<エンコード>` で確保
2. 現在のGit状態を取得（gitリポジトリなら）:
   - `git branch --show-current` でブランチ名
   - `git status --short` で未コミット状態
   - `git log --oneline -5` で直近コミット
3. 関連PRを取得（任意）: `gh pr list --head <ブランチ> --json number,title,url --jq '.[0]'`

## ファイルの中身

以下のフォーマットでMarkdownを書き込む:

```markdown
---
type: manual
created: <ISO8601形式の現在時刻>
expires: <30日後のISO8601>
project: <現在のプロジェクト名（basename）>
working_dir: <絶対パス>
git_branch: <ブランチ名 or "none">
git_dirty: <true/false>
tag: <タグ名>
related_pr: <PR番号があれば>
---

## 保存理由

（このセッションで「なぜ保存するのか」を1-3行で書く。タグだけで分からない補足情報）

## やっていたこと

（直近の作業内容を3-5行で要約。技術的詳細を含める）

## 次にやること

- [ ] （TODO項目を具体的に。ファイル名・関数名・コマンドまで含めて書く）
- [ ] （次セッションでこれを見たら即着手できるレベルの粒度）

## コンテキスト

- 関連ファイル:
  - `<file path>` (<状態: 修正中/参照/etc>)
  - `<file path>` (<状態>)
- 関連コマンド: （実行予定のテスト・デプロイコマンド等）
- 関連リンク: （PR / Issue / Slack / ドキュメント等）

## 詰まっている点・確認事項

（あれば書く。なければ「特になし」と明記）

## 直近のやり取りの要約

（このセッションでユーザーと何を議論したか、何を決めたかを箇条書きで5-10項目）
```

## 保存後の表示

ユーザーに以下のメッセージを表示：

> ✅ チェックポイントを保存しました
>
> - ファイル: `~/.claude/checkpoints/<エンコード>/<filename>`
> - タグ: `<タグ名>`
> - 有効期限: <30日後>
>
> 復帰時は `/resume <タグ>` でこのチェックポイントを呼び出せます。

## 重要

- **memoryには書き込まない**。チェックポイントだけに保存する
- ユーザーの好みや長期事実は別途memoryへ。作業状態はcheckpointへ
- `_latest.md` は自動保存用なので、このコマンドでは上書きしない（必ず日付付きファイル名）
- 保存先は**グローバル**（`~/.claude/checkpoints/`配下）。プロジェクトディレクトリは汚さない
