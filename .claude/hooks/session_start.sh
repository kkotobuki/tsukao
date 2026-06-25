#!/bin/bash
# SessionStart hook
# セッション起動時にプロジェクト状態を注入
# "Continue from where you left off" 問題への対策

INPUT=$(cat)   # stdin は先頭で1度だけ取り込む（session_id 等を含む JSON）
source "$(dirname "$0")/lib/pending_todos.sh"

echo "<session-start>"
echo "## ブランチ: $(git branch --show-current 2>/dev/null || echo 'no-git')"
echo ""
echo "## 未コミット変更"
git status --short 2>/dev/null | head -10
echo ""
echo "## 最近のコミット (5件)"
git log --oneline -5 2>/dev/null
echo ""
echo "## 前回の状態 (このフォルダ)"
# 前回 session_end / pre_compact が書いたサマリを読み戻す (clean end を優先)。
PREV=$(last_block_for_cwd "$HOME/.claude/session-log.txt" "$PWD")
[ -z "$PREV" ] && PREV=$(last_block_for_cwd "$HOME/.claude/compact-snapshots/log.txt" "$PWD")
[ -n "$PREV" ] && echo "$PREV" || echo "(記録なし)"
echo ""
echo "## 未完了 TODO"
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
list_pending_todos "$SID"
echo "</session-start>"
