# ExhiBeat ADK Agent Backend

完整安裝與啟動流程請以根目錄 [README.md](../../README.md) 為準。

這個資料夾提供：

- `api_proxy_server.py`：FastAPI API proxy，對前端提供 `/api/*`
- `gemini_agent/`：Google ADK agent
- `gemini_agent/tools/`：文化部活動、天氣、地理、Google Places、TDX 等工具
- `requirements.txt`：後端 Python 依賴

## 本機開發主線

本機開發使用 Google AI Studio API key：

```env
GOOGLE_GENAI_USE_VERTEXAI=0
GOOGLE_API_KEY=你的_Google_AI_Studio_API_key
```

從 repo 根目錄執行：

```bash
bash scripts/setup_backend.sh
bash scripts/start_backend.sh
```

Windows PowerShell 請看根目錄 README 的 `.ps1` 指令。

## 服務

啟動後會有兩個服務：

- FastAPI proxy：<http://127.0.0.1:8000>
- ADK Web UI：<http://127.0.0.1:8001>

前端只需要呼叫 `/api/*`，不需要直接打 ADK port。

## 選填外部 API

- `GOOGLE_MAPS_API_KEY`：Google Places API (New)，用於場館評分與評論
- `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`：TDX 交通資料

沒有選填 key 時，相關工具會降級或略過，不影響基本啟動。
