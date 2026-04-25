# ExhiBeat | 台北展演整合平台

把「分散在不同網站、社群、票務頁面」的展演資訊，整合成一個可搜尋、可比較、可推薦、可規劃的體驗。

---

## 先看重點（3 分鐘快速理解）

ExhiBeat 在做什麼？

- **展演整合**：集中多來源活動內容，降低找活動的時間成本
- **多元探索**：用關鍵字、標籤、地圖三種視角快速篩選
- **AI 增強推薦**：透過 AI Agent 與推薦邏輯，協助你找到更符合偏好的活動
- **從發現到決策**：不只看清單，還能收藏、比較、規劃行程

如果你是使用者：

1. 打開首頁看推薦
2. 用搜尋 + `#標籤` 篩選
3. 進詳情頁看內容與地圖
4. 用收藏與 AI 助手做下一步決策

---

## 為什麼需要 ExhiBeat

在台北，展演資訊並不缺，但「好用的整合」很少。

常見痛點：

- 資訊分散在官方網站、售票平台、社群貼文
- 使用者需要反覆切頁比對內容、地點、時間
- 很難在短時間內找到「真的適合自己」的活動

ExhiBeat 的價值是把這條路徑縮短：

**彙整資料 → 快速探索 → 個人化推薦 → 直接決策**

---

## Live View

[You can liveview at http://placeholder.com](http://placeholder.com)

---

## Quick Start

### 1) Requirement install

建議環境：

- Python 3.11 / 3.12
- Node.js 22+
- npm

依賴檔位置：

- 前端：`frontend/package.json`
- 後端：`backend/adk_agent/requirements.txt`
- 推薦模組（可選）：`backend/app/recommender/requirements.txt`

> 前端可以用 npm；但後端是 Python 服務，仍需安裝 `requirements.txt`，不建議全面改成 npm。

---

### 2) Get API key

若要啟用 Gemini 相關功能，請先準備 Google API Key：

1. 前往 [Google AI Studio](https://aistudio.google.com/app/apikey)
2. 建立 API Key
3. 建立環境檔：

```bash
cp backend/adk_agent/gemini_agent/.env.sample backend/adk_agent/gemini_agent/.env
```

4. 在 `backend/adk_agent/gemini_agent/.env` 填入：

```env
GOOGLE_API_KEY=your_api_key_here
```

---

### 3) Quick start

在專案根目錄執行：

```bash
# Frontend install
cd frontend
npm install
cd ..

# Backend setup (Python venv + requirements)
bash scripts/setup_backend.sh

# Start backend services
bash scripts/start_backend.sh
```

另開一個 terminal：

```bash
# Start frontend
bash scripts/start_frontend.sh
```

啟動後入口：

- Frontend: <http://127.0.0.1:5173>
- Backend API: <http://127.0.0.1:8000>
- ADK Agent UI: <http://127.0.0.1:8001>

---

## 技術架構（簡版）

- `frontend/`：React + Vite
- `backend/adk_agent/api_proxy_server.py`：FastAPI API Proxy
- `backend/adk_agent/gemini_agent/`：AI Agent + tool chain
- `backend/app/recommender/`：推薦邏輯
- `crawler/`：展演資料擷取與整合

