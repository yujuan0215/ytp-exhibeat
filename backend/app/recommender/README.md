# ExhiBeat Recommender Prototype

這個資料夾是把 `LightFM` 的 hybrid recommender 思路改造成 `ExhiBeat` 可直接 demo 的版本。

重點不是直接照搬通用推薦範例，而是把它收斂成適合 hackathon 的三件事：

1. 用 `exhibitions.json` 建 item features
2. 用 persona 規則合成 synthetic interactions
3. 輸出可解釋的推薦結果，方便接首頁 feed、地圖與 Agent

## 目前包含

- `exhibeat_lightfm_demo.py`
  - 載入展覽資料
  - 從地點、描述、票價、熱門度抽 item features
  - 建立 persona 與 synthetic interactions
  - 使用 LightFM 進行 hybrid ranking
  - 將 LightFM 分數和 heuristic 分數混合，產生較穩定的 demo 排序
- `requirements.txt`
  - 這個原型所需的最小 Python 套件

## 為什麼這樣做

真實使用者還沒進來前，直接做 collaborative filtering 幾乎無法 demo。

這版原型的定位是：

- `現在`：用內容特徵與 persona 模擬，驗證推薦流程
- `之後`：把 synthetic interactions 換成真實的 `click / save / map_view / agent_query`

## 安裝

建議使用 Python `3.11` 或 `3.12` 的虛擬環境。`LightFM` 在部分環境下對 Python `3.13` 可能不穩定。

```bash
cd backend/app/recommender
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

如果你的機器沒有 `python3.11`，也可以先試目前的 `python3`，但編譯 `lightfm` 失敗時，優先改用 3.11 / 3.12。

## 執行

在 repo 根目錄執行：

```bash
python3 backend/app/recommender/exhibeat_lightfm_demo.py --top-k 5
```

預設 `--backend auto` 會在有安裝 `LightFM` 時使用 hybrid recommender，否則自動退回 heuristic fallback，確保 demo 在環境不完整時也能跑。

也可以只看特定 persona：

```bash
python3 backend/app/recommender/exhibeat_lightfm_demo.py --persona taipei_after_work --top-k 5
```

如果想模擬單次 session 偏好，而不是固定 persona，可以直接帶即時偏好：

```bash
python3 backend/app/recommender/exhibeat_lightfm_demo.py \
  --backend fallback \
  --date 2026-04-15 \
  --cities 台北市,新北市 \
  --tags art,photogenic \
  --free-only \
  --top-k 5
```

若你已經在 Python `3.11` / `3.12` 裝好 `LightFM`，可以強制使用真正的 hybrid backend：

```bash
python3 backend/app/recommender/exhibeat_lightfm_demo.py --backend lightfm --top-k 5
```

輸出 JSON：

```bash
python3 backend/app/recommender/exhibeat_lightfm_demo.py --output backend/app/recommender/sample_recommendations.json
```

## Demo 時可以怎麼講

不要講成「我們已經有大量真實用戶並訓練出個人化大模型」。

比較準確的說法是：

`我們先用展覽內容、地點、票價、熱門度建立冷啟動排序，再用 synthetic persona 驗證 hybrid recommender 架構；上線後即可改吃真實互動資料。`
