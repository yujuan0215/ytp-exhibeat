# 🚀 Workshop 實作手冊：在 YTP-ExhiBeat 中啟動 Google ADK Agent

本手冊將帶你一步一步完成 Agent 的開發與部署，預計耗時 **60–90 分鐘**。

---

## 前置條件

- Python 3.11 以上
- Google Cloud 帳號（已建立專案並開啟帳單）
- 已安裝 [Google Cloud CLI (`gcloud`)](https://cloud.google.com/sdk/docs/install)
- 已安裝 Git

---

## Step 1：建立虛擬環境並安裝套件

```bash
# Clone 專案（若尚未 clone）
git clone https://github.com/yujuan0215/ytp-exhibeat.git
cd ytp-exhibeat/backend/adk_agent

# 建立 Python 虛擬環境
make venv

# 啟動虛擬環境
source .venv/bin/activate

# 安裝所需套件
make install
```

> 若想一步完成（建立虛擬環境 + 安裝套件 + 初始化 `.env` 範本），可改用：
> ```bash
> make setup
> source .venv/bin/activate
> ```

---

## Step 2：本專案使用的 Agent 類型

這個 backend 模組目前只保留一套實際使用中的 Agent：

| Agent 類型 | 資料夾 | 適用情境 |
| :--- | :--- | :--- |
| **Gemini Agent** ⭐ | `gemini_agent/` | 使用 Google Gemini 模型（Vertex AI），提供 ExhiBeat 展演查詢、附近搜尋、天氣與行程規劃 |

> 本模組所有後續步驟都以 **`gemini_agent/`** 為主。

---

## Step 3：填寫 `.env` 環境設定

編輯 `gemini_agent/.env`，填入你的 Google Cloud 資訊：

```bash
# 用任意編輯器開啟
code gemini_agent/.env
```

填寫以下欄位：

```dotenv
# Vertex AI Configuration
GOOGLE_GENAI_USE_VERTEXAI=1
GOOGLE_CLOUD_PROJECT=your-project-id       # ← 改成你的 GCP 專案 ID
GOOGLE_CLOUD_LOCATION=us-central1

# Gemini Model Name
GEMINI_MODEL=gemini-2.5-flash

# TDX Transport Data (optional, for nearby transit lookup and MaaS routing)
TDX_CLIENT_ID=your-client-id
TDX_CLIENT_SECRET=your-client-secret
```

確認 gcloud 已登入並設定好預設專案：

```bash
make auth PROJECT=your-project-id
```

> `make auth` 目前會執行：`gcloud auth login --update-adc` 與 `gcloud config set project`。
> 這代表同一次登入流程會同時更新 gcloud 帳號憑證與 Application Default Credentials (ADC)。

登入完成後，啟用部署所需的 Google Cloud API：

```bash
make enable-apis
```

> API 啟用後可能需要 1–2 分鐘生效，可以先繼續後續步驟。

---

## Step 4：啟動 ADK Web 介面（第一次測試）

```bash
make run
```

啟動後，在瀏覽器開啟：`http://localhost:8000`

你應該能看到 ADK 的對話介面，並與預設的 Agent 互動（預設內建 `get_current_time` 工具）。

> 確認可以正常對話後，按 `Ctrl+C` 停止伺服器，繼續下一步。

---

## Step 5：自訂 Agent 行為與工具 (Tools)

### 5-1. 修改 Agent 的角色指令

編輯 `gemini_agent/instruction/system.md`，定義你的 Agent 角色與能力：

```markdown
# Role
你是一個專業的 XX 助手。（← 改成你的 Agent 角色）

# Capabilities
你可以使用以下工具協助用戶：
- 說明你新增的工具用途，讓 Agent 知道何時該用它
```

> `system.md` 決定了 Agent 的「性格與行為準則」，工具與指令要相互配合，Agent 才會在對的時機呼叫工具。

### 5-2. 在 `tools/` 資料夾新增工具函式

建立新檔案，例如 `gemini_agent/tools/my_tool.py`：

```python
def my_custom_tool(input: str) -> str:
    """
    這裡寫工具的說明。ADK 會根據這段 Docstring 決定何時呼叫此工具。

    Args:
        input: 使用者傳入的文字。

    Returns:
        str: 工具處理後回傳的結果。
    """
    # 在這裡實作你的邏輯
    return f"你輸入了：{input}"
```

> **Docstring 非常重要**，它決定了 Agent 何時、為何要呼叫這個工具。

### 5-3. 在 `agent.py` 中匯入並註冊工具

編輯 `gemini_agent/agent.py`，加入兩行：

```python
# 匯入你的新工具
from .tools.my_tool import my_custom_tool

# 加入 tools 清單
root_agent = Agent(
    ...
    tools=[get_current_time, my_custom_tool]   # ← 加在這裡
)
```

---

## Step 6：重新啟動並測試新工具

```bash
make run
```

回到瀏覽器 `http://localhost:8000`，輸入對話測試你的新工具是否正常被呼叫。

> 確認沒問題後，按 `Ctrl+C` 停止伺服器，準備部署。

---

## Step 7：部署到 Google Cloud Run

### 7-1. 執行部署

```bash
make deploy PROJECT=your-project-id
```

> `make deploy` 使用 `adk deploy cloud_run` 指令，會自動打包並部署至 Cloud Run（含 Web UI）。
> `PROJECT` 請替換成你的 GCP 專案 ID。
> 目前預設的服務名稱與區域來自 `Makefile`：
> - `IMAGE_NAME = ytp-exhibeat-adk-agent`
> - `REGION = us-central1`

### 7-2. 部署完成

部署完成後，終端機會輸出類似以下的 Service URL：

```
Service URL: https://ytp-exhibeat-adk-agent-xxxxxx-uc.a.run.app
```

在瀏覽器開啟該網址，即可從公開網路存取你的 Agent。

若後續想調整 Cloud Run 的服務名稱或部署區域，可直接修改 `Makefile` 內的 `IMAGE_NAME` 與 `REGION`。

### 7-3. （選用）刪除 Cloud Run 服務

Workshop 結束後，若不再需要該服務，可執行以下指令刪除，避免產生額外費用：

```bash
make destroy PROJECT=your-project-id
```

---

## 常見問題

| 問題 | 解法 |
| :--- | :--- |
| `make run` 出現 `ModuleNotFoundError` | 確認已執行 `source .venv/bin/activate` |
| Agent 無法回應，顯示認證錯誤 | 確認 `.env` 的 `GOOGLE_CLOUD_PROJECT` 正確，且已執行 `gcloud auth application-default login` |
| 工具沒有被 Agent 呼叫 | 確認 Docstring 描述清楚，且已在 `agent.py` 的 `tools=[]` 中註冊 |
| Cloud Run 部署失敗（權限不足） | 確認帳號具有 `Cloud Run Admin` 與 `Cloud Build Editor` 角色 |
| 部署後網頁打不開 | 確認部署時有加 `--with_ui` 旗標（`make deploy` 已預設包含） |
