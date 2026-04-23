#!/usr/bin/env bash
# scripts/start_backend.sh
# Note: keep this file with LF line endings for WSL/Linux.
# 同時啟動 ADK Agent (port 8001) 與 API Proxy (port 8000)。
# Ctrl+C 會一併關閉兩個 process。
#
# 用法：
#   bash scripts/start_backend.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADK_DIR="$REPO_ROOT/backend/adk_agent"
VENV_DIR="$ADK_DIR/.venv"
ENV_FILE="$ADK_DIR/gemini_agent/.env"

if [ ! -d "$VENV_DIR" ]; then
  echo "找不到 $VENV_DIR。請先執行 bash scripts/setup_backend.sh" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "找不到 $ENV_FILE。請先執行 setup_backend.sh，並填入 GOOGLE_API_KEY" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

cd "$ADK_DIR"

ADK_PID=""
cleanup() {
  if [ -n "$ADK_PID" ] && kill -0 "$ADK_PID" 2>/dev/null; then
    echo ""
    echo "關閉 ADK Agent (PID $ADK_PID)..."
    kill "$ADK_PID" 2>/dev/null || true
    wait "$ADK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "啟動 ADK Agent Web UI (port 8001) ..."
adk web --host 0.0.0.0 --port 8001 --allow_origins "*" \
  > "$ADK_DIR/adk_server.log" 2>&1 &
ADK_PID=$!
sleep 3

if ! kill -0 "$ADK_PID" 2>/dev/null; then
  echo "ADK Agent 啟動失敗，請查看 $ADK_DIR/adk_server.log" >&2
  exit 1
fi

echo "啟動 API Proxy (port 8000) ..."
echo ""
echo "前端:       http://127.0.0.1:5173  (vite dev)"
echo "後端 API:   http://127.0.0.1:8000"
echo "ADK Web UI: http://127.0.0.1:8001"
echo ""

export ADK_PORT=8001
exec uvicorn api_proxy_server:app --host 0.0.0.0 --port 8000
