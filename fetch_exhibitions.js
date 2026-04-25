const fs = require('fs');

const API_URL = 'https://cloud.culture.tw/frontsite/trans/SearchShowAction.do';
const OUTPUT_FILE = process.argv[2] || 'exhibitions.json';

const CATEGORY_CODE_TO_LABEL = {
  '1': '音樂',
  '2': '戲劇',
  '3': '舞蹈',
  '4': '親子',
  '5': '獨立音樂',
  '6': '展覽',
  '7': '講座',
  '8': '電影',
  '11': '綜藝',
  '13': '競賽',
  '14': '徵選',
  '15': '其他',
  '17': '演唱會',
  '19': '研習課程',
  '200': '閱讀',
};

function buildApiUrl(categoryCode) {
  const url = new URL(API_URL);
  url.searchParams.set('method', 'doFindTypeJ');
  url.searchParams.set('category', categoryCode);
  return url.toString();
}

function eventKey(event, categoryCode, index) {
  if (event.UID) return `uid:${event.UID}`;
  const showInfo = Array.isArray(event.showInfo) ? event.showInfo[0] || {} : {};
  return [
    'fallback',
    categoryCode,
    event.title || '',
    event.startDate || '',
    showInfo.locationName || showInfo.location || '',
    index,
  ].join('|');
}

async function fetchCategory(categoryCode) {
  const label = CATEGORY_CODE_TO_LABEL[categoryCode] || categoryCode;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(buildApiUrl(categoryCode));

      if (!response.ok) {
        throw new Error(`HTTP 錯誤! 類別 ${categoryCode} ${label} 狀態碼: ${response.status}`);
      }

      const text = await response.text();
      if (!text.trim()) {
        console.log(`類別 ${label} (${categoryCode}) 回傳空資料，視為 0 筆`);
        return [];
      }

      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        throw new Error(`類別 ${categoryCode} ${label} 回傳格式不是陣列`);
      }

      console.log(`成功取得 ${label} (${categoryCode})：${data.length} 筆`);
      return data.map((event) => ({
        ...event,
        category: String(event.category || categoryCode),
        categoryLabel: event.categoryLabel || label,
      }));
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        console.log(`類別 ${label} (${categoryCode}) 第 ${attempt} 次取得失敗，準備重試：${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }

  throw lastError;
}

async function fetchAndSaveExhibitions() {
  console.log('開始取得文化部全部藝文活動資料...');
  try {
    const categoryCodes = Object.keys(CATEGORY_CODE_TO_LABEL);
    const merged = [];
    const seen = new Set();
    const failures = [];

    for (const categoryCode of categoryCodes) {
      try {
        const events = await fetchCategory(categoryCode);
        events.forEach((event, index) => {
          const key = eventKey(event, categoryCode, index);
          if (seen.has(key)) return;
          seen.add(key);
          merged.push(event);
        });
      } catch (error) {
        failures.push({ categoryCode, message: error.message });
        console.error(`取得類別 ${categoryCode} 失敗：`, error.message);
      }
    }

    if (!merged.length) {
      throw new Error('沒有成功取得任何文化部活動資料');
    }

    merged.sort((a, b) => {
      const dateCompare = String(a.startDate || '').localeCompare(String(b.startDate || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant');
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2), 'utf-8');
    
    console.log(`資料已成功儲存至 ${OUTPUT_FILE}`);
    console.log(`共寫入 ${merged.length} 筆活動，涵蓋 ${categoryCodes.length - failures.length}/${categoryCodes.length} 個類別。`);
    if (failures.length) {
      console.log('以下類別取得失敗，請稍後重跑：');
      failures.forEach((failure) => console.log(`- ${failure.categoryCode}: ${failure.message}`));
    }

  } catch (error) {
    console.error('取得資料時發生錯誤：', error);
    process.exitCode = 1;
  }
}

// 執行函數
fetchAndSaveExhibitions();
