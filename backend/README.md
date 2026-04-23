# Backend Run Guide (WSL)

This backend is currently configured to run inside a Linux/WSL Python environment (`.venv/bin/...`).

## Prerequisites

- WSL installed (Ubuntu or similar)
- Python 3.11+ in WSL
- Node.js installed for frontend (optional for backend-only tests)

## 1) Open WSL and go to backend

```bash
cd /mnt/c/Programming/Project/ytp-exhibeat/backend/adk_agent
```

## 2) Create or reuse virtual environment

If `.venv` already exists, skip creation and only activate it.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

## 3) Configure environment variables

```bash
cp gemini_agent/.env.sample gemini_agent/.env
```

Edit `gemini_agent/.env` and set required values, such as:

- `GOOGLE_GENAI_USE_VERTEXAI`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_CLOUD_LOCATION`
- `GEMINI_MODEL`

Optional:

- `GOOGLE_MAPS_API_KEY`
- `TDX_CLIENT_ID`
- `TDX_CLIENT_SECRET`

## 4) Start backend services (two terminals)

Run both services in parallel.

### Terminal A: ADK service on 8001

```bash
cd /mnt/c/Programming/Project/ytp-exhibeat/backend/adk_agent
source .venv/bin/activate
adk web --host 0.0.0.0 --port 8001 --allow_origins "*"
```

### Terminal B: FastAPI proxy + recommender on 8000

```bash
cd /mnt/c/Programming/Project/ytp-exhibeat/backend/adk_agent
source .venv/bin/activate
ADK_PORT=8001 uvicorn api_proxy_server:app --host 0.0.0.0 --port 8000
```

## 5) Start frontend (optional, from another terminal)

```bash
cd /mnt/c/Programming/Project/ytp-exhibeat/frontend
npm install
npm run dev
```

Make sure frontend proxy target points to your backend address in `frontend/vite.config.ts`.

## Troubleshooting

- `uvicorn: not found`:
  - You are likely not in the WSL virtualenv. Run `source .venv/bin/activate`.
- PowerShell cannot run backend venv:
  - This project currently has a Linux-style venv (`.venv/bin`). Use WSL terminal.
- `make run` fails unexpectedly:
  - Start the two services manually using the commands in Step 4 for clearer logs.
