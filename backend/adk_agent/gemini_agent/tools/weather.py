from __future__ import annotations

from typing import Any

import requests


GEOCODING_API_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_API_URL = "https://api.open-meteo.com/v1/forecast"
REQUEST_TIMEOUT_SECONDS = 10

WEATHER_CODE_LABELS = {
    0: "晴朗",
    1: "大致晴朗",
    2: "局部多雲",
    3: "陰天",
    45: "有霧",
    48: "霧凇",
    51: "毛毛雨",
    53: "中度毛毛雨",
    55: "強毛毛雨",
    56: "凍毛毛雨",
    57: "強凍毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    66: "凍雨",
    67: "強凍雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    77: "雪粒",
    80: "陣雨",
    81: "強陣雨",
    82: "暴雨陣雨",
    85: "陣雪",
    86: "強陣雪",
    95: "雷雨",
    96: "雷雨夾小冰雹",
    99: "雷雨夾大冰雹",
}


def _fetch_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    response = requests.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json()


def _resolve_city(city: str) -> dict[str, Any]:
    data = _fetch_json(
        GEOCODING_API_URL,
        {
            "name": city,
            "count": 1,
            "language": "zh",
            "format": "json",
        },
    )
    results = data.get("results") or []
    if not results:
        raise ValueError(f"找不到城市 `{city}`，請改用更完整的名稱，例如 `Taipei` 或 `Taipei City`。")
    return results[0]


def _format_location(result: dict[str, Any]) -> str:
    parts = [
        result.get("name"),
        result.get("admin1"),
        result.get("country"),
    ]
    return ", ".join(part for part in parts if part)


def get_weather(city: str) -> str:
    """
    查詢指定城市的目前天氣。

    這個工具會先透過 Open-Meteo Geocoding API 將城市名稱轉成座標，
    再查詢 Open-Meteo Weather Forecast API 的 current weather 資料。

    Args:
        city: 使用者想查詢的城市名稱，例如 "Taipei"、"Tokyo"。

    Returns:
        str: 整理後的目前天氣資訊。
    """
    try:
        location = _resolve_city(city)
        weather = _fetch_json(
            FORECAST_API_URL,
            {
                "latitude": location["latitude"],
                "longitude": location["longitude"],
                "current": ",".join(
                    [
                        "temperature_2m",
                        "apparent_temperature",
                        "relative_humidity_2m",
                        "weather_code",
                        "wind_speed_10m",
                        "wind_direction_10m",
                    ]
                ),
                "timezone": "auto",
            },
        )
    except requests.RequestException as exc:
        return f"查詢天氣失敗：無法連線到天氣服務。詳細資訊：{exc}"
    except ValueError as exc:
        return str(exc)
    except Exception as exc:
        return f"查詢天氣失敗：{exc}"

    current = weather.get("current")
    if not current:
        return f"查詢天氣失敗：`{city}` 沒有可用的即時天氣資料。"

    units = weather.get("current_units", {})
    weather_code = current.get("weather_code")
    condition = WEATHER_CODE_LABELS.get(weather_code, f"未知天氣代碼 {weather_code}")
    location_name = _format_location(location)
    observed_time = current.get("time", "未知時間")

    return (
        f"{location_name} 目前天氣：{condition}。\n"
        f"觀測時間：{observed_time}\n"
        f"氣溫：{current.get('temperature_2m')} {units.get('temperature_2m', '°C')}\n"
        f"體感溫度：{current.get('apparent_temperature')} {units.get('apparent_temperature', '°C')}\n"
        f"相對濕度：{current.get('relative_humidity_2m')} {units.get('relative_humidity_2m', '%')}\n"
        f"風速：{current.get('wind_speed_10m')} {units.get('wind_speed_10m', 'km/h')}\n"
        f"風向：{current.get('wind_direction_10m')} {units.get('wind_direction_10m', '°')}\n"
        f"資料來源：Open-Meteo"
    )
