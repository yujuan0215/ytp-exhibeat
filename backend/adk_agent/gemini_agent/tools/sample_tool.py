import datetime
from zoneinfo import ZoneInfo

def get_current_time(timezone: str = "UTC") -> str:
    """
    獲取指定時區的當前系統時間。
    
    Args:
        timezone: 時區名稱 (例如: "Asia/Taipei", "UTC", "America/New_York")。
        
    Returns:
        str: 格式化後的指定時區時間字串 (YYYY-MM-DD HH:MM:SS)。
    """
    try:
        tz = ZoneInfo(timezone)
        now = datetime.datetime.now(tz)
        return now.strftime("%Y-%m-%d %H:%M:%S")
    except Exception as e:
        return f"錯誤: 無法辨識時區 '{timezone}'。詳細資訊: {str(e)}"
