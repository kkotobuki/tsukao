#!/bin/bash
# PreCompact hook
# context 自動圧縮の直前に発火。圧縮で失われる情報を記録する。
# 出力先: ~/.claude/compact-snapshots/log.txt

INPUT=$(cat)              # stdin は先頭で1度だけ取り込むこと
source "$(dirname "$0")/lib/pending_todos.sh"

SNAPSHOT_DIR="$HOME/.claude/compact-snapshots"
mkdir -p "$SNAPSHOT_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H:%M:%S)

{
  echo "===== [$TIMESTAMP] context compact ====="
  echo "cwd:          $(pwd)"
  echo "branch:       $(git branch --show-current 2>/dev/null || echo 'no-git')"
  echo "uncommitted:  $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') files"
  echo "last-commit:  $(git log -1 --oneline 2>/dev/null || echo 'no-commits')"

  # --- 未完了 TODO 件数を共通ライブラリで取得 ---
  SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
  PENDING=$(count_pending_todos "$SID")
  [ "$PENDING" -gt 0 ] && echo "pending-todos: ${PENDING}"

  echo ""
} >> "$SNAPSHOT_DIR/log.txt"

exit 0
