#!/usr/bin/env bash
# scripts/setup_backend.sh
# macOS / Linux 初始化後端環境：建立 venv、安裝依賴、複製 .env.sample → .env
#
# 用法：
#   bash scripts/setup_backend.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ADK_DIR="$REPO_ROOT/backend/adk_agent"
VENV_DIR="$ADK_DIR/.venv"
ENV_FILE="$ADK_DIR/gemini_agent/.env"
ENV_SAMPLE="$ADK_DIR/gemini_agent/.env.sample"

echo "[1/4] 檢查 Python..."
PY_CMD=""
for cand in python3.12 python3.11 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    PY_CMD="$cand"; break
  fi
done
if [ -z "$PY_CMD" ]; then
  echo "找不到 Python 3。請安裝 Python 3.11 或 3.12：https://www.python.org/downloads/" >&2
  exit 1
fi
echo "    使用 $PY_CMD ($($PY_CMD --version))"

echo "[2/4] 建立虛擬環境 $VENV_DIR"
if [ ! -d "$VENV_DIR" ]; then
  "$PY_CMD" -m venv "$VENV_DIR"
else
  echo "    已存在，跳過。"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

echo "[3/4] 安裝 Python 套件..."
pip install --upgrade pip
pip install -r "$ADK_DIR/requirements.txt"
# 若想啟用 LightFM 推薦（可選；Python 3.11/3.12 較穩定）
# pip install -r "$REPO_ROOT/backend/app/recommender/requirements.txt"

echo "[4/4] 準備 gemini_agent/.env..."
if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_SAMPLE" "$ENV_FILE"
  echo "    已從 .env.sample 建立 .env — 請手動開啟並填入 GOOGLE_API_KEY。"
  echo "    檔案：$ENV_FILE"
else
  echo "    已存在，不覆寫。"
fi

cat <<EOF

完成！下一步：
  1. 編輯 $ENV_FILE，填入 GOOGLE_API_KEY
  2. bash scripts/start_backend.sh     # 後端 (port 8000)
  3. bash scripts/start_frontend.sh    # 前端 (port 5173)
EOF
