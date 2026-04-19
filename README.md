# YTP-ExhiBeat 展覽整合平台

本專案是一個全方位的都會藝文展演平台，透過動態推薦演算法、互動式地圖視覺化與強大的自然語言 AI Agent，為用戶打造直覺且無縫的找展覽體驗。

為了支撐龐大的運算需求（包含自然語言處理與推薦模型），本系統架構將明確拆分為**前端 (Frontend)**、**後端 (Backend)**、**資料庫 (DB)** 以及**資料擷取管道 (Scraper)**。

## 🚀 系統核心功能與應用場景

1. **資訊彙整主頁**：運用大數據推薦模型主動推播有興趣的展演活動。包含展演的重點摘要（AI 生成輔助）、標籤篩選器以及即時社群評論與回饋區塊。
2. **視覺化地圖 (Map)**：將展演活動空間化呈現，支援自選願望清單標記與地圖範圍推薦。讓使用者一目瞭然城市裡的藝文脈動。
3. **AI Agent (自然語言助手)**：AI Agent 不僅能幫你查詢相關資料、安排行程，更能直接連動操作地圖標記及收藏清單。背後依賴向量檢索庫 (ChromaDB) 輔助減少幻覺。

## ✅ Backend 模組總覽

後端程式集中在 `backend/`，目前由三塊組成：**ADK Agent 服務**、**推薦原型腳本**，以及兩者共用的**推薦啟發式核心**。

### `backend/adk_agent/`（Google ADK + Gemini）

可直接執行、可查真實展演資料、可部署到 Cloud Run 的 Agent 原型，能力包含：

- 使用 Google ADK 與 Gemini（Vertex AI）做展演探索與簡化行程規劃
- 串接文化部藝文活動 OpenAPI：同步、搜尋、活動詳情、附近活動
- 串接 Open-Meteo 天氣 API，做情境式回覆
- 透過 Nominatim / OpenStreetMap Search 做地理相關查詢
- 本地 SQLite 快取活動資料，降低重複打外部 API 的不穩定性
- `Makefile`：`make setup` / `make run` 本地啟動；`make deploy PROJECT=...` 部署 Cloud Run

**快速開始**（需 Python 3.11+、GCP 專案與 Vertex AI 權限）：

```bash
cd backend/adk_agent
make setup
source .venv/bin/activate
# 編輯 gemini_agent/.env（可由 .env.sample 複製），填入 GOOGLE_CLOUD_PROJECT 等
make run
```

`adk web` 預設監聽 `0.0.0.0:8000`。部署與 `gcloud` 認證流程請見 `backend/adk_agent/Makefile`；模組細節見 `backend/adk_agent/README.md`。

**環境變數重點**（`gemini_agent/.env`）：`GOOGLE_GENAI_USE_VERTEXAI`、`GOOGLE_CLOUD_PROJECT`、`GOOGLE_CLOUD_LOCATION`、`GEMINI_MODEL`；選填 `TDX_CLIENT_ID` / `TDX_CLIENT_SECRET`、`GOOGLE_MAPS_API_KEY`（詳見 `.env.sample`）。請勿將 `.env` 提交版本庫。

### `backend/app/recommender/`（LightFM 推薦原型）

- 讀取 repo 根目錄的 `exhibitions.json`
- 從展覽文字、地點、票價、熱門度抽取 item features
- 以 synthetic personas 模擬互動，再與 heuristic 分數混合
- 輸出可解釋的推薦排序（之後可改接真實 click / 收藏 / 地圖互動）

**設計重點**（冷啟動可 demo、上線可演進）：

- **共用特徵與規則**：城市/標籤/場館關鍵字、室內外與熱門度門檻、`UserPreference` / `RecommendableEvent` 等，集中在 `backend/shared/recommendation_core.py`，讓 recommender 與 ADK tools 用同一套推斷與理由生成。
- **兩段式排序**：
  - **Heuristic baseline**：可在沒有模型/環境不完整時跑出穩定排序（也能解釋「為什麼推你」）。
  - **Hybrid LightFM**：用內容特徵 + synthetic interactions 做 ranking，最後再與 heuristic 分數混合，降低 demo 抖動。
- **Persona → 互動資料**：用 persona 規則合成冷啟動互動，驗證整個 pipeline；之後可直接替換成真實事件 `click / save / map_view / agent_query`。
- **可解釋輸出**：除了排序分數，也會產生推薦理由（reasons），方便接到首頁 feed、地圖與 Agent 回覆。

**安裝與執行**（建議 Python 3.11 或 3.12；LightFM 在 3.13 上可能較不穩定）：

