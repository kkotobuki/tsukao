#!/bin/bash
# SessionEnd hook
# セッション終了時にサマリーを記録する。
# 出力先: ~/.claude/session-log.txt

INPUT=$(cat)              # stdin は先頭で1度だけ取り込むこと

LOG_FILE="$HOME/.claude/session-log.txt"

{
  echo "===== [$(date '+%Y-%m-%d %H:%M:%S')] session end ====="
  echo "cwd:                   $(pwd)"
  echo "branch:                $(git branch --show-current 2>/dev/null || echo 'no-git')"
  echo "uncommitted:           $(git status --porcelain 2>/dev/null | wc -l | tr -d ' ') files"
  echo "commits-this-session:  $(git log --since='3 hours ago' --oneline 2>/dev/null | wc -l | tr -d ' ')"

  # 未完了 TODO 件数を Claude Code の tasks ストレージから取得
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
  [ "$PENDING" -gt 0 ] && echo "pending-todos:         ${PENDING}"

  echo ""
} >> "$LOG_FILE"

exit 0
