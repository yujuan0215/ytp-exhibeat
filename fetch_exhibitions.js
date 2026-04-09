const fs = require('fs');

// 文化部展覽類型的 JSON API 網址 (category=6 代表展覽)
const apiUrl = 'https://cloud.culture.tw/frontsite/trans/SearchShowAction.do?method=doFindTypeJ&category=6';

async function fetchAndSaveExhibitions() {
  console.log('開始取得展覽資料...');
  try {
    // 取得遠端 API 資料
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
        throw new Error(`HTTP 錯誤! 狀態碼: ${response.status}`);
    }

    // 將資料轉為 JSON
    const data = await response.json();
    console.log(`成功取得資料，共 ${data.length} 筆展覽！`);

    // 將資料儲存到本地的 exhibitions.json 檔案，為了之後 React 使用做準備
    const fileName = 'exhibitions.json';
    fs.writeFileSync(fileName, JSON.stringify(data, null, 2), 'utf-8');
    
    console.log(`✅ 資料已成功儲存至 ${fileName}`);
    console.log('未來你的 React 或是後端程式就可以直接引用這個 JSON 檔案！');

  } catch (error) {
    console.error('取得資料時發生錯誤：', error);
  }
}

// 執行函數
fetchAndSaveExhibitions();
