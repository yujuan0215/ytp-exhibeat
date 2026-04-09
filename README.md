# YTP-ExhiBeat 展覽整合平台

本專案是一個全方位的都會藝文展演平台，透過動態推薦演算法、互動式地圖視覺化與強大的自然語言 AI Agent，為用戶打造直覺且無縫的找展覽體驗。

為了支撐龐大的運算需求（包含自然語言處理與推薦模型），本系統架構將明確拆分為**前端 (Frontend)**、**後端 (Backend)**、**資料庫 (DB)** 以及**資料擷取管道 (Scraper)**。

## 🚀 系統核心功能與應用場景

1. **資訊彙整主頁**：運用大數據推薦模型主動推播有興趣的展演活動。包含展演的重點摘要（AI 生成輔助）、標籤篩選器以及即時社群評論與回饋區塊。
2. **視覺化地圖 (Map)**：將展演活動空間化呈現，支援自選願望清單標記與地圖範圍推薦。讓使用者一目瞭然城市裡的藝文脈動。
3. **AI Agent (自然語言助手)**：AI Agent 不僅能幫你查詢相關資料、安排行程，更能直接連動操作地圖標記及收藏清單。背後依賴向量檢索庫 (ChromaDB) 輔助減少幻覺。

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
│   ├── app/
│   │   ├── api/               
│   │   ├── agent/             
│   │   │   ├── agent_core.py  # AI 總機，負責調度 RAG 與對話記憶
│   │   │   └── memory.py      # 管理多輪對話上下文
│   │   ├── rag/               # 🆕 RAG 專屬模組
│   │   │   ├── embedder.py    # 將文字轉換為向量 (呼叫 OpenAI/Gemini Embedding API)
│   │   │   ├── retriever.py   # 向量檢索邏輯 (負責跟 ChromaDB 溝通，找出 Top-K 展覽)
│   │   │   └── prompt_builder.py # 將檢索到的展演文本與用戶問題組合成最終 Prompt
│   │   ├── recommender/       # 可結合向量相似度做混合推薦 (Hybrid Search)
│   │   ├── db/
│   │   │   ├── models.py      # 儲存用戶結構化資料 (帳號、密碼、收藏清單)
│   │   │   └── session.py     
│   │   └── main.py
│   └── requirements.txt
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
