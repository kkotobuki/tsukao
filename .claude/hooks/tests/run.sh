#!/bin/bash
# hook 回帰テスト (外部依存なし: bats 不要、配布先でもそのまま動く)。
# 目的: セキュリティガード (pre_tool_use.sh) と共通ライブラリが「無言で壊れる」のを防ぐ。
#       ガードが no-op 化しても CI / 手動でここが落ちて気づける。
# 実行: bash .claude/hooks/tests/run.sh
#
# 注意: 危険文字列はコマンドに直書きせず cases.tsv (データ) から読む。
#       直書きするとハーネス自身の pre_tool_use がテスト実行ごとブロックするため。
set -u

DIR="$(cd "$(dirname "$0")" && pwd)"
# 通常は実物のガードを検査。テスト自体の有効性確認用に差し替え可能 (例: =/usr/bin/true で no-op 化 → 危険系が落ちるべき)。
HOOK="${PTU_HOOK_OVERRIDE:-$DIR/../pre_tool_use.sh}"
LIB="$DIR/../lib/pending_todos.sh"
CASES="$DIR/cases.tsv"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); }
fail() { FAIL=$((FAIL+1)); echo "  ✗ FAIL: $1"; }

# ---------------------------------------------------------------------------
echo "== ガード回帰テスト (pre_tool_use.sh) =="
if ! command -v jq >/dev/null 2>&1; then
  echo "  ⚠️ jq が無いため一部の判定がスキップされます (本番では fail-closed)"
fi
while IFS=$'\t' read -r exp label json; do
  case "$exp" in ''|'#'*) continue;; esac
  printf '%s' "$json" | bash "$HOOK" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$exp" ]; then ok; else fail "$label (期待 exit $exp / 実際 $got)"; fi
done < "$CASES"

# ---------------------------------------------------------------------------
echo "== 共通ライブラリ (pending_todos.sh) =="
# shellcheck disable=SC1090
source "$LIB"

# -- count_pending_todos / list_pending_todos --
FAKE_HOME="$(mktemp -d)"
TDIR="$FAKE_HOME/.claude/tasks/sid1"
mkdir -p "$TDIR"
mkj() { printf '{"status":"%s","subject":"%s"}' "$1" "$2" > "$TDIR/$3.json"; }
mkj pending     "todo A" t1
mkj in_progress "todo B" t2
mkj completed   "done C" t3

HOME_BAK="$HOME"; HOME="$FAKE_HOME"
n=$(count_pending_todos sid1)
[ "$n" = "2" ] && ok || fail "count_pending_todos (期待 2 / 実際 $n)"
lines=$(list_pending_todos sid1 | wc -l | tr -d ' ')
[ "$lines" = "2" ] && ok || fail "list_pending_todos 件数 (期待 2 / 実際 $lines)"
n0=$(count_pending_todos no-such-sid)
[ "$n0" = "0" ] && ok || fail "count_pending_todos 該当なし (期待 0 / 実際 $n0)"
HOME="$HOME_BAK"

# -- last_block_for_cwd (cwd 一致の最後のブロックを取る / スペース入りパス対応) --
LOG="$(mktemp)"
{
  printf '===== [t1] session end =====\ncwd: /a/b\nbranch: x\n\n'
  printf '===== [t2] session end =====\ncwd: /c/d e\nbranch: y\n\n'
  printf '===== [t3] session end =====\ncwd: /a/b\nbranch: z\n\n'
} > "$LOG"
g1=$(last_block_for_cwd "$LOG" "/a/b" | grep -c 'branch: z')
[ "$g1" = "1" ] && ok || fail "last_block_for_cwd 同一cwdの最新ブロックを返す"
g2=$(last_block_for_cwd "$LOG" "/c/d e" | grep -c 'branch: y')
[ "$g2" = "1" ] && ok || fail "last_block_for_cwd スペース入りcwdを扱える"
g3=$(last_block_for_cwd "$LOG" "/none")
[ -z "$g3" ] && ok || fail "last_block_for_cwd 不一致は空を返す"

# ---------------------------------------------------------------------------
echo ""
echo "== 結果: PASS=$PASS  FAIL=$FAIL =="
[ "$FAIL" = "0" ] || exit 1
