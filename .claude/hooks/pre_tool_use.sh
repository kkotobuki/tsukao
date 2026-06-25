#!/bin/bash
# PreToolUse hook
# .env / 環境変数の読み取り・シークレット送信・破壊的削除をブロックする。
# それ以外のツール使用には一切干渉しない。
#
# matcher (settings.json で指定): Bash|Edit|Write|Read
#
# 【3層ガードの役割分担 — 破壊操作/シークレットの「正本」はこのファイル】
#   1. CLAUDE.md (1.2 / 3章)  … 人間向けの規範・説明。強制力は無い。
#   2. settings.json "deny"   … 完全一致のみ効く高速な一次フィルタ (例: "rm -rf" 厳密一致)。
#   3. このファイル            … 実効判定の正本。フラグ順不同・複合コマンド・リダイレクト形まで
#                                網羅し、deny が取りこぼす変種をここで塞ぐ。
#   → ルールを追加/変更する時はこのファイルを基準に更新し、
#     CLAUDE.md は説明として、deny は速い近似として追従させる (3箇所の独立進化を防ぐ)。

INPUT=$(cat)

block() {
  echo "❌ $1" >&2
  # 迂回導線: 誤検知/正当な必要時に Claude・ユーザーが次の一手を取れるようにする (CLAUDE.md 1.6)。
  echo "→ 進め方: ①誤検知ならパターンを踏まない書き換えを試す ②本当に必要ならユーザーに「!<コマンド>」での手動実行を依頼するか明示許可を得る (ガードは黙って無効化しない)" >&2
  exit 2
}

# jq が無い環境では安全側に倒して即ブロック (fail-closed)。
# jq 欠落を握りつぶすと TOOL が空になり全ガードが無言で no-op 化するため。
if ! command -v jq >/dev/null 2>&1; then
  block "jq が見つからないため PreToolUse ガードを適用できません (安全側でブロック)"
fi

TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)

# --- ファイル系: Read / Edit / Write / MultiEdit の対象が .env 系ファイルか ---
if [ "$TOOL" = "Read" ] || [ "$TOOL" = "Edit" ] || [ "$TOOL" = "Write" ] || [ "$TOOL" = "MultiEdit" ]; then
  FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
  if echo "$FILE" | grep -qE '(^|/)\.env(\.|$)'; then
    block ".env ファイルへの直接操作は禁止 (CLAUDE.md 3. シークレット)"
  fi
fi

# --- Bash 系 ---
if [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

  # 1) .env の読み取り・読み込み
  #    リーダーコマンドを広く取り(grep/awk/sed/dd 等も)、空白なし(<)やリダイレクトも検出する。
  if echo "$CMD" | grep -qE '(cat|less|more|head|tail|nl|tac|source|\.|grep|egrep|fgrep|rg|ag|awk|sed|cut|dd|od|xxd|strings|bat)[[:space:]<]+[^|;&]*\.env\b'; then
    block ".env ファイルの読み取り・読み込みは禁止 (CLAUDE.md 3. シークレット)"
  fi
  # cat<.env のように空白を挟まないリダイレクト形
  if echo "$CMD" | grep -qE '<[[:space:]]*[^|;&[:space:]]*\.env\b'; then
    block ".env ファイルの読み取り・読み込みは禁止 (CLAUDE.md 3. シークレット)"
  fi

  # 2) printenv / env で全環境変数を表示
  if echo "$CMD" | grep -qE '(^|[;&|]\s*)(printenv|env)(\s*$|\s+[;&|])'; then
    block "全環境変数の表示は禁止 (シークレット漏洩リスク)"
  fi
  # printenv で特定のシークレット変数を表示
  if echo "$CMD" | grep -qE '\bprintenv[[:space:]]+([A-Z0-9]+_)*(KEY|SECRET|TOKEN|PASSWORD|PASSWD)(_[A-Z0-9]+)*\b'; then
    block "シークレット系環境変数の表示は禁止"
  fi

  # 3) echo / printf でシークレット系環境変数を出力
  #    変数名を _ 区切りの語として判定し、KEY/SECRET/TOKEN/PASSWORD 語を含むもののみ対象。
  #    echo/printf 以外で変数を引数に渡すだけ(curl $API_URL 等)は誤検知しない。
  if echo "$CMD" | grep -qE '(^|[;&|]|&&|\|\|)[[:space:]]*(echo|printf)\b' \
     && echo "$CMD" | grep -qE '\$\{?([A-Z0-9]+_)*(KEY|SECRET|TOKEN|PASSWORD|PASSWD)(_[A-Z0-9]+)*\}?([^A-Z0-9_]|$)'; then
    block "echo/printf によるシークレット系環境変数の出力は禁止"
  fi

  # コマンドを区切り (; | &) で分割し、各サブコマンド単位で判定する。
  #   compound command (例: rm -r dir && grep -f pat) で、別コマンドの -f/-r/-H を
  #   rm/curl のフラグと誤認して過剰ブロックしないため。
  SEGMENTS=$(printf '%s\n' "$CMD" | tr ';|&' '\n')

  # 4) rm の再帰+強制削除 (フラグ順不同・短/長オプション両対応)
  #    settings.json の deny は "rm -rf" 完全一致しか効かず rm -fr / rm -r -f / rm -rfv を取りこぼすため、ここで実効判定する。
  while IFS= read -r seg; do
    echo "$seg" | grep -qE '(^|[[:space:]])(sudo[[:space:]]+)?rm([[:space:]]|$)' || continue
    hr=0; hf=0
    echo "$seg" | grep -qE '[[:space:]]-[a-z]*r|[[:space:]]--recursive([[:space:]]|=|$)' && hr=1
    echo "$seg" | grep -qE '[[:space:]]-[a-z]*f|[[:space:]]--force([[:space:]]|=|$)' && hf=1
    if [ "$hr" = 1 ] && [ "$hf" = 1 ]; then
      block "rm の再帰+強制削除 (rm -rf 系) は明示指示時のみ実行可 (CLAUDE.md 1.2)"
    fi
  done <<RM_EOF
$SEGMENTS
RM_EOF

  # 5) curl で認証情報 (Authorization / API キー / Basic 認証) を送信
  #    settings.json の "curl:* -H *..." deny は : がリテラル扱いで一切マッチしないため、ここで実効判定する。
  while IFS= read -r seg; do
    echo "$seg" | grep -qE '(^|[[:space:]])(sudo[[:space:]]+)?curl([[:space:]]|$)' || continue
    if echo "$seg" | grep -qiE '(\-H|\-\-header)[^|;&]{0,4}(authorization|api-?key|x-api-key|bearer)|(^|[[:space:]])(\-u|\-\-user)[[:space:]]'; then
      block "curl での認証情報 (Authorization/APIキー/Basic認証) の送信は禁止 (CLAUDE.md 3. シークレット)"
    fi
  done <<CURL_EOF
$SEGMENTS
CURL_EOF
fi

exit 0
