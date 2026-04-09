# YTP Exhibeat 展覽資料庫計畫

這是一個用於練習與實作文化部開放資料平台（Open Data）API 串接的專案。主要目標是抓取全台各地的展覽活動資訊，並將資料留存於本地端，做為後續 React 網頁應用程式的靜態資料庫。

## 專案功能

- **自動擷取資料**：透過 Node.js 腳本向文化部展覽 API (`category=6`) 請求資料。
- **本地 JSON 資料庫**：將抓取下來的內容轉存為 `exhibitions.json`，方便前端（如 React、Vue 等）直接引入並做列表渲染或地圖呈現，無須額外架設後端資料庫。
- **解析文件輔助工具**：附有 PDF 內容解析的參考腳本，用以提取 API 欄位說明書的資訊。

## 檔案結構說明

- `fetch_exhibitions.js`：Node.js 執行的抓取爬蟲腳本。
- `exhibitions.json`：由腳本自動產生的靜態展覽資料庫。
- `extract_pdf.py`：用來將 API 欄位文件 (PDF) 轉成純文字的輔助 Python 腳本。

## 使用方式

1. 請先確保您的電腦已安裝 [Node.js](https://nodejs.org/)。
2. 開啟終端機（Terminal）並將目錄切換至本專案。
3. 執行下列指令以抓取最新的展覽資料庫：
   ```bash
   node fetch_exhibitions.js
   ```
4. 當腳本執行完畢並提示「資料已成功儲存」時，就可以在您的應用程式中載入 `exhibitions.json` 了！

## 在 React 中引用的範例

您可以直接將產生的 JSON 檔案匯入：
```jsx
// App.jsx
import React from 'react';
import exhibitionData from './exhibitions.json';

export default function App() {
  return (
    <div>
      <h1>最新展覽</h1>
      <ul>
        {exhibitionData.slice(0, 5).map(item => (
          <li key={item.UID}>
            {item.title} ({item.startDate} ~ {item.endDate})
          </li>
        ))}
      </ul>
    </div>
  );
}
```
