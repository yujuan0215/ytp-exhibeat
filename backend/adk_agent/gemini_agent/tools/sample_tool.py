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
        weekday_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        days_until_sunday = (6 - now.weekday()) % 7
        upcoming_sunday = now.date() + datetime.timedelta(days=days_until_sunday)
        tomorrow = now.date() + datetime.timedelta(days=1)
        return (
            f"{now.strftime('%Y-%m-%d %H:%M:%S')} "
            f"({weekday_names[now.weekday()]}, timezone={timezone}); "
            f"tomorrow={tomorrow.isoformat()}; "
            f"this/upcoming Sunday={upcoming_sunday.isoformat()}"
        )
    except Exception as e:
        return f"錯誤: 無法辨識時區 '{timezone}'。詳細資訊: {str(e)}"
