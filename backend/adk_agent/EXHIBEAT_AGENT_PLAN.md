# ExhiBeat AI Agent 規劃

## 1. Agent 定位

ExhiBeat 的 AI Agent 不應只是聊天視窗，而應該是「台北展演探索與行程規劃助理」。

它的核心任務有四個：

1. 幫使用者用自然語言找到合適的展演活動。
2. 根據時間、地點、天氣、預算、偏好做個人化推薦。
3. 自動規劃半日或一日展演路線。
4. 將結果同步到地圖、收藏清單與推薦頁面，形成跨頁操作體驗。

這樣的定位最符合「賽題 A - 行旅台北」，因為它不只是資訊查詢，而是直接幫使用者完成台北展演探索與出行決策。

## 2. 使用者需求

這個 Agent 最適合解決的使用者情境如下：

- 我今天在中山站附近，想找兩個晚上可以去的免費展演。
- 今天天氣不好，幫我推薦室內、雨天備案、適合朋友一起去的活動。
- 我明天下午有 4 小時，幫我排一條文青一點的展演散步路線。
- 我不想看太商業的活動，想找獨立策展或小型藝文空間。
- 我已經收藏了幾個展，幫我整理成一條順路的地圖行程。
- 幫我快速看懂這個展值不值得去，有沒有重點評論與適合族群。

## 3. MVP 範圍

Hackathon 版本不要做過大。最合理的 MVP 是一個單一 Agent，加上一組清楚的工具。

MVP 必做功能：

- 自然語言搜尋展演活動
- 根據天氣、地點、時間做情境式推薦
- 生成半日或一日行程建議
- 將推薦結果同步到地圖
- 將活動加入收藏或願望清單

MVP 可延後功能：

- 長期個人化學習
- 社群評論自動摘要
- 展演介紹自動改寫
- 多代理協作
- 自動抓取大量社群內容

## 4. Agent 核心能力

建議把 Agent 能力定義成以下六種：

### 4.1 條件理解

Agent 要能從自然語言中抓出：

- 時間條件
- 地點條件
- 展演類型
- 預算限制
- 使用情境
- 同行對象
- 偏好風格

例如使用者說：

`今天晚上想找捷運可到、免費、不會太吵的展覽`

Agent 應自動抽成：

- 時間：今天晚上
- 交通：捷運可達
- 價格：免費
- 類型：展覽
- 情境：安靜

### 4.2 推薦生成

Agent 需能綜合：

- 活動時間與距離
- 活動標籤
- 熱門度與評分
- 天氣條件
- 使用者收藏與偏好
- 室內外屬性

輸出一組合理候選活動，而不是只做關鍵字 match。

### 4.3 行程編排

Agent 要能把多個活動排序並生成簡單理由，例如：

- 先去 A 展覽，因為距離最近且室內
- 再去 B 表演，因為時間剛好銜接
- 中途安排 C 用餐點或休息點

### 4.4 多輪修正

使用者說：

- 太遠了
- 我不想花錢
- 換成適合情侶
- 不要表演，只看展覽

Agent 要能根據前文保留上下文並重新規劃。

### 4.5 跨頁操作

Agent 的價值在於可以操作平台功能，而不是只回答文字。

它至少要能：

- 把推薦結果標到地圖上
- 幫使用者加入收藏
- 產生一份今日行程清單
- 將選中活動回寫至前端 UI 狀態

### 4.6 解釋推薦理由

每次推薦最好都能說明原因，例如：

- 因為今天下雨，所以優先推薦室內展演
- 你偏好免費展覽，因此把票價活動降權
- 你目前在信義區，所以先推薦捷運 20 分鐘內可達的活動

這會讓評審明確感受到 AI 不是亂推薦。

## 5. 推薦的 Agent 角色

建議只做一個主 Agent：

- `ExhiBeat Planner Agent`

它不是單純問答機器人，而是具備工具操作能力的任務型代理。

未來如果要擴充，再拆成：

- `Discovery Agent`：負責找活動與摘要
- `Planner Agent`：負責排路線與調整方案
- `Social Insight Agent`：負責整理評論與社群熱度

