# YTP-ExhiBeat 展覽整合平台

YTP-ExhiBeat 是一個展覽整合平台，包含：

- `frontend/`：React + Vite 前端
- `backend/adk_agent/`：FastAPI API proxy + Google ADK Gemini agent
- `backend/app/recommender/`：推薦系統原型
- `crawler/`：展覽資料爬蟲與向量化工具

本文件是主要安裝指南。子資料夾 README 只保留該模組的補充說明，避免多份文件互相衝突。

## 執行架構

```text
Browser
  -> Vite dev server http://127.0.0.1:5173
  -> /api/* proxy to FastAPI http://127.0.0.1:8000
  -> ADK agent http://127.0.0.1:8001
```

前端只呼叫 `/api/...`。本機開發時由 Vite 轉給 FastAPI，FastAPI 再分流到推薦系統或 ADK agent。

## 安裝方法

建議統一使用「本機安裝」開發。Docker Compose 是同一套流程的容器版，給不想裝 Python/Node 環境的人使用。

| 方法 | 建議用途 | 需要 |
| --- | --- | --- |
| 本機安裝 | 日常開發、最容易除錯 | Python 3.11/3.12、Node.js 22+ |
| Docker Compose | 快速啟動整套服務 | Docker Desktop |

Cloud Run / Vertex AI 部署不是本機開發主線，文件先不放在快速開始裡。

## 需要申請哪些 API key

### 必填：Gemini API key

用途：聊天機器人、展覽摘要、推薦文字補強。

申請位置：Google AI Studio
<https://aistudio.google.com/app/apikey>

填到：

```env
GOOGLE_GENAI_USE_VERTEXAI=0
GOOGLE_API_KEY=你的_Google_AI_Studio_API_key
```

檔案位置：

```text
backend/adk_agent/gemini_agent/.env
```

本專案預設使用 `GOOGLE_API_KEY`。不需要 Vertex AI、不需要 service account 憑證檔。

### 選填：Google Maps JavaScript API key

用途：前端地圖頁顯示 Google Maps。

需要啟用的 API：Maps JavaScript API
申請與啟用位置：Google Cloud Console API Library
<https://console.cloud.google.com/apis/library/maps-backend.googleapis.com>

填到：

```env
VITE_GOOGLE_MAPS_API_KEY=你的_Google_Maps_key
```

檔案位置：

```text
frontend/.env.local
```

沒有這個 key 時，主要前端、推薦與聊天仍可跑，只有地圖頁無法載入 Google Maps。

### 選填：Google Places API key

用途：後端查場館評分與評論，讓 agent 回答更完整。

需要啟用的 API：Places API (New)
申請與啟用位置：Google Cloud Console API Library
<https://console.cloud.google.com/apis/library/places.googleapis.com>

填到：

```env
GOOGLE_MAPS_API_KEY=你的_Google_Maps_or_Places_key
```

檔案位置：

```text
backend/adk_agent/gemini_agent/.env
```

這個 key 可以和前端地圖 key 是同一把，也可以分開。若要限制 key，前端那把限制 HTTP referrer，後端那把限制 server/IP 與 Places API。

### 選填：TDX API key

用途：捷運、公車等交通資料查詢。

申請位置：TDX 運輸資料流通服務
<https://tdx.transportdata.tw/>

填到：

```env
TDX_CLIENT_ID=你的_TDX_client_id
TDX_CLIENT_SECRET=你的_TDX_client_secret
```

檔案位置：

```text
backend/adk_agent/gemini_agent/.env
```

沒有 TDX key 時，交通資訊會降級或略過，不影響基本啟動。

## 方法一：本機安裝

### 1. Clone 專案

```bash
git clone https://github.com/yujuan0215/ytp-exhibeat.git
cd ytp-exhibeat
```

### 2. 安裝後端

macOS / Linux / WSL：

```bash
bash scripts/setup_backend.sh
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup_backend.ps1
```

這一步會建立：

```text
backend/adk_agent/.venv
backend/adk_agent/gemini_agent/.env
```

接著打開 `.env`，至少填入：

```env
GOOGLE_GENAI_USE_VERTEXAI=0
GOOGLE_API_KEY=你的_Google_AI_Studio_API_key
```

### 3. 安裝前端 env

如果你要使用地圖頁：

```bash
cp frontend/.env.local.sample frontend/.env.local
```

然後在 `frontend/.env.local` 填入：

```env
VITE_GOOGLE_MAPS_API_KEY=你的_Google_Maps_key
```

如果暫時不測地圖頁，可以跳過這一步。

### 4. 啟動後端

macOS / Linux / WSL：

```bash
bash scripts/start_backend.sh
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_backend.ps1
```

