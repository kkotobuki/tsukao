#!/bin/bash
# SessionStart hook
# セッション起動時にプロジェクト状態を注入
# "Continue from where you left off" 問題への対策

INPUT=$(cat)   # stdin は先頭で1度だけ取り込む（session_id 等を含む JSON）

echo "<session-start>"
echo "## ブランチ: $(git branch --show-current 2>/dev/null || echo 'no-git')"
echo ""
echo "## 未コミット変更"
git status --short 2>/dev/null | head -10
echo ""
echo "## 最近のコミット (5件)"
git log --oneline -5 2>/dev/null
echo ""
echo "## 未完了 TODO"
# 現在の session_id に対応する tasks ストレージから pending / in_progress を一覧
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
TASKS_DIR="$HOME/.claude/tasks/$SID"
if [ -n "$SID" ] && [ -d "$TASKS_DIR" ]; then
  for f in "$TASKS_DIR"/*.json; do
    [ -f "$f" ] || continue
    st=$(jq -r '.status // empty' "$f" 2>/dev/null)
    case "$st" in
      pending|in_progress)
        subj=$(jq -r '.subject // empty' "$f" 2>/dev/null)
        [ -n "$subj" ] && echo "- [$st] $subj"
        ;;
    esac
  done | head -10
fi
echo "</session-start>"
