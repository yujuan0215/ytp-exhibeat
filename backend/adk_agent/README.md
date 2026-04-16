# ExhiBeat ADK Agent Backend

這個資料夾是 `ytp-exhibeat` 目前已落地的 AI Agent backend prototype。

它提供的不是純範例，而是可直接執行、可查真資料、可部署的 Google ADK 模組，重點能力包含：

- 查詢台北展演活動
- 依地點搜尋附近展覽
- 取得展覽詳情、地圖與導航連結
- 根據時間與區域安排簡化版展覽行程
- 結合即時天氣做情境式回覆
- 將活動資料同步進本地 SQLite，提升搜尋穩定度

## 目錄重點

- `gemini_agent/`
  - ADK Agent 主程式、system prompt 與工具
- `Makefile`
  - 本地啟動、GCP 認證、Cloud Run 部署
- `requirements.txt`
  - Python 依賴
- `WORKSHOP.md`
  - 詳細 setup / deploy 手冊
- `EXHIBEAT_AGENT_PLAN.md`
  - 產品定位、tool 設計與 demo flow 規劃

## 目前串接的外部 API

- 文化部藝文活動 OpenAPI
- Open-Meteo
- Nominatim / OpenStreetMap Search API

## 快速開始

```bash
cd backend/adk_agent
make setup
source .venv/bin/activate
make run
```

若要部署到 Cloud Run：

```bash
make auth PROJECT=your-project-id
make enable-apis
make deploy PROJECT=your-project-id
```

## 注意

- `gemini_agent/.env` 不應提交到版本庫
- `.adk/` 與 `*.sqlite3` 屬於執行期產物，已由 repo `.gitignore` 排除
- 目前行程規劃已優先串接 TDX MaaS 路徑規劃；若 TDX 憑證缺失或查詢失敗，會自動回退為簡化交通估算