後端會同時啟動：

- FastAPI：<http://127.0.0.1:8000>
- ADK Web UI：<http://127.0.0.1:8001>

### 5. 啟動前端

另開一個 terminal。

macOS / Linux / WSL：

```bash
bash scripts/start_frontend.sh
```

Windows PowerShell：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_frontend.ps1
```

打開：

```text
http://127.0.0.1:5173
```

## 方法二：Docker Compose

### 1. Clone 專案

```bash
git clone https://github.com/yujuan0215/ytp-exhibeat.git
cd ytp-exhibeat
```

### 2. 建立後端 env

```bash
cp backend/adk_agent/gemini_agent/.env.sample backend/adk_agent/gemini_agent/.env
```

編輯：

```text
backend/adk_agent/gemini_agent/.env
```

至少填入：

```env
GOOGLE_GENAI_USE_VERTEXAI=0
GOOGLE_API_KEY=你的_Google_AI_Studio_API_key
```

### 3. 視需求設定前端地圖 env

如果要使用地圖頁：

```bash
export VITE_GOOGLE_MAPS_API_KEY=你的_Google_Maps_key
```

PowerShell：

```powershell
$env:VITE_GOOGLE_MAPS_API_KEY="你的_Google_Maps_key"
```

Docker Compose 會把這個 shell env 傳進前端容器。若不測地圖頁，可以跳過這一步。

### 4. 啟動

```bash
docker compose up --build
```

打開：

```text
http://127.0.0.1:5173
```

停止：

```bash
docker compose down
```

## 驗證

後端啟動後可以測：

```bash
curl http://127.0.0.1:8000/api/recommendations/home
curl http://127.0.0.1:8000/api/list-apps
```

前端啟動後可以測 Vite proxy：

```bash
curl http://127.0.0.1:5173/api/recommendations/home
```

## 常見問題

### 我可以在 repo 根目錄跑 npm install 嗎？

不要。前端的 `package.json` 在 `frontend/`。

手動跑前端時請用：

```bash
cd frontend
npm install
npm run dev
```

### Vertex AI 要怎麼設定？

本專案本機開發不使用 Vertex AI。請保持：

```env
GOOGLE_GENAI_USE_VERTEXAI=0
GOOGLE_API_KEY=你的_Google_AI_Studio_API_key
```

只有未來要用 GCP service account 或 Cloud Run 的 Vertex AI 權限時，才需要改成 Vertex AI。

### Google Map 到底要哪個 API？

- 前端地圖頁：啟用 Maps JavaScript API，設定 `frontend/.env.local` 的 `VITE_GOOGLE_MAPS_API_KEY`
- 後端場館評論：啟用 Places API (New)，設定 `backend/adk_agent/gemini_agent/.env` 的 `GOOGLE_MAPS_API_KEY`

兩個功能可以共用同一把 Google Cloud API key，但正式環境建議分開限制。

### 沒有可選 key 會怎樣？

| 沒有的 key | 影響 |
| --- | --- |
| `GOOGLE_API_KEY` | 聊天與 Gemini 摘要不可用，必須補上 |
| `VITE_GOOGLE_MAPS_API_KEY` | 前端地圖頁不可用 |
| `GOOGLE_MAPS_API_KEY` | 後端不查 Google Places 評分與評論 |
| `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET` | 交通資料查詢降級或略過 |

## 開發流程

不要直接在 `main` 上實作與 push。

建議流程：

```bash
git switch main
git pull
git switch -c docs/clarify-installation

# 修改、測試

git status
git add README.md backend/README.md frontend/README.md backend/adk_agent/README.md backend/adk_agent/CHATBOT_API_RUN.md backend/adk_agent/gemini_agent/.env.sample frontend/.env.local.sample docker-compose.yml docs/TROUBLESHOOTING.md
git commit -m "docs: clarify installation and API key setup"
git push -u origin docs/clarify-installation
```

接著從 GitHub 開 PR。

commit message 建議格式：

```text
docs: clarify installation and API key setup
fix: handle missing maps api key
feat: add favorite exhibitions page
```

不要寫看不出內容的訊息，例如 `update`, `fix bug`, `changes`。

不需要的本機 branch 可以刪：

```bash
git branch -d branch-name
```

遠端 branch 已合併後可以刪：

```bash
git push origin --delete branch-name
```

## 其他文件

- [docs/AUTH_AND_FAVORITES.md](docs/AUTH_AND_FAVORITES.md)：登入與收藏 API
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)：常見錯誤排查
- [backend/adk_agent/README.md](backend/adk_agent/README.md)：ADK agent 模組補充
- [crawler/README.md](crawler/README.md)：爬蟲補充
