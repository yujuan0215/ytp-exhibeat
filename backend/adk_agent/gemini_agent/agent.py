import os
from dotenv import load_dotenv
from google.adk.agents.llm_agent import Agent

# 1. 載入工具 (從 tools/ 內直接填入要使用的名稱)
from .tools.event_tools import get_event_detail
from .tools.event_tools import get_nearby_events
from .tools.event_tools import plan_itinerary
from .tools.event_tools import search_events
from .tools.event_tools import search_events_near_place
from .tools.event_tools import sync_event_catalog
from .tools.sample_tool import get_current_time
from .tools.weather import get_weather

# 2. 載入環境變數
load_dotenv()

# 3. 設定模型 (從 models/ 資料夾引入)
from .models.gemini_model import gemini_model

# 4. 載入指令 (從 instruction/ 資料夾引入)
from .instruction import system_instruction

# 5. 定義 Agent (在這裡直接填入參數)
root_agent = Agent(
    name='gemini_root_agent',
    model=gemini_model,
    instruction=system_instruction,
    description='這是一個可查詢台北藝文活動、天氣與行程規劃的 Google Gemini Agent。',
    tools=[
        get_current_time,
        get_weather,
        sync_event_catalog,
        search_events,
        search_events_near_place,
        get_event_detail,
        get_nearby_events,
        plan_itinerary,
    ]
)
