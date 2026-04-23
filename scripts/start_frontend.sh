#!/usr/bin/env bash
# scripts/start_frontend.sh
# Note: keep this file with LF line endings for WSL/Linux.
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

# If dependencies were installed on Windows and then reused in WSL/Linux,
# optional native bindings may be missing (e.g. rolldown Linux binary).
# Auto-heal by reinstalling in the current environment.
if [ ! -f "node_modules/@rolldown/binding-linux-x64-gnu/package.json" ]; then
  echo "偵測到缺少 Linux 原生 binding，重新安裝前端依賴 ..."
  rm -rf node_modules
  npm install --include=optional
fi

echo "啟動 Vite dev server ..."
echo "前端: http://127.0.0.1:5173"
npm run dev
