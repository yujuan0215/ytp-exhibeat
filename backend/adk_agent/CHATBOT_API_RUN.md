# Chatbot API Run Notes

完整安裝與啟動流程請以根目錄 [README.md](../../README.md) 為準。

這份文件只保留 chatbot API 的手動驗證方式。

## 相關端點

前端聊天會透過 FastAPI proxy 呼叫：

- `POST /api/apps/{app}/users/{user}/sessions`
- `POST /api/run`

FastAPI proxy 跑在 `8000`，ADK Web UI 跑在 `8001`。

## 手動啟動

通常請直接使用：

```bash
bash scripts/start_backend.sh
```

若需要分開看 log，才手動開兩個 terminal。

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

## 驗證

建立 session：

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://127.0.0.1:8000/api/apps/gemini_agent/users/local-dev-user/sessions
```

確認 app 存在：

```bash
curl http://127.0.0.1:8000/api/list-apps
```

預期回應包含：

```text
gemini_agent
```

## 常見錯誤

- `Failed to create ADK session`：通常是 `8000` 或 `8001` 沒啟動
- `Not Found`：確認 app name 是 `gemini_agent`
- 重啟後 session 異常：清掉 browser 裡的 `localStorage.adk_session`
