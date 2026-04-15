# 使用 Python 3.13 官方精簡版映像檔
FROM python:3.13-slim

# 設定容器內的工作目錄
WORKDIR /app

# 安裝系統層級的必要套件 (如果未來需要編譯 C 擴充套件，可以在此新增)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 複製依賴清單並安裝
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 複製專案原始碼 (配合 .dockerignore 排除不必要的檔案)
COPY . .

# 開放 ADK Web 預設連接埠 8000
EXPOSE 8000

# 設定環境變數，確保 Python 輸出即時顯示在日誌中
ENV PYTHONUNBUFFERED=1

# 啟動 Agent (預設監聽 0.0.0.0 以便容器外存取)
# 備註：啟動時可透過環境變數指定不同 Agent 入口
CMD ["adk", "web", "--host", "0.0.0.0", "--port", "8000"]
