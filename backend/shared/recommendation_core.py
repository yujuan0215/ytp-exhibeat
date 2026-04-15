from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date


CITY_KEYWORDS = [
    "台北市",
    "臺北市",
    "新北市",
    "基隆市",
    "桃園市",
    "新竹市",
    "新竹縣",
    "苗栗縣",
    "台中市",
    "臺中市",
    "彰化縣",
    "南投縣",
    "雲林縣",
    "嘉義市",
    "嘉義縣",
    "台南市",
    "臺南市",
    "高雄市",
    "屏東縣",
    "宜蘭縣",
    "花蓮縣",
    "台東縣",
    "臺東縣",
    "澎湖縣",
    "金門縣",
    "連江縣",
]

TAG_KEYWORDS = {
    "history": ["歷史", "考古", "文物", "遺址", "佛塔", "典藏", "百年"],
    "science": ["自然", "科學", "生命", "科技", "宇宙", "標本"],
    "music": ["音樂", "樂器", "演奏", "聲音"],
    "indigenous": ["原住民", "原民", "排灣", "族語"],
    "art": ["藝術", "美術", "典藏", "策展", "館藏", "裝置"],
    "family": ["親子", "互動", "遊戲", "桌遊", "孩子", "兒童"],
    "photogenic": ["攝影", "拍照", "視覺", "沉浸", "奇幻"],
    "women": ["女性", "女力", "性別"],
    "culture": ["文化", "故事", "地方", "博物館"],
}

VENUE_KEYWORDS = {
    "museum": ["博物館", "科博館", "史博", "故事館"],
    "art_museum": ["美術館", "藝廊", "藝術館"],
    "cultural_center": ["文化中心", "文化園區", "傳藝中心"],
}

RAINY_CONTEXT_TOKENS = {"rain", "rainy", "下雨", "雨天", "陣雨", "大雨"}
POPULARITY_THRESHOLDS = {"high": 600, "medium": 120}


@dataclass(frozen=True)
class UserPreference:
    preferred_cities: tuple[str, ...] = ()
    preferred_tags: tuple[str, ...] = ()
    venue_focus: tuple[str, ...] = ()
    interest_tokens: tuple[str, ...] = ()
    wants_free: bool = False
    popularity_preference: str = "neutral"
    indoor_only: bool = False
    weather_context: str = ""


@dataclass(frozen=True)
class RecommendableEvent:
    uid: str
    title: str
    city: str
    location_name: str
    location: str
    start_date: date
    end_date: date
    hit_rate: int
    is_free: bool
    tags: tuple[str, ...]
    venues: tuple[str, ...]
    description: str
    looks_indoor: bool = False


def normalize_city(raw: str) -> str:
    return raw.replace("臺", "台")


def infer_city(location: str) -> str:
    normalized = normalize_city(location or "")
    for city in CITY_KEYWORDS:
        city_normalized = normalize_city(city)
        if city_normalized in normalized:
            return city_normalized
    return "未知"


def infer_tags(title: str, description: str, extra_text: str = "") -> tuple[str, ...]:
    haystack = f"{title} {description} {extra_text}"
    tags = {
        tag
        for tag, keywords in TAG_KEYWORDS.items()
        if any(keyword in haystack for keyword in keywords)
    }
    if not tags:
        tags.add("general")
    return tuple(sorted(tags))


def infer_venues(location_name: str, title: str = "", description: str = "") -> tuple[str, ...]:
    haystack = f"{location_name} {title} {description}"
    venues = {
        venue
        for venue, keywords in VENUE_KEYWORDS.items()
        if any(keyword in haystack for keyword in keywords)
    }
    if not venues:
        venues.add("general")
    return tuple(sorted(venues))


def parse_csv_values(raw: str) -> tuple[str, ...]:
    return tuple(value.strip() for value in raw.split(",") if value.strip())


def build_interest_tokens(*parts: str) -> tuple[str, ...]:
    tokens = [
        token
        for token in re.split(r"[\s,，、/]+", " ".join(parts).lower().strip())
        if token
    ]
    return tuple(dict.fromkeys(tokens))


def event_search_text(event: RecommendableEvent) -> str:
    return " ".join(
        part
        for part in [
            event.title,
            event.description,
            event.location_name,
            event.location,
            " ".join(event.tags),
            " ".join(event.venues),
        ]
        if part
    ).lower()


def match_interest_tokens(preference: UserPreference, event: RecommendableEvent) -> tuple[str, ...]:
    haystack = event_search_text(event)
    return tuple(
        dict.fromkeys(
            token
            for token in preference.interest_tokens
            if len(token) > 1 and token in haystack
        )
    )


def is_rainy_context(weather_context: str) -> bool:
    normalized = weather_context.lower().strip()
    return any(token in normalized for token in RAINY_CONTEXT_TOKENS)


def score_event(preference: UserPreference, event: RecommendableEvent, reference_date: date) -> float:
    score = 0.1

    if preference.preferred_cities:
        if event.city in preference.preferred_cities:
            score += 2.5
        else:
            score -= 1.8

    score += len(set(preference.preferred_tags) & set(event.tags)) * 1.8
    score += len(match_interest_tokens(preference, event)) * 5.0
    score += len(set(preference.venue_focus) & set(event.venues)) * 0.9

    if preference.wants_free:
        score += 1.3 if event.is_free else -0.8

    if preference.popularity_preference == "popular":
        score += min(math.log1p(event.hit_rate) / 3.0, 1.8)
    elif preference.popularity_preference == "niche":
        score += 0.4 if event.hit_rate < POPULARITY_THRESHOLDS["high"] else -0.2

    if preference.indoor_only and event.looks_indoor:
        score += 3.0
    if is_rainy_context(preference.weather_context) and event.looks_indoor:
        score += 10.0

    if event.start_date <= reference_date <= event.end_date:
        score += 0.5
    if 0 <= (event.end_date - reference_date).days <= 30:
        score += 0.4

    return score


def build_reasons(preference: UserPreference, event: RecommendableEvent, reference_date: date) -> list[str]:
    reasons: list[str] = []

    if event.city in preference.preferred_cities:
        reasons.append(f"符合偏好區域：{event.city}")

    matched_tags = sorted(set(preference.preferred_tags) & set(event.tags))
    if matched_tags:
        reasons.append(f"符合主題偏好：{', '.join(matched_tags)}")

    matched_interest = list(match_interest_tokens(preference, event))
    if matched_interest:
        reasons.append(f"符合興趣關鍵字：{', '.join(matched_interest[:3])}")

    matched_venues = sorted(set(preference.venue_focus) & set(event.venues))
    if matched_venues:
        reasons.append(f"場館型態符合：{', '.join(matched_venues)}")

    if preference.wants_free and event.is_free:
        reasons.append("符合免費偏好")

    if preference.popularity_preference == "popular" and event.hit_rate >= POPULARITY_THRESHOLDS["high"]:
        reasons.append("近期熱門展覽")

    if preference.indoor_only and event.looks_indoor:
        reasons.append("符合室內偏好")
    elif is_rainy_context(preference.weather_context) and event.looks_indoor:
        reasons.append("室內場館，雨天更適合")

    if 0 <= (event.end_date - reference_date).days <= 30:
        reasons.append("即將結束，值得優先安排")

    if not reasons:
        reasons.append("綜合主題、時間與場館條件排序靠前")

    return reasons[:3]