但 hackathon 階段不建議一開始就拆多代理，因為展示成本高、除錯也更麻煩。

## 6. Tools 設計

以下是最適合這個專案的工具清單。

### 6.1 `search_events`

用途：
根據關鍵字、日期、地區、類型、價格篩選活動。

輸入：

- `query`
- `date`
- `district`
- `category`
- `price_type`
- `indoor_only`

輸出：

- 活動清單
- 每筆活動的基本資訊

### 6.2 `get_event_detail`

用途：
取得單一展演活動的完整資訊。

輸出建議包含：

- 活動名稱
- 主辦單位
- 活動時間
- 地點
- 是否售票
- 票價
- 標籤
- 簡介
- 評分
- 留言摘要

### 6.3 `get_weather`

用途：
查詢目前天氣，讓 Agent 能做雨天備案或戶外降權。

目前專案中已經有這個工具，可直接延伸使用。

### 6.4 `get_nearby_events`

用途：
根據某個活動或地理座標，找附近可串接的活動。

輸入：

- `latitude`
- `longitude`
- `radius_km`
- `time_window`

### 6.5 `plan_itinerary`

用途：
將候選活動依照時間、距離、偏好、天氣排成行程。

輸入：

- `events`
- `start_time`
- `end_time`
- `user_preferences`
- `transport_mode`

輸出：

- 排序後的活動
- 每段理由
- 總預估時長

### 6.6 `save_to_favorites`

用途：
把活動加入收藏或願望清單。

輸入：

- `user_id`
- `event_id`

### 6.7 `show_on_map`

用途：
把活動清單或行程結果同步到地圖分頁。

輸入：

- `event_ids`
- `route_mode`

### 6.8 `summarize_event_reviews`

用途：
整理評論與留言重點，產生一句到三句摘要。

這個功能有亮點，但可以排在 MVP 後半段。

## 7. 推薦後端 API 設計

如果前後端分離，建議後端至少有這些 API。

### 7.1 活動查詢

- `GET /api/events`
- `GET /api/events/:id`
- `GET /api/events/nearby`

### 7.2 收藏與標籤

- `POST /api/favorites`
- `DELETE /api/favorites/:eventId`
- `POST /api/tags`

### 7.3 評論與互動

- `GET /api/events/:id/comments`
- `POST /api/events/:id/comments`
- `POST /api/events/:id/rating`

### 7.4 Agent 專用

- `POST /api/agent/chat`
- `POST /api/agent/plan`
- `POST /api/agent/map-sync`

`/api/agent/chat` 建議輸入格式：

```json
{
  "message": "今天晚上在中山站附近有什麼免費展覽？",
  "user_id": "u123",
  "context": {
    "location": "中山站",
    "weather_enabled": true,
    "favorite_tags": ["免費", "展覽", "雨天備案"]
  }
}
```

`/api/agent/chat` 建議輸出格式：

```json
{
  "reply": "我幫你挑了 3 個今晚在中山站附近、免費且適合雨天的展覽。",
  "recommended_events": ["evt_001", "evt_018", "evt_020"],
  "actions": [
    {
      "type": "show_on_map",
      "event_ids": ["evt_001", "evt_018", "evt_020"]
    }
  ]
}
```

這樣前端可以根據 `actions` 做地圖同步，而不是只顯示一段文字。

## 8. 推薦資料模型

後端資料不需要一開始就很複雜，但至少要有以下實體：

### 8.1 Event

- `id`
- `title`
- `category`
- `description`
- `start_time`
- `end_time`
- `venue_name`
- `district`
- `latitude`
- `longitude`
- `price_type`
- `price`
- `indoor`
- `source`
- `tags`
- `rating_avg`
- `popularity_score`

### 8.2 User

- `id`
- `name`
- `preferred_categories`
- `favorite_tags`
- `saved_events`
- `visited_events`

### 8.3 Comment

- `id`
- `event_id`
- `user_id`
- `rating`
- `content`
- `images`
- `created_at`

### 8.4 Context Data

- `weather`
- `district_flow`
- `transport_accessibility`

