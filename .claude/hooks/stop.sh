#!/bin/bash
# Stop hook
# セッション応答完結時に未コミット / 未完了 TODO を警告

# stdin は先頭で1度だけ取り込む (session_id 等を含む JSON)
INPUT=$(cat)

UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
[ "$UNCOMMITTED" -ge 3 ] && echo "⚠️ 未コミット変更が ${UNCOMMITTED} ファイルあります"

# --- 未完了 TODO 件数を Claude Code の tasks ストレージから取得 ---
SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
PENDING=0
TASKS_DIR="$HOME/.claude/tasks/$SID"
if [ -n "$SID" ] && [ -d "$TASKS_DIR" ]; then
  for f in "$TASKS_DIR"/*.json; do
    [ -f "$f" ] || continue
    st=$(jq -r '.status // empty' "$f" 2>/dev/null)
    case "$st" in pending|in_progress) PENDING=$((PENDING+1));; esac
  done
fi
[ "$PENDING" -gt 0 ] && echo "⚠️ 未完了 TODO: ${PENDING} 件"

exit 0
