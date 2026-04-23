# 帳號登入、偏好標籤、收藏、展覽詳情頁 — 交接文件

本文件記錄本次新增的使用者系統與相關頁面改動，方便後續接手的同事在不重讀整份原始碼的情況下，快速理解：

1. 後端資料表與 API 介面
2. 前端狀態流與路由
3. 部署時的環境變數與資料庫選項
4. 後續想擴充的點（Google 登入、個人資料、推薦演算法利用偏好標籤）

---

## 1. 後端

### 1.1 新增檔案

- `backend/adk_agent/auth_service.py`
  - 所有 auth 相關的 SQLAlchemy 模型、Pydantic schema、JWT 工具、依賴注入
  - 也定義 `PREFERENCE_OPTIONS`（註冊可選的偏好標籤清單）

### 1.2 修改檔案

- `backend/adk_agent/api_proxy_server.py` — 掛上 `/api/auth/*` 與 `/api/favorites/*` 路由
- `backend/adk_agent/requirements.txt` — 新增 `sqlalchemy`、`passlib[bcrypt]`、`python-jose[cryptography]`

### 1.3 資料表

SQLite 預設建立在 `data/exhibeat_auth.db`；使用者可透過 `AUTH_DATABASE_URL` 改用其他資料庫（Postgres / MySQL）。

#### `users`

| 欄位 | 型別 | 備註 |
| --- | --- | --- |
| `id` | `String(36)` PK | UUID4 |
| `email` | `String(255)` UNIQUE | 儲存時會 lower-case + trim |
| `password_hash` | `String(255)` | bcrypt |
| `display_name` | `String(120)` | |
| `is_active` | `Boolean` | 預留，目前只會檢查 |
| `preference_tags` | `Text` | JSON 字串，例如 `["art","digital"]` |
| `google_sub` | `String(255)` nullable UNIQUE | 未來綁定用 |
| `google_email` | `String(255)` nullable | 未來綁定用 |
| `created_at` / `updated_at` | `DateTime` | |

#### `favorites`

| 欄位 | 型別 | 備註 |
| --- | --- | --- |
| `id` | `Integer` PK autoincrement | |
| `user_id` | `String(36)` FK → `users.id` (CASCADE) | |
| `exhibition_id` | `String(128)` | 後端推薦回傳的 `uid` |
| `payload` | `Text` | 展覽 snapshot JSON（前端卡片會用到的欄位） |
| `created_at` | `DateTime` | |
| UNIQUE | `(user_id, exhibition_id)` | 避免重複收藏 |

> 選擇把 `payload` 存整包 JSON 的原因：推薦結果會隨時間改變，若只存 `exhibition_id`，之後該展覽可能從推薦清單裡消失，使用者就看不到自己的收藏。存 snapshot 可以保底顯示，日後仍可另外寫 Job 更新。

### 1.4 API

所有需要登入的 API 都用 `Authorization: Bearer <access_token>`。

| 方法 | 路徑 | 用途 | 需要登入 |
| --- | --- | --- | --- |
| GET | `/api/auth/preference-options` | 回傳可選偏好標籤（id / label / emoji） | ❌ |
| POST | `/api/auth/register` | body: `email`, `password`, `display_name`, `preference_tags` | ❌ |
| POST | `/api/auth/login` | body: `email`, `password` | ❌ |
| GET | `/api/auth/me` | 取得目前使用者（含 preference_tags） | ✅ |
| PATCH | `/api/auth/me/preferences` | body: `preference_tags[]`，覆蓋更新 | ✅ |
| GET | `/api/favorites` | 回傳使用者收藏（含 snapshot） | ✅ |
| POST | `/api/favorites` | body: `exhibition_id`, `payload`（物件） | ✅ |
| DELETE | `/api/favorites/{exhibition_id}` | 204 no content | ✅ |

### 1.5 環境變數

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `AUTH_DATABASE_URL` | `sqlite:///<repo>/data/exhibeat_auth.db` | SQLAlchemy 連線字串 |
| `AUTH_JWT_SECRET` | `replace-this-in-production` | **正式環境請務必改掉** |
| `AUTH_JWT_EXPIRE_MINUTES` | `60` | JWT 有效期（分鐘） |

### 1.6 偏好標籤清單

於 `auth_service.PREFERENCE_OPTIONS` 定義，目前包含：

```
art / photogenic / digital / history / culture / indigenous /
music / performance / family / free / night / outdoor
```

推薦器未來可直接讀 `User.preference_tags` 當成冷啟動線索（例：對應到 `recommendation_core` 的 tag 向量）。

---

## 2. 前端

### 2.1 新增檔案

