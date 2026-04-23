# YTP-ExhiBeat 展覽整合平台

本專案是一個都會藝文展演平台，結合**動態推薦演算法**、**互動式地圖**與**自然語言 AI Agent**，讓使用者能直覺地找到想看的展覽。

架構明確拆分為：**前端 (Frontend / React+Vite)**、**後端 API Proxy (FastAPI)**、**ADK Agent (Google ADK + Gemini)**、**推薦系統 (LightFM + Heuristic)** 以及**資料擷取 (Crawler)**。

---

## 📐 系統執行時的連線關係

```
Browser (port 5173)
      │
      ▼  Vite dev server + proxy
/api/* → http://127.0.0.1:8000
                     │
                     ▼  FastAPI api_proxy_server.py
  ┌──────────────────┴──────────────────┐
  │ /api/recommendations/*               │──→ backend/app/recommender
  │ /api/apps/*, /api/run, /api/list-apps│──→ ADK Web Server  (port 8001)
  └──────────────────────────────────────┘
```

所有前端呼叫只認一個 origin（`/api/...`），後端會自動分流。這樣前端不用管背後是 ADK、推薦系統，還是未來加上的其他服務。

---

## 🚀 快速開始（三種路線）

下面三種方式挑一種即可。**第一次建議先用「本機 venv」確認整體流程跑得起來，再考慮 Docker。**

| 路線 | 適合對象 | 需要 |
| --- | --- | --- |
| 1. 本機 venv + npm | 大多數開發者 | Python 3.11/3.12（建議）或 3.13、Node 22+ |
| 2. Docker Compose | 不想碰 Python/venv、或要一鍵起服務 | Docker Desktop |
| 3. Cloud Run | 正式部署 | GCP 專案、`gcloud` CLI |

---

## 🔑 先決條件：Google API 金鑰（必備）

ADK Agent 需要呼叫 Gemini 模型，你必須 **擇一** 提供憑證。第一次測試強烈建議走 (A)：

### (A) Google AI Studio API Key — **推薦，免 GCP 帳單**

1. 開啟 <https://aistudio.google.com/app/apikey>（需要 Google 帳號登入）
2. 點選 **Create API key**，把金鑰複製下來
3. 稍後會填入 `backend/adk_agent/gemini_agent/.env` 的 `GOOGLE_API_KEY=`

> 免費配額：每分鐘 15 次呼叫，每天 1500 次，大多數測試綽綽有餘。

### (B) Vertex AI — 正式部署路線

