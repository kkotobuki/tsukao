#!/bin/bash
# 共通ライブラリ (lifecycle hook 共用)。
#   - 未完了 TODO の取得 (count_pending_todos / list_pending_todos)
#   - ログの読み戻し (last_block_for_cwd)
# session_start / stop / session_end / pre_compact の 4 hook で共用する
# (以前は同じ走査ロジックが各 hook にコピペされていた → ここへ集約)。
#
# 使い方: source "$(dirname "$0")/lib/pending_todos.sh"

# 未完了 (pending / in_progress) の件数を echo する。
#   $1: session_id
count_pending_todos() {
  local sid="$1"
  local dir="$HOME/.claude/tasks/$sid"
  local n=0 f st
  [ -n "$sid" ] && [ -d "$dir" ] || { echo 0; return; }
  for f in "$dir"/*.json; do
    [ -f "$f" ] || continue
    st=$(jq -r '.status // empty' "$f" 2>/dev/null)
    case "$st" in pending|in_progress) n=$((n+1));; esac
  done
  echo "$n"
}

# 未完了 TODO を "- [status] subject" 形式で列挙する (最大10件)。
#   $1: session_id
list_pending_todos() {
  local sid="$1"
  local dir="$HOME/.claude/tasks/$sid"
  local f st subj
  [ -n "$sid" ] && [ -d "$dir" ] || return
  for f in "$dir"/*.json; do
    [ -f "$f" ] || continue
    st=$(jq -r '.status // empty' "$f" 2>/dev/null)
    case "$st" in
      pending|in_progress)
        subj=$(jq -r '.subject // empty' "$f" 2>/dev/null)
        [ -n "$subj" ] && echo "- [$st] $subj"
        ;;
    esac
  done | head -10
}

# 追記式ログから、現在の cwd に一致する「最後のブロック」を取り出す。
# session_end / pre_compact が書き出したサマリを次セッションへ読み戻すために使う。
# ブロックは空行区切り、各ブロックに "cwd: <path>" 行が含まれる前提。
# (cwd にスペースを含むパスでも壊れないよう、行全体から cwd: を剥がして比較する)
#   $1: ログファイルパス  $2: 一致させたい cwd (通常 "$PWD")
last_block_for_cwd() {
  local file="$1" want="$2"
  [ -f "$file" ] || return
  awk -v want="$want" 'BEGIN{RS="";FS="\n"} {
    for(i=1;i<=NF;i++){
      if($i ~ /^cwd:/){ v=$i; sub(/^cwd:[ \t]*/,"",v); if(v==want) last=$0 }
    }
  } END{ if(last) print last }' "$file"
}