- `frontend/src/lib/auth.tsx` — `AuthProvider` + `useAuth()` hook
- `frontend/src/pages/Login.tsx` — 登入頁
- `frontend/src/pages/Register.tsx` — 註冊頁（含偏好標籤選擇）
- `frontend/src/pages/ExhibitionDetail.tsx` — 展覽詳情頁

### 2.2 改動重點

- `frontend/src/lib/api.ts`
  - 新增 `register / login / fetchMe / updatePreferences`
  - 新增 `listRemoteFavorites / addRemoteFavorite / deleteRemoteFavorite`
  - 新增 `getAuthToken / setAuthToken` 工具，所有需要登入的呼叫都自動帶上 `Authorization`
- `frontend/src/lib/favorites.ts`
  - 改為統一進入點：登入時同步到後端、同時鏡像到 localStorage 做 UI 快取；未登入時只寫 localStorage
  - `toggleFavorite` 與 `refreshFavoritesCache` 會在登入／登出時觸發
- `frontend/src/components/ExhibitionCard.tsx`
  - 未登入：收藏按鈕改為鎖頭 icon，按下直接導向 `/login`
  - 卡片主體、標題與按鈕改成 `<Link>`，直接導向 `/exhibition/:id`（以 `state.exhibition` 傳遞當前資料，避免詳情頁再重 fetch）
- `frontend/src/components/layout/Navbar.tsx`
  - 未登入：顯示「登入」與「註冊」按鈕
  - 登入：頭像下拉選單，含使用者名稱、email、偏好標籤預覽、我的收藏、登出
- `frontend/src/pages/Collection.tsx`
  - 未登入時顯示鎖頭 + 引導登入／註冊的說明卡
  - 推薦側欄照常顯示
- `frontend/src/App.tsx`：新增 `/login`、`/register`、`/exhibition/:id`
- `frontend/src/main.tsx`：用 `AuthProvider` 包住 `<App />`

### 2.3 登入狀態流

```
AuthProvider mount
 └─ localStorage 有 token？
    ├─ 無 → status = unauthenticated
    └─ 有 → fetch /api/auth/me
        ├─ 成功 → status = authenticated, user = …, 同步遠端收藏
        └─ 失敗 → 清 token，status = unauthenticated
```

`refreshFavoritesCache(authenticated)` 會在登入／登出時被呼叫：

- 登入：拉一次 `/api/favorites`，轉成 `Exhibition[]` 寫進 localStorage 鏡像
- 登出：不再拉資料，只 dispatch 事件讓畫面更新

### 2.4 路由與守衛

- 整站不強制登入；只有「收藏相關」操作需要。
- 未登入時按下收藏心形會導向 `/login` 並保留來源路徑，登入後自動跳回。
- `/collection` 頁面不會 redirect，而是顯示登入提示。

### 2.5 展覽詳情頁 `/exhibition/:id`

- 優先使用路由 `state.exhibition`（從列表卡片點進來時自動帶）
- 否則先查 localStorage 收藏
- 最後才 fallback 去打 `/api/recommendations/home` 搜尋 id
- 內容：Hero、AI 摘要、展覽資訊、票價區塊、收藏按鈕、分享、「在地圖上查看」連結
- 保留預留按鈕「立即預訂」（目前 disabled，待整合第三方購票後啟用）

---

## 3. 部署建議

- 本地／Docker：預設 SQLite 即可，資料庫檔會落在 `data/exhibeat_auth.db`
- Vercel／Cloud Run 等無持久磁碟的環境：
  - 請改用雲端 Postgres，例如 **Neon**、**Supabase**、**Railway**、**PlanetScale (MySQL)** 等
  - 於平台設定環境變數 `AUTH_DATABASE_URL`、`AUTH_JWT_SECRET`
  - SQLAlchemy 連線字串範例：`postgresql+psycopg://USER:PASSWORD@HOST/DBNAME?sslmode=require`

---

## 4. 後續 TODO（可按優先序做）

1. **Google 登入**
   - 前端：整合 Google Identity Services，拿到 `id_token` 後呼叫新增的 `/api/auth/google`
   - 後端：驗證 `id_token` → 用 `google_sub` 找 user；沒有就建立，順便自動帶 `display_name` 與 `google_email`
2. **個人資料頁**（Navbar 下拉選單已保留入口）
   - 顯示／編輯 display_name、偏好標籤
3. **忘記密碼／重設**
4. **把偏好標籤餵進推薦器**
   - 目前 `persona_map` 是寫死的，可改成：登入使用者優先用 `preference_tags` 對應 `recommendation_core` 的 tag 權重
5. **後端寫一個 migration 工具**
   - 現在靠 `Base.metadata.create_all`，欄位變動時舊 DB 不會自動升級。若上線 Postgres 建議改成 Alembic。