1. 在 Google Cloud Console 建立或選用一個專案（<https://console.cloud.google.com>）
2. 為該專案啟用 Vertex AI API（URL：`https://console.cloud.google.com/apis/library/aiplatform.googleapis.com`）
3. 安裝 [gcloud CLI](https://cloud.google.com/sdk/docs/install)，然後執行：
   ```bash
   gcloud auth login
   gcloud auth application-default login
   gcloud config set project <your-project-id>
   ```
4. 在 `backend/adk_agent/gemini_agent/.env` 把 `GOOGLE_GENAI_USE_VERTEXAI` 改為 `1`，並設定 `GOOGLE_CLOUD_PROJECT` 和 `GOOGLE_CLOUD_LOCATION`

### 其他可選 API（非必要，缺了不影響主流程）

| 變數 | 用途 | 申請位置 |
| --- | --- | --- |
| `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET` | 附近捷運/公車查詢 | <https://tdx.transportdata.tw/> |
| `GOOGLE_MAPS_API_KEY` | 場館評分 / 評論補強 | <https://console.cloud.google.com/apis/credentials> |

---

## 🖥️ 路線 1：本機 venv + npm（Windows / macOS / Linux）

### 0. 前置安裝

| 作業系統 | Python 3.11/3.12 | Node 22+ |
| --- | --- | --- |
| Windows | 官網下載安裝，或 `winget install Python.Python.3.12` | `winget install OpenJS.NodeJS.LTS` |
| macOS | `brew install python@3.12` | `brew install node@22` |
| Linux (Ubuntu/Debian) | `sudo apt install python3.12 python3.12-venv` | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash - && sudo apt install -y nodejs` |

> Windows 上 Python **3.13** 也能跑（已測試），但 LightFM 套件（可選）只支援到 3.12。若之後想啟用 LightFM 推薦，請保留 3.11 或 3.12。

### 1. Clone repo

```bash
git clone <this-repo-url>
cd ytp-exhibeat
```

### 1.5 前端手動指令（不使用腳本）

如果你想先用最直覺的 npm 指令，不一定要用 `scripts/start_frontend.*`。

重點是：前端的 `package.json` 在 `frontend/`，所以要先切到該資料夾。

```bash
cd frontend
npm install
npm run dev
```

若你在 repo 根目錄直接執行 `npm install`，會看到 `ENOENT ... package.json`（因為根目錄沒有前端的 `package.json`）。

### 2. Windows（PowerShell）

```powershell
# 一次性建立後端 venv、安裝依賴、產生 .env
powershell -ExecutionPolicy Bypass -File .\scripts\setup_backend.ps1

# 編輯 backend\adk_agent\gemini_agent\.env，填入 GOOGLE_API_KEY
notepad backend\adk_agent\gemini_agent\.env

# 啟動後端（port 8000 + 8001）
powershell -ExecutionPolicy Bypass -File .\scripts\start_backend.ps1
```

另開一個 PowerShell 視窗：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_frontend.ps1
```

### 3. macOS / Linux（bash / zsh）

```bash
bash scripts/setup_backend.sh

# 填入 GOOGLE_API_KEY
${EDITOR:-nano} backend/adk_agent/gemini_agent/.env

bash scripts/start_backend.sh
```

另開 terminal：

```bash
bash scripts/start_frontend.sh
```

### 4. 打開瀏覽器

- 前端 UI：<http://127.0.0.1:5173>
- 後端 API（直接測試）：<http://127.0.0.1:8000/api/recommendations/home>
- ADK Web UI（直接測 Agent）：<http://127.0.0.1:8001>

---

## ✅ 驗證前後端確實串起來

不想點網頁也可以直接用 `curl` 確認。三個回應都該是 200：

```bash
curl -s -w "\n%{http_code}\n" http://127.0.0.1:5173/api/recommendations/home | tail -c 200
curl -s -w "\n%{http_code}\n" http://127.0.0.1:5173/api/list-apps
curl -s -X POST -H "Content-Type: application/json" -d '{}' \
  http://127.0.0.1:5173/api/apps/gemini_agent/users/local-dev-user/sessions \
  -w "\n%{http_code}\n"
```

預期：

1. 第一條回 18 個展覽 JSON（`"exhibitions":[…]`）
2. 第二條回 `["gemini_agent",...]`
3. 第三條回一個含 `id`、`appName` 的 session JSON

> 第一次打 `/api/recommendations/home` 可能需要 10–15 秒，因為後端會試呼叫一次 Gemini；若沒有憑證，之後每次都會直接用 naive fallback，幾十毫秒就能回。

---

## 🐳 路線 2：Docker Compose（一鍵）

前提：[Docker Desktop](https://www.docker.com/products/docker-desktop/) 已安裝並在執行。Windows 建議用 WSL2 backend。

```bash
# 先準備 .env（任何一台機器都要這一步，container 會掛進去讀）
cp backend/adk_agent/gemini_agent/.env.sample \
   backend/adk_agent/gemini_agent/.env
# 編輯它，填入 GOOGLE_API_KEY

# 起服務（-d 讓它在背景）
docker compose up --build -d

# 看 log
docker compose logs -f
```

打開 <http://127.0.0.1:5173> 就是完整前端。

關閉：

```bash
docker compose down
```

> Vite 在容器內是以 dev server 模式跑（方便開發時熱重載）。要打包成正式產物請改用 `npm run build` + 任何靜態 host。

---

## ☁️ 路線 3：部署到 Google Cloud Run（後端）

僅適用於走 Vertex AI 路線。`backend/adk_agent/Makefile`（僅支援 macOS / Linux，Windows 請在 WSL 內執行）提供：

```bash
cd backend/adk_agent
make auth PROJECT=<your-gcp-project-id>
make enable-apis
make deploy PROJECT=<your-gcp-project-id>
```

部署完 gcloud 會印出 service URL；把前端的 `VITE_API_PROXY_TARGET` 指到該 URL 就能讓 production 前端接到 Cloud Run 後端。

---

## 常見問題排查

常見啟動與串接問題已移到獨立文件：`docs/TROUBLESHOOTING.md`

---

## 📂 專案結構（目前落地的部分）

```text
ytp-exhibeat/
├── frontend/                      # React + Vite
│   ├── src/
│   │   ├── lib/api.ts             # 統一的 /api/* 呼叫層
│   │   └── pages/
│   └── vite.config.ts             # 只允許從 VITE_API_PROXY_TARGET 覆寫，預設 127.0.0.1:8000
│
├── backend/
│   ├── adk_agent/                 # 這裡有 api_proxy_server + ADK agent
│   │   ├── api_proxy_server.py    # FastAPI：推薦 API + ADK 反向代理
│   │   ├── gemini_agent/
│   │   │   ├── agent.py           # ADK agent 入口
│   │   │   ├── .env.sample        # 一鍵改成 .env 然後填 GOOGLE_API_KEY
│   │   │   ├── instruction/
│   │   │   ├── models/
│   │   │   └── tools/             # 文化部 / 天氣 / 地理 / 推薦 tools
│   │   ├── Makefile               # macOS/Linux 的 `make setup/run/deploy`
│   │   └── requirements.txt
│   │
│   ├── app/recommender/           # LightFM + heuristic 推薦原型
│   │   ├── exhibeat_lightfm_demo.py
│   │   └── requirements.txt
│   │
│   └── shared/                    # ADK tools & recommender 共用的規則
│       └── recommendation_core.py
│
├── crawler/                       # 藝文網站爬蟲（目前：artemperor）
│   ├── crawl_artemperor.py
│   └── vectorize_artemperor.py
│
├── data/                          # SQLite / 向量庫輸出
│
├── scripts/                       # 🆕 跨平台 setup / start 腳本
│   ├── setup_backend.ps1 / .sh
│   ├── start_backend.ps1 / .sh
│   └── start_frontend.ps1 / .sh
│
├── docker-compose.yml             # 🆕 一鍵起整套
├── Dockerfile.backend             # 🆕 後端容器（ADK + API proxy）
├── Dockerfile.frontend            # 🆕 前端 dev 容器
│
├── exhibitions.json               # 預先抓好的展覽資料（推薦系統輸入）
└── README.md                      # 本檔案
```

---

## 🧩 後端模組總覽

### `backend/adk_agent/`（Google ADK + Gemini）

- 使用 Google ADK 與 Gemini（AI Studio 或 Vertex AI 皆可）做展演探索與行程規劃
- 串接文化部藝文活動 OpenAPI、Open-Meteo 天氣、Nominatim 地理查詢
- 本地 SQLite 快取活動資料，減輕外部 API 壓力
- `api_proxy_server.py` 把「推薦系統」跟「ADK Agent」包成同一個 origin，前端只打 `/api/...`

### `backend/app/recommender/`（LightFM + Heuristic）

- 讀取 `exhibitions.json`，從文字、地點、票價、熱門度抽取 item features
- 以 synthetic personas 產生互動資料做 cold start
- **Heuristic baseline** 沒裝 LightFM 也能跑；**Hybrid LightFM** 則會融合 embedding 與啟發式分數
- `api_proxy_server.py` 預設以 `fallback`（純 heuristic）模式呼叫，所以 Python 3.13 也能跑

### `backend/shared/recommendation_core.py`

城市/標籤/場館關鍵字、`UserPreference`、`RecommendableEvent` 等共用資料結構與評分函式。`event_tools`（ADK）與推薦原型共用，避免兩套規則漂移。

---

## 🛣️ 資料流動

1. **資料獲取**：`crawler/` 或文化部等公開 API 提供展演資料；結構化資料進 SQLite，長文切塊後可寫入 ChromaDB。
2. **後端**：
   - **ADK Agent** 負責對話、工具呼叫（文化部 API、天氣、地理）、寫入 SQLite
   - **推薦系統** 離線讀 `exhibitions.json`，線上透過 `api_proxy_server.py` 暴露 REST
   - 兩者共用 `backend/shared/recommendation_core.py` 的推薦規則
3. **前端**：所有 UI 都只走 `/api/...`，由 Vite dev server（開發）或 Cloud Run（正式）轉發到上述後端。
