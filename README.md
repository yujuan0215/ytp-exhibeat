# YTP-ExhiBeat 展覽整合平台

本專案是一個全方位的都會藝文展演平台，透過動態推薦演算法、互動式地圖視覺化與強大的自然語言 AI Agent，為用戶打造直覺且無縫的找展覽體驗。

為了支撐龐大的運算需求（包含自然語言處理與推薦模型），本系統架構將明確拆分為**前端 (Frontend)**、**後端 (Backend)**、**資料庫 (DB)** 以及**資料擷取管道 (Scraper)**。

## 🚀 系統核心功能與應用場景

1. **資訊彙整主頁**：運用大數據推薦模型主動推播有興趣的展演活動。包含展演的重點摘要（AI 生成輔助）、標籤篩選器以及即時社群評論與回饋區塊。
2. **視覺化地圖 (Map)**：將展演活動空間化呈現，支援自選願望清單標記與地圖範圍推薦。讓使用者一目瞭然城市裡的藝文脈動。
3. **AI Agent (自然語言助手)**：AI Agent 不僅能幫你查詢相關資料、安排行程，更能直接連動操作地圖標記及收藏清單。背後依賴向量檢索庫 (ChromaDB) 輔助減少幻覺。

## ✅ 目前已落地的後端模組

目前 repo 內已加入一個可直接執行的 ADK Agent prototype，路徑在 `backend/adk_agent/`。這個模組不是空架構，而是已經接上真實資料來源與可部署流程的後端原型，包含：

- 使用 Google ADK / Gemini 建立展演探索與行程規劃 Agent
- 串接文化部藝文活動 OpenAPI，支援同步、搜尋、活動詳情與附近活動
- 串接 Open-Meteo 天氣 API，支援情境式推薦
- 以 SQLite 建立本地活動資料表，降低每次查詢都打外部 API 的不穩定性
- 支援 `make run` 本地啟動與 `make deploy` 部署到 Cloud Run

另外，repo 內也新增了一個推薦原型 `backend/app/recommender/`，把 `LightFM` 的 hybrid recommender 思路改造成適合 hackathon demo 的版本：

- 直接讀取根目錄的 `exhibitions.json`
- 從展覽文字、地點、票價、熱門度抽 item features
- 用 synthetic personas 建立冷啟動階段的互動資料
- 將 LightFM 分數與 heuristic score 混合，輸出可解釋的推薦結果

若要直接看模組說明與啟動方式：

```bash
cd backend/adk_agent
```

若要看推薦原型：

```bash
cd backend/app/recommender
```

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
│   ├── adk_agent/             # 已落地的 Google ADK Agent backend prototype
│   │   ├── gemini_agent/
│   │   │   ├── agent.py
│   │   │   ├── instruction/system.md
│   │   │   └── tools/
│   │   │       ├── event_tools.py
│   │   │       ├── weather.py
│   │   │       └── sample_tool.py
│   │   ├── Makefile
│   │   ├── requirements.txt
│   │   └── WORKSHOP.md
│   └── app/                   # 後續可持續擴充的正式 API 層
│       ├── api/               
│       ├── agent/             
│       ├── rag/
│       ├── recommender/
│       └── db/
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

1. **資料獲取 (Scraper)** 定期從外部抓回來的資料，進入關聯式資料庫及進行 Embeddings 後存入向量庫。
2. **後端 (Backend)** 裡面的 `core/` 負責處理所有的「推薦模型預測」、「向量檢索」以及「背景摘要生成」演算法，然後透過 `api/v1` 將結果發佈出來。
3. **前端 (Frontend)** 為輕量級設計，專注於地圖視覺化與即時與 API 的互動展示。
