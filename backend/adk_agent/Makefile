.PHONY: venv install setup init-env auth enable-apis run clean docker-build docker-run deploy destroy

# 專案設定
IMAGE_NAME = ytp-exhibeat-adk-agent
PORT = 8000
REGION = us-central1
GCLOUD ?= /opt/homebrew/bin/gcloud

# 建立虛擬環境
venv:
	python3 -m venv .venv
	@echo "虛擬環境已建立。請執行 'source .venv/bin/activate' 來啟動它。"

# 安裝依賴套件
install:
	pip install -r requirements.txt

# 初始化環境變數 (.env)
init-env:
	@if [ ! -f gemini_agent/.env ]; then \
		cp gemini_agent/.env.template gemini_agent/.env; \
		echo "已建立 gemini_agent/.env"; \
	fi

# 一鍵初始化環境 (建立虛擬環境、安裝套件並初始化 .env)
setup: venv init-env
	. .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
	@echo "初始化完成。現在您可以執行 'make run' 啟動 Agent。"

# Google Cloud 登入與專案設定
auth:
	@if [ -z "$(PROJECT)" ]; then \
		echo "請指定 GCP 專案 ID，例如：make auth PROJECT=your-project-id"; \
		exit 1; \
	fi
	$(GCLOUD) auth login --update-adc
	$(GCLOUD) config set project $(PROJECT)

# 啟用 Google Cloud Run 部署所需的 API
enable-apis:
	$(GCLOUD) services enable run.googleapis.com \
		cloudbuild.googleapis.com \
		artifactregistry.googleapis.com \
		aiplatform.googleapis.com

# 啟動 Agent
run:
	adk web --host 0.0.0.0 --port 8000 --allow_origins "*"

# Docker 相關指令
docker-build: init-env
	docker build -t $(IMAGE_NAME) .

docker-run:
	docker run -p $(PORT):$(PORT) --env-file gemini_agent/.env $(IMAGE_NAME)

# 部署 Gemini Agent 至 Google Cloud Run
deploy:
	@if [ -z "$(PROJECT)" ]; then \
		echo "請指定 GCP 專案 ID，例如：make deploy PROJECT=your-project-id"; \
		exit 1; \
	fi
	adk deploy cloud_run \
		--project=$(PROJECT) \
		--region=$(REGION) \
		--service_name=$(IMAGE_NAME) \
		--port=$(PORT) \
		--with_ui \
		gemini_agent

# 刪除 Google Cloud Run 服務
destroy:
	@if [ -z "$(PROJECT)" ]; then \
		echo "請指定 GCP 專案 ID，例如：make destroy PROJECT=your-project-id"; \
		exit 1; \
	fi
	$(GCLOUD) run services delete $(IMAGE_NAME) \
		--project=$(PROJECT) \
		--region=$(REGION) \
		--quiet

# 清理快取檔案
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	rm -rf .adk/
