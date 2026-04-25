# Frontend

完整安裝流程請以根目錄 [README.md](../README.md) 為準。

本資料夾是 React + Vite 前端。前端 dev server 預設跑在：

```text
http://127.0.0.1:5173
```

API 會透過 Vite proxy 轉到：

```text
http://127.0.0.1:8000
```

## 啟動

從 repo 根目錄執行：

```bash
bash scripts/start_frontend.sh
```

或手動執行：

```bash
cd frontend
npm install
npm run dev
```

## 地圖環境變數

只有地圖頁需要 Google Maps key。

```bash
cp frontend/.env.local.sample frontend/.env.local
```

設定：

```env
VITE_GOOGLE_MAPS_API_KEY=你的_Google_Maps_key
```

需要在 Google Cloud 啟用 Maps JavaScript API：

```text
https://console.cloud.google.com/apis/library/maps-backend.googleapis.com
```

沒有這個 key 時，其他前端頁面仍可使用。
