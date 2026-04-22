#!/usr/bin/env bash
# scripts/start_frontend.sh
# macOS / Linux 啟動 Vite dev server。
#
# 用法：
#   bash scripts/start_frontend.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$REPO_ROOT/frontend"

cd "$FRONTEND_DIR"

if [ ! -d node_modules ]; then
  echo "安裝 npm 套件 (第一次執行會比較久) ..."
  npm install
fi

echo "啟動 Vite dev server ..."
echo "前端: http://127.0.0.1:5173"
npm run dev
