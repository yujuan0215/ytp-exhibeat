# YTP-ExhiBeat 展覽整合平台

## 專案簡介

ExhiBeat 是一個整合「展覽探索、推薦、地圖與 AI 助手」的都會藝文平台。  
目前專案採前後端分離架構，主要模組如下：

- `frontend/`：React + Vite 前端介面
- `backend/adk_agent/api_proxy_server.py`：FastAPI API Proxy
- `backend/adk_agent/gemini_agent/`：AI Agent 與工具
- `backend/app/recommender/`：推薦邏輯與資料處理
- `crawler/`：展演資料擷取與彙整

使用者可透過首頁與地圖瀏覽展覽、查看展覽詳情、加入收藏，並用 AI 助手做行程探索與推薦。

---

## 為什麼使用我們的服務

- **一站式展覽入口**：把分散在不同來源的活動資訊集中管理
- **快速決策**：整合推薦與地圖視角，減少找活動的時間成本
- **互動式探索**：可依地點、時間與偏好更直覺地篩選展演
- **可擴充架構**：前端只打 `/api/*`，後端可持續擴充資料來源與服務
- **開發友善**：本機開發流程簡單，適合快速迭代與展示 Demo

---

## Quick Start

### Requirement install

請先安裝：

- Python 3.11 或 3.12（建議）
- Node.js 22+
- npm（隨 Node 安裝）

可選（若你想用容器啟動）：

- Docker Desktop

---

### Get API key

本專案使用 Gemini 相關能力時，需要 Google API Key。

1. 前往 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 建立並複製 API Key
3. 建立環境檔：

```bash
cp backend/adk_agent/gemini_agent/.env.sample backend/adk_agent/gemini_agent/.env
```

4. 打開 `backend/adk_agent/gemini_agent/.env`，填入：

```env
GOOGLE_API_KEY=your_api_key_here
```

---

### Quick start

在專案根目錄依序執行：

```bash
# 1) 安裝前端依賴
cd frontend
npm install
cd ..

# 2) 建立後端虛擬環境與依賴（macOS/Linux）
bash scripts/setup_backend.sh

# 3) 啟動後端
bash scripts/start_backend.sh
```

另開一個 terminal：

```bash
# 4) 啟動前端
bash scripts/start_frontend.sh
```

啟動後可使用：

- Frontend: <http://127.0.0.1:5173>
- Backend API: <http://127.0.0.1:8000>
- ADK Agent UI: <http://127.0.0.1:8001>

