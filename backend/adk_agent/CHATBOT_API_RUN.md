# Chatbot API Backend Run Guide (WSL)

This guide is specifically for the chatbot API flow used by the frontend:

- `POST /api/apps/{app}/users/{user}/sessions`
- `POST /api/run`

These endpoints are served through `api_proxy_server.py` on port `8000`, which forwards to ADK on `8001`.

## 1) Start ADK server (Terminal A)

```bash
cd /mnt/c/Programming/Project/ytp-exhibeat/backend/adk_agent
source .venv/bin/activate
adk web --host 0.0.0.0 --port 8001 --allow_origins "*"
```

## 2) Start proxy API server (Terminal B)

```bash
cd /mnt/c/Programming/Project/ytp-exhibeat/backend/adk_agent
source .venv/bin/activate
ADK_PORT=8001 uvicorn api_proxy_server:app --host 0.0.0.0 --port 8000
```

## 3) Verify chatbot endpoints

From Windows PowerShell or terminal:

```bash
python -c "import json,urllib.request;req=urllib.request.Request('http://127.0.0.1:8000/api/apps/gemini_agent/users/local-dev-user/sessions',data=b'{}',headers={'Content-Type':'application/json'},method='POST');print(json.loads(urllib.request.urlopen(req).read().decode()))"
```

You should get a JSON object containing an `id`.

## 4) Frontend expectations

The frontend currently uses:

- `appName = gemini_agent`
- `userId = local-dev-user`

So your ADK app list must include `gemini_agent`.

Quick check:

```bash
python -c "import json,urllib.request;print(json.load(urllib.request.urlopen('http://127.0.0.1:8001/list-apps')))"
```

Expected output includes:

```text
['gemini_agent']
```

## Troubleshooting

- `Connection Error: Failed to create ADK session`
  - Usually means one of:
    - ADK server (`8001`) is not running
    - Proxy server (`8000`) is not running
    - Proxy forwarding path is wrong
- `Not Found` when creating session
  - Confirm app name is `gemini_agent` and `/list-apps` includes it.
- Session issues after restarting backend
  - Clear `localStorage.adk_session` in browser and retry.
