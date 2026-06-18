#!/bin/bash
# UserPromptSubmit hook
# ユーザー入力時にプロジェクト文脈を注入。短文指示でも AI が判断できるようにする。

echo "<project-context>"
echo "branch: $(git branch --show-current 2>/dev/null || echo 'no-git')"
echo "uncommitted: $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') files"
echo "last-commit: $(git log -1 --oneline 2>/dev/null || echo 'no-commits')"
echo "</project-context>"
