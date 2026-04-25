# Backend

完整安裝流程請以根目錄 [README.md](../README.md) 為準。

本資料夾包含：

- `adk_agent/`：FastAPI API proxy、Google ADK agent、Gemini 工具
- `app/recommender/`：推薦系統原型
- `shared/`：agent 與 recommender 共用的推薦規則

## 本機啟動

從 repo 根目錄執行：

```bash
bash scripts/setup_backend.sh
```

編輯：

```text
backend/adk_agent/gemini_agent/.env
```

至少設定：

```env
GOOGLE_GENAI_USE_VERTEXAI=0
GOOGLE_API_KEY=你的_Google_AI_Studio_API_key
```

啟動：

```bash
bash scripts/start_backend.sh
```

Windows PowerShell 請使用根目錄 README 裡的 `.ps1` 指令。

## 手動啟動兩個後端服務

只有需要看更細 log 時才手動跑。

Terminal A：

```bash
cd backend/adk_agent
source .venv/bin/activate
adk web --host 0.0.0.0 --port 8001 --allow_origins "*"
```

Terminal B：

```bash
cd backend/adk_agent
source .venv/bin/activate
ADK_PORT=8001 uvicorn api_proxy_server:app --host 0.0.0.0 --port 8000
```

## API key

本機開發預設使用 Google AI Studio API key，不使用 Vertex AI 憑證檔。

必填：

- `GOOGLE_GENAI_USE_VERTEXAI=0`
- `GOOGLE_API_KEY`

選填：

- `GOOGLE_MAPS_API_KEY`：Places API (New)，用於場館評分與評論
- `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`：TDX 交通資料
