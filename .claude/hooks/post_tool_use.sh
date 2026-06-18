#!/bin/bash
# PostToolUse hook (Edit/Write)
# ファイル編集後に自動 format / lint --fix
# stdin (JSON) から file_path を取得

FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0

# 編集ファイルの位置から上方向に、最も近い package.json を探す（monorepo 対応）。
# CWD 固定だと、ルートに package.json が無い構成で整形が無言スキップされるため。
PKG_DIR=$(dirname "$FILE")
while [ "$PKG_DIR" != "/" ] && [ "$PKG_DIR" != "." ] && [ ! -f "$PKG_DIR/package.json" ]; do
  PKG_DIR=$(dirname "$PKG_DIR")
done
[ ! -f "$PKG_DIR/package.json" ] && exit 0

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx)
    ( cd "$PKG_DIR" && pnpm exec prettier --write "$FILE" >/dev/null 2>&1 )
    ( cd "$PKG_DIR" && pnpm exec eslint --fix "$FILE" >/dev/null 2>&1 )
    ;;
  *.json|*.md|*.yml|*.yaml|*.css|*.scss)
    ( cd "$PKG_DIR" && pnpm exec prettier --write "$FILE" >/dev/null 2>&1 )
    ;;
esac
exit 0