```bash
cd backend/app/recommender
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

執行 demo（腳本會自動把 repo 根目錄加入 `sys.path`，一般從根目錄用相對路徑即可）：

```bash
python3 backend/app/recommender/exhibeat_lightfm_demo.py --top-k 5
python3 backend/app/recommender/exhibeat_lightfm_demo.py --persona taipei_after_work --top-k 5
```

`--backend auto` 會在已安裝 LightFM 時走 hybrid，否則自動退回 heuristic。更多參數與 JSON 輸出見 `backend/app/recommender/README.md`。

### `backend/shared/`（共用邏輯）

`recommendation_core.py` 提供縣市關鍵字、標籤／場館關鍵字規則、`UserPreference` / `RecommendableEvent` 等資料結構，以及城市與標籤推斷、heuristic 評分與推薦理由建構。**ADK Agent 的 `event_tools`** 與 **推薦原型腳本** 皆 import 此模組，避免兩套規則漂移。

---

正式 REST `api/`、`rag/`、`db/` 等目錄可作為後續擴充；目前 repo 內已實作的部分以上述三路徑為主。

## 🗂️ 專案目錄與系統架構圖 (前後端分離架構)

```text
ytp-exhibeat/
├── frontend/                   # React 前端
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home/                  # 分頁一：資訊彙整主頁
│   │   │   │   ├── index.jsx
│   │   │   │   ├── RecommendFeed.jsx  # 動態推薦首頁
│   │   │   │   ├── SearchBar.jsx      # 關鍵字 / 標籤搜尋
│   │   │   │   ├── EventCard.jsx      # 展演縮圖區塊
│   │   │   │   └── CommentSection.jsx # 社群互動 / 留言 / 評分
│   │   │   ├── Map/                   # 分頁二：視覺化地圖
│   │   │   │   ├── index.jsx
│   │   │   │   ├── MapView.jsx        # 地圖介面（Leaflet / Mapbox）
│   │   │   │   ├── MarkerLayer.jsx    # 展演標記與篩選
│   │   │   │   └── WishlistOverlay.jsx# 喜好清單圖層
│   │   │   └── Agent/                 # 分頁三：AI Agent
│   │   │       ├── index.jsx
│   │   │       ├── ChatInterface.jsx  # 多輪對話介面
│   │   │       └── AgentActions.jsx   # 連動地圖 / 寫入清單
│   │   ├── components/                # 共用元件
│   │   │   ├── Navbar.jsx
│   │   │   ├── TagFilter.jsx          # 標籤分類元件
│   │   │   └── AIBadge.jsx            # AI 生成標示
│   │   ├── store/                     # 全域狀態（Zustand / Redux）
│   │   │   ├── userStore.js           # 用戶偏好 / 喜愛清單
│   │   │   └── eventStore.js          # 展演資料快取
│   │   ├── hooks/
│   │   │   ├── useRecommend.js        # 推薦演算法 hook
│   │   │   └── useAgent.js            # AI Agent 對話 hook
│   │   ├── services/                  # API 呼叫層
│   │   │   ├── eventService.js
│   │   │   ├── agentService.js
│   │   │   └── mapService.js
│   │   └── App.jsx
│   └── package.json               # (與原架構相同，略)
│
├── backend/
│   ├── shared/                # 推薦啟發式與特徵推斷（ADK tools + recommender 共用）
│   │   └── recommendation_core.py
│   ├── adk_agent/             # Google ADK Agent 原型（可本地 / Cloud Run）
│   │   ├── gemini_agent/
│   │   │   ├── agent.py
│   │   │   ├── models/
│   │   │   ├── instruction/system.md
│   │   │   └── tools/
│   │   │       ├── event_tools.py
│   │   │       ├── weather.py
│   │   │       └── sample_tool.py
│   │   ├── Dockerfile
│   │   ├── Makefile
│   │   ├── requirements.txt
│   │   ├── README.md
│   │   └── .env.sample
│   └── app/
│       └── recommender/       # LightFM + heuristic 推薦原型
│           ├── exhibeat_lightfm_demo.py
│           ├── requirements.txt
│           └── README.md
│
├── crawler/                   
│   ├── spiders/               
│   ├── cleaner.py             
│   └── vectorizer.py          # 🆕 爬蟲後處理：將長篇展覽介紹切塊 (Chunking) 並寫入向量庫
│
└── data/                      
    ├── sqlite.db              # 儲存結構化資料 (User, 收藏清單)
    └── vector_store/          # 🆕 存放 ChromaDB 或 FAISS 的本地向量索引檔案
```

## 🛠️ 資料流動概念

1. **資料獲取 (Scraper / 外部 OpenAPI)**：`crawler/` 或文化部等公開 API 提供展演資料；結構化資料可進 DB，長文可再切塊向量化（產品規劃中的 RAG 路徑）。
2. **後端 (Backend)**（目前實作）：
   - **ADK Agent**：工具層呼叫文化部 API、天氣與地理服務，並將活動寫入本地 SQLite；對話層由 Gemini 編排。推薦相關的規則與理由說明與 `backend/shared/recommendation_core.py` 對齊。
   - **推薦原型**：離線／腳本讀取 `exhibitions.json`，以 LightFM 與同一套 heuristic 產生排序，供 demo 或日後接到正式 API。
3. **前端 (Frontend)**：地圖與列表等 UI；正式上線時可改呼叫統一 REST / BFF，目前 Agent 側以 ADK Web UI 或部署後的服務 URL 驗證。