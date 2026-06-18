---
description: developブランチの内容を全てmainに反映するリリースPRを作成する
---

`develop` ブランチの **HEAD 全体** を `main` に反映するためのリリースPRを作成してください。
**基本方針**: develop にあるコミットは全て main に上げる（部分マージ・cherry-pickは行わない）。

## 事前チェック

1. gitリポジトリか確認:
   - `git rev-parse --is-inside-work-tree` で確認。失敗したら中止
2. リモート構成の確認:
   - `git ls-remote --heads origin develop main` で develop と main の両方が存在するか確認
   - どちらか欠けていればその旨を伝えて中止
3. 既存のリリースPR確認:
   - `gh pr list --base main --head develop --state open` を実行
   - 既に開いているPRがあれば、そのURLを提示して「既にリリースPRが存在します」と伝え終了

## 差分の把握

1. `git fetch origin` でリモート最新化
2. `git log origin/main..origin/develop --oneline` で main にまだ入っていないコミットを取得
3. 差分が0ならリリース不要としてその旨を伝え終了
4. `git diff --stat origin/main...origin/develop` でファイル変更規模を表示

## developブランチのCI状態確認

1. `gh run list --branch develop --limit 5` でdevelopの直近CI結果を確認
2. 最新の実行が `success` でない場合:
   - 失敗中である旨を伝え、「失敗したままリリースPRを作成しますか？」とユーザーに確認
   - ユーザーが続行を選んだ場合のみ次に進む

## マージ済PRの一覧取得（本文生成用）

1. `gh pr list --base develop --state merged --limit 50 --json number,title,mergedAt` でdevelopにマージ済のPRを取得
2. 前回のmain向けリリースPRがあればその日付以降、無ければ全件を対象に整形

## リリースPRの作成

1. PRタイトル: `release: YYYY-MM-DD develop → main`（YYYY-MM-DDは当日）
2. `gh pr create --base main --head develop --title "<タイトル>" --body "<本文>"` で **Open状態（Draftではない）** で作成
3. 本文は以下の構成:

```markdown
## リリース内容

develop ブランチのHEAD全体をmainへ反映します。
develop にあるコミットは全て本リリースに含まれます（部分マージなし）。

## 含まれる主な変更

{コミット履歴を要約した箇条書き(5〜10項目程度)}

## 含まれるマージ済PR

{`gh pr list` の結果から、main にまだ入っていないPRを一覧表示}

- #123 feat: ユーザーログイン機能追加
- #124 fix: 表示崩れ修正
...

## 変更ファイル規模

{`git diff --stat` の最終行を抜粋}

## リリース後のタスク

- [ ] このPRをGitHub上でMerge（Merge commit方式・developの履歴を保持）
- [ ] マージ後、`version-tagging` スキルに従ってバージョンタグを作成
- [ ] 本番デプロイの確認
```

## マージ方針の明示（PRコメントに記載）

PR作成後、以下のコメントを追加する:

```
このPRは `Merge commit` 方式でマージしてください（Squash・Rebaseは使用しない）。
理由: developの履歴を完全に保持してmainに反映するため。
```

```bash
gh pr comment <PR番号> --body "<上記コメント>"
```

## ユーザーへの最終提示

PR作成後、以下の情報をユーザーに表示する:

> リリースPRを作成しました。
>
> - **URL**: {PR URL}
> - **含まれるコミット数**: {N件}
> - **含まれるPR数**: {N件}
> - **変更ファイル**: {N files, +XX -YY}
>
> 次のステップ:
> 1. GitHub上で内容を確認し、問題なければ **Merge commit** でマージしてください
> 2. マージ完了したら **「マージした」または「merged」と報告するだけ** で、自動的に `version-tagging` スキルが起動してタグ付けまで進みます

## マージ後の自動引き継ぎ

PR作成後、ユーザーが以下のいずれかを発言した場合、**改めて確認せずに `version-tagging` スキルを即起動**してください：

- 「マージした」「mergeした」「merged」
- 「マージ完了」「マージしたよ」「merge完了」
- 「リリースした」「main更新した」「pushした」
- その他、main更新が完了したと判断できる文脈

起動時は「リリースタグの作成に進みます」と一言宣言してから、`version-tagging` スキルの手順に従う。

## 自動マージはしない

**`gh pr merge` は自動実行しない**。ユーザーが明示的に「自動でマージしていい」と言った場合のみ、`gh pr merge <番号> --merge` を実行可。
（`--squash`, `--rebase` は本コマンドの方針に反するため使用禁止）
