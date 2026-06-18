#!/bin/bash
# check_readiness.sh
# AI 自律化整備度をチェックする。プロジェクトルートで実行。
# Usage: bash scripts/check_readiness.sh  (もしくは bootstrap 後は bash .claude/check_readiness.sh)

ROOT="$(pwd)"

echo "📋 AI 自律化整備度チェック ($ROOT)"
echo ""

# テンプレバージョン表示
if [ -f .claude/template-version.json ]; then
  VER=$(jq -r '.template_version // "unknown"' .claude/template-version.json 2>/dev/null)
  BOOTSTRAPPED=$(jq -r '.bootstrapped_at // "unknown"' .claude/template-version.json 2>/dev/null)
  UPGRADED=$(jq -r '.last_upgrade_at // empty' .claude/template-version.json 2>/dev/null)
  echo "📦 テンプレバージョン: ${VER}"
  echo "   bootstrapped: ${BOOTSTRAPPED}"
  [ -n "$UPGRADED" ] && echo "   last upgrade: ${UPGRADED}"
  echo ""
fi


PASS=0
TOTAL=0
WARN=0

check_required() {
  local NAME="$1"
  shift
  TOTAL=$((TOTAL+1))
  if "$@" > /dev/null 2>&1; then
    echo "  ✅ $NAME"
    PASS=$((PASS+1))
  else
    echo "  ❌ $NAME"
  fi
}

check_no_marker() {
  local NAME="$1"
  local MARKER="$2"
  TOTAL=$((TOTAL+1))
  if [ -f CLAUDE.md ] && ! grep -q "$MARKER" CLAUDE.md; then
    echo "  ✅ $NAME"
    PASS=$((PASS+1))
  else
    echo "  ❌ $NAME (CLAUDE.md に '$MARKER' が残存)"
  fi
}

check_optional_marker() {
  local NAME="$1"
  local SECTION="$2"
  if [ -f CLAUDE.md ]; then
    # grep -F (fixed string) で UTF-8 セクション見出しの行番号を取得
    LINE_NUM=$(grep -nF "### $SECTION" CLAUDE.md | head -1 | cut -d: -f1)
    if [ -n "$LINE_NUM" ]; then
      # その次の行以降から、次の ### 行までを本文として抽出
      BODY=$(tail -n +$((LINE_NUM + 1)) CLAUDE.md | sed '/^### /,$d')
      # HTML コメントブロック (<!-- ... -->、複数行含む) を除去してから判定する。
      # 除去しないと、複数行コメントの継続行が本文と誤判定され「記入済み」になる。
      BODY=$(echo "$BODY" | sed '/<!--/,/-->/d')
      # 本文に「< でも空白でもない行」があれば記入済み
      if echo "$BODY" | grep -qE '^[^<[:space:]]'; then
        echo "  ✅ $NAME"
      else
        echo "  ⚠️ $NAME (任意・未記入)"
        WARN=$((WARN+1))
      fi
    else
      echo "  ⚠️ $NAME (セクションなし)"
      WARN=$((WARN+1))
    fi
  fi
}

echo "[必須項目]"
check_required "CLAUDE.md 存在" test -f CLAUDE.md
check_no_marker "CLAUDE.md: プロジェクト概要 記入済み" "BOOTSTRAP:PROJECT_DESCRIPTION"
check_no_marker "CLAUDE.md: 主要コマンド 記入済み" "BOOTSTRAP:COMMANDS"
check_no_marker "CLAUDE.md: 技術スタック 記入済み" "BOOTSTRAP:TECH_STACK"
check_required ".claude/settings.json 存在" test -f .claude/settings.json
check_required ".claude/settings.json hooks 7種類設定" bash -c 'jq -e ".hooks | .UserPromptSubmit and .PreToolUse and .PostToolUse and .Stop and .SessionStart and .SessionEnd and .PreCompact" .claude/settings.json'
check_required ".claude/hooks/ 7ファイル存在" bash -c '[ "$(ls .claude/hooks/*.sh 2>/dev/null | wc -l | tr -d " \n")" -ge 7 ]'
check_required ".claude/hooks/ 実行権限あり" test -x .claude/hooks/user_prompt_submit.sh

echo ""
echo "[任意項目]"
check_optional_marker "CLAUDE.md: ディレクトリ構成 記入" "ディレクトリ構成"
check_optional_marker "CLAUDE.md: テスト方針 記入" "テスト方針"
check_optional_marker "CLAUDE.md: ドメイン知識 記入" "ドメイン知識"

echo ""
PERCENT=$((PASS * 100 / TOTAL))
echo "整備度: $PASS/$TOTAL ($PERCENT%) [任意未記入: $WARN]"

if [ $PERCENT -eq 100 ]; then
  echo "判定: ◎ AI 完全自律可能"
elif [ $PERCENT -ge 80 ]; then
  echo "判定: ○ AI 自律可能（一部要補完）"
elif [ $PERCENT -ge 50 ]; then
  echo "判定: △ hook 動作不安定"
else
  echo "判定: × bootstrap 未完了。bash /path/to/template/bootstrap.sh \$(pwd) を実行してください"
fi
