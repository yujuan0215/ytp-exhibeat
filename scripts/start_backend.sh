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
VENV_DIR="$ADK_DIR/.venv313"
ENV_FILE="$ADK_DIR/gemini_agent/.env"

if [ ! -d "$VENV_DIR" ]; then
  VENV_DIR="$ADK_DIR/.venv" # Fallback
fi

if [ ! -d "$VENV_DIR" ]; then
  echo "找不到 ${VENV_DIR}。請先執行 bash scripts/setup_backend.sh" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "找不到 ${ENV_FILE}。請先完成設定。" >&2
  exit 1
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

# If a service account key is provided as adc.json, prefer it.
# Otherwise, fall back to gcloud ADC (application-default) on the machine.
if [ -f "$REPO_ROOT/adc.json" ]; then
  export GOOGLE_APPLICATION_CREDENTIALS="$REPO_ROOT/adc.json"
else
  unset GOOGLE_APPLICATION_CREDENTIALS || true
fi

cd "$ADK_DIR"

ADK_PID=""
UVICORN_PID=""
free_port_if_occupied() {
  local port="$1"
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  elif command -v fuser >/dev/null 2>&1; then
    pids="$(fuser "$port"/tcp 2>/dev/null || true)"
  fi
  pids="$(echo "$pids" | tr ' ' '\n' | sed '/^$/d' | sort -u | tr '\n' ' ')"
  if [ -n "$pids" ]; then
    echo "偵測到 port $port 被占用，嘗試釋放: $pids"
    kill $pids 2>/dev/null || true
    sleep 1
    for pid in $pids; do
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    done
  fi
}

cleanup() {
  if [ -n "$UVICORN_PID" ] && kill -0 "$UVICORN_PID" 2>/dev/null; then
    echo ""
    echo "關閉 API Proxy (PID $UVICORN_PID)..."
    kill "$UVICORN_PID" 2>/dev/null || true
    wait "$UVICORN_PID" 2>/dev/null || true
  fi
  if [ -n "$ADK_PID" ] && kill -0 "$ADK_PID" 2>/dev/null; then
    echo ""
    echo "關閉 ADK Agent (PID $ADK_PID)..."
    kill "$ADK_PID" 2>/dev/null || true
    wait "$ADK_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

free_port_if_occupied 8001
free_port_if_occupied 8000

echo "啟動 ADK Agent Web UI (port 8001) ..."
adk web . --host 0.0.0.0 --port 8001 --allow_origins "*" \
  > "$ADK_DIR/adk_server.log" 2>&1 &
ADK_PID=$!
sleep 5

echo "啟動 API Proxy (port 8000) ..."
echo ""
echo "前端介面:   http://127.0.0.1:5173"
echo "後端 API:   http://127.0.0.1:8000"
echo "ADK Web UI: http://127.0.0.1:8001"
echo ""

export ADK_PORT=8001
uvicorn api_proxy_server:app --host 0.0.0.0 --port 8000 &
UVICORN_PID=$!
wait "$UVICORN_PID"
