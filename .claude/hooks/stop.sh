#!/bin/bash
# Stop hook
# セッション応答完結時に未コミット / 未完了 TODO を警告

# stdin は先頭で1度だけ取り込む (session_id 等を含む JSON)
INPUT=$(cat)
source "$(dirname "$0")/lib/pending_todos.sh"

UNCOMMITTED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
[ "$UNCOMMITTED" -ge 3 ] && echo "⚠️ 未コミット変更が ${UNCOMMITTED} ファイルあります"

SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
PENDING=$(count_pending_todos "$SID")
[ "$PENDING" -gt 0 ] && echo "⚠️ 未完了 TODO: ${PENDING} 件"

exit 0