## 9. 推薦演算法邏輯

Hackathon 不需要做非常重的機器學習模型，用可解釋的 scoring model 反而更適合 demo。

建議分數可由以下因子組成：

- 使用者偏好相符度
- 距離與交通便利性
- 時間可行性
- 天氣適配度
- 活動熱門度
- 社群評價
- 室內外情境相符度

可用簡化公式表達：

`score = preference + distance + weather + popularity + schedule_fit + social_feedback`

評審通常會更買單這種可說明的推薦機制。

## 10. Demo Flow

最適合上台展示的 demo 建議是這條：

### Demo 1：雨天臨時找展

使用者輸入：

`今天下雨，我現在在中山站附近，想找 2 個免費、室內、適合一個人去的展覽。`

Agent 動作：

1. 讀取使用者條件
2. 查詢天氣
3. 搜尋附近活動
4. 篩出免費、室內、展覽類型
5. 回傳 2 到 3 個活動
6. 同步標到地圖

展示亮點：

- 自然語言搜尋
- 天氣感知
- 地圖同步

### Demo 2：半日行程規劃

使用者輸入：

`我明天下午兩點到晚上八點想安排一條文藝路線，包含展覽和表演，預算 500 元內。`

Agent 動作：

1. 找出符合條件的活動
2. 計算時間銜接與距離
3. 生成一條路線
4. 將結果顯示在地圖與清單
5. 提供每段推薦理由

展示亮點：

- 不是單一推薦，而是完整排程
- 能同時整合時間、地點、價格

### Demo 3：多輪修正

使用者繼續說：

`不要表演，改成適合情侶，然後不要離大安區太遠。`

Agent 動作：

1. 保留前文上下文
2. 重新計算條件
3. 輸出新行程

展示亮點：

- 多輪對話
- 上下文記憶
- 即時調整方案

## 11. 與 ADK 架構的對應

這個專案可以直接對應你們現在的 ADK template。

建議落位如下：

- `gemini_agent/instruction/system.md`
  - 定義 Agent 的角色與推薦原則

- `gemini_agent/tools/`
  - 每個資料查詢或平台操作能力做成一個 tool

- `gemini_agent/agent.py`
  - 註冊工具

- `backend API`
  - 由 tools 去呼叫資料庫或服務

一個合理的第一版 tools 組合是：

- `get_current_time`
- `get_weather`
- `search_events`
- `get_event_detail`
- `plan_itinerary`
- `save_to_favorites`
- `show_on_map`

## 12. 建議的實作順序

請不要一開始什麼都做。照下面順序最穩：

### Phase 1

- 完成活動資料結構
- 做 `search_events`
- 做 `get_event_detail`
- 做 `get_weather`

### Phase 2

- 做 `plan_itinerary`
- 做 `show_on_map`
- 完成聊天頁與地圖頁連動

### Phase 3

- 做 `save_to_favorites`
- 做多輪調整
- 做評論摘要與推薦理由優化

## 13. 提案書可直接使用的描述

如果要把 AI Agent 段落改寫得更聚焦，可以直接用下面這段：

> 本專案之 AI Agent 並非僅提供一般性對話服務，而是作為「台北展演探索與行程規劃助理」存在。其可根據使用者以自然語言輸入之需求，結合活動資料、天氣、地理位置、時間條件與個人偏好，完成展演活動搜尋、推薦、摘要整理與半日或一日行程規劃。Agent 並可將最終推薦結果同步至地圖介面與收藏清單，形成可操作、可視覺化、可持續調整之使用流程，藉此提升平台在資訊整合、探索效率與互動體驗上的整體價值。

## 14. 最後建議

這個專案最值得主打的 AI 點，不是「我們有用 LLM」，而是：

- Agent 能理解模糊需求
- Agent 能整合城市情境資料
- Agent 能把推薦結果轉成實際行程
- Agent 能跨頁操作地圖與收藏功能

一句話版本：

ExhiBeat 的 AI Agent 是一個能「理解需求、推薦活動、規劃路線、同步地圖」的台北展演探索助理。
