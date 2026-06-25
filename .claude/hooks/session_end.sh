#!/bin/bash
# SessionEnd hook
# セッション終了時にサマリーを記録する。
# 出力先: ~/.claude/session-log.txt

INPUT=$(cat)              # stdin は先頭で1度だけ取り込むこと
source "$(dirname "$0")/lib/pending_todos.sh"

LOG_FILE="$HOME/.claude/session-log.txt"

{
  echo "===== [$(date '+%Y-%m-%d %H:%M:%S')] session end ====="
  echo "cwd:                   $(pwd)"
  echo "branch:                $(git branch --show-current 2>/dev/null || echo 'no-git')"
  echo "uncommitted:           $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') files"
  echo "commits-this-session:  $(git log --since='3 hours ago' --oneline 2>/dev/null | wc -l | tr -d ' ')"

  # 未完了 TODO 件数を共通ライブラリで取得
  SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
  PENDING=$(count_pending_todos "$SID")
  [ "$PENDING" -gt 0 ] && echo "pending-todos:         ${PENDING}"

  echo ""
} >> "$LOG_FILE"

exit 0
