#!/bin/bash
# PreCompact hook
# context 自動圧縮の直前に発火。圧縮で失われる情報を記録する。
# 出力先: ~/.claude/compact-snapshots/log.txt

INPUT=$(cat)              # stdin は先頭で1度だけ取り込むこと

SNAPSHOT_DIR="$HOME/.claude/compact-snapshots"
mkdir -p "$SNAPSHOT_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H:%M:%S)

{
  echo "===== [$TIMESTAMP] context compact ====="
  echo "cwd:          $(pwd)"
  echo "branch:       $(git branch --show-current 2>/dev/null || echo 'no-git')"
  echo "uncommitted:  $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') files"
  echo "last-commit:  $(git log -1 --oneline 2>/dev/null || echo 'no-commits')"

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
  [ "$PENDING" -gt 0 ] && echo "pending-todos: ${PENDING}"

  echo ""
} >> "$SNAPSHOT_DIR/log.txt"

exit 0
