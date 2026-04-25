from __future__ import annotations

import html
import hashlib
import json
import math
import os
import re
import sqlite3
import sys
from datetime import UTC, date, datetime, time, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus, urlparse

import requests
import urllib3
import time as time_module

PROJECT_ROOT = Path(__file__).resolve().parents[4]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.shared.recommendation_core import (
    RecommendableEvent,
    UserPreference,
    build_interest_tokens,
    build_reasons as shared_build_reasons,
    infer_city as shared_infer_city,
    infer_tags as shared_infer_tags,
    infer_venues as shared_infer_venues,
    score_event,
)


CULTURE_API_URL = "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do"
CULTURE_API_HOST = "cloud.culture.tw"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
TDX_AUTH_URL = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"
TDX_API_BASE_URL = "https://tdx.transportdata.tw/api/basic/v2"
GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
GOOGLE_PLACES_PLACE_URL = "https://places.googleapis.com/v1/places"
REQUEST_TIMEOUT_SECONDS = 30
SYNC_TTL = timedelta(hours=6)
TDX_TOKEN_REFRESH_BUFFER = timedelta(minutes=5)
PAGE_FETCH_TIMEOUT_SECONDS = 8

CATEGORY_CODE_TO_LABEL = {
    "1": "音樂",
    "2": "戲劇",
    "3": "舞蹈",
    "4": "親子",
    "5": "獨立音樂",
    "6": "展覽",
    "7": "講座",
    "8": "電影",
    "11": "綜藝",
    "13": "競賽",
    "14": "徵選",
    "15": "其他",
    "17": "演唱會",
    "19": "研習課程",
    "200": "閱讀",
}

CATEGORY_SYNONYMS = {
    "音樂": ["音樂", "music"],
    "戲劇": ["戲劇", "劇場", "drama", "theatre", "theater"],
    "舞蹈": ["舞蹈", "dance"],
    "親子": ["親子", "family", "kids"],
    "獨立音樂": ["獨立音樂", "indie"],
    "展覽": ["展覽", "展演", "exhibition", "museum", "gallery"],
    "講座": ["講座", "lecture", "talk"],
    "電影": ["電影", "movie", "film", "cinema"],
    "綜藝": ["綜藝", "variety"],
    "競賽": ["競賽", "competition"],
    "徵選": ["徵選", "call for", "open call"],
    "其他": ["其他", "other"],
    "演唱會": ["演唱會", "concert"],
    "研習課程": ["研習", "課程", "workshop", "course", "class"],
    "閱讀": ["閱讀", "reading", "book", "literature"],
}

INDOOR_KEYWORDS = (
    "館",
    "美術館",
    "博物館",
    "展覽館",
    "展演中心",
    "文創園區",
    "劇場",
    "劇院",
    "影城",
    "書店",
    "圖書館",
    "藝文中心",
    "中心",
    "studio",
    "museum",
    "gallery",
    "hall",
)

TAIPEI_DISTRICTS = (
    "中正區",
    "大同區",
    "中山區",
    "松山區",
    "大安區",
    "萬華區",
    "信義區",
    "士林區",
    "北投區",
    "內湖區",
    "南港區",
    "文山區",
)

# 行政區中心座標快取表 (避免 Nominatim 429 封鎖)
TAIPEI_DISTRICT_COORDS = {
    "中正": (25.0324, 121.5190),
    "大同": (25.0631, 121.5133),
    "中山": (25.0685, 121.5333),
    "松山": (25.0599, 121.5574),
    "大安": (25.0263, 121.5434),
    "萬華": (25.0287, 121.4997),
    "信義": (25.0331, 121.5670),
    "士林": (25.0922, 121.5245),
    "北投": (25.1321, 121.5015),
    "內湖": (25.0835, 121.5894),
    "南港": (25.0559, 121.6171),
    "文山": (24.9881, 121.5701),
}

# 🎭 熱門文化場館座標快取表 (避免外部 API 延遲與 429)
TAIPEI_VENUE_COORDS = {
    "華山": (25.0444, 121.5298),
    "華山1914": (25.0444, 121.5298),
    "松山文創": (25.0453, 121.5606),
    "松山文創園區": (25.0453, 121.5606),
    "北美館": (25.0720, 121.5247),
    "臺北市立美術館": (25.0720, 121.5247),
    "台北市立美術館": (25.0720, 121.5247),
    "故宮專院": (25.1023, 121.5484),
    "故宮博物院": (25.1023, 121.5484),
    "國立故宮博物院": (25.1023, 121.5484),
    "故宮": (25.1023, 121.5484),
    "國父紀念館": (25.0402, 121.5601),
    "中正紀念堂": (25.0349, 121.5214),
    "台北表演藝術中心": (25.0815, 121.5215),
    "臺北表演藝術中心": (25.0815, 121.5215),
    "當代藝術館": (25.0521, 121.5130),
    "MOCA": (25.0521, 121.5130),
    "南海學園": (25.0270, 121.5115),
    "台北植物園": (25.0276, 121.5097),
    "西門紅樓": (25.0427, 121.5061),
    "寶藏巖": (25.0113, 121.5333),
    "牯嶺街": (25.0310, 121.5123),
    "迪化街": (25.0596, 121.5082),
    "大稻埕": (25.0596, 121.5082),
    "關渡美術館": (25.1318, 121.5339),
    "台北藝術大學": (25.1318, 121.5339),
}

DEFAULT_OPEN_TIME = time(10, 0)
DEFAULT_CLOSE_TIME = time(18, 0)
NOMINATIM_HEADERS = {
    "User-Agent": "ExhiBeat-Hackathon-Prototype/2.0 (Google-DeepMind-Assistant)",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
}
WEB_FETCH_HEADERS = {
    "User-Agent": "ExhiBeat-Hackathon-Prototype/1.0",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
}

CURRENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CURRENT_DIR.parent.parent
DATA_DIR = REPO_ROOT / ".adk"
DB_PATH = DATA_DIR / "exhibeat.sqlite3"
EXHIBITIONS_MERGED_PATH = PROJECT_ROOT / "data" / "exhibitions_merged.json"
VECTOR_CHUNKS_PATH = PROJECT_ROOT / "data" / "exhibitions_merged_chunks.json"
LEGAL_STAYS_PATH = PROJECT_ROOT / "data" / "legal_stays" / "legal_stays.json"

_TDX_TOKEN_CACHE: dict[str, datetime | str | None] = {
    "access_token": None,
    "expires_at": None,
}

@lru_cache(maxsize=1)
def _load_legal_stays() -> list[dict[str, Any]]:
    if not LEGAL_STAYS_PATH.exists():
        return []
    try:
        data = json.loads(LEGAL_STAYS_PATH.read_text(encoding="utf-8"))
        return data.get("stays", [])
    except Exception:
        return []

def _get_distance_to_event(hotel: dict[str, Any], event_coords: list[tuple[float, float]]) -> float:
    hotel_loc = hotel.get("location") or {}
    h_lat = _parse_float(hotel_loc.get("lat"))
    h_lon = _parse_float(hotel_loc.get("lng"))
    if h_lat is None or h_lon is None:
        return 999.0
    
    # Return distance to the nearest event in the list
    min_dist = 999.0
    for e_lat, e_lon in event_coords:
        dist = _haversine_km(h_lat, h_lon, e_lat, e_lon)
        if dist < min_dist:
            min_dist = dist
    return min_dist

def _request_json(url: str, params: dict[str, Any], headers: dict[str, str] | None = None) -> Any:
    try:
        response = requests.get(url, params=params, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.SSLError:
        parsed = urlparse(url)
        if parsed.hostname != CULTURE_API_HOST:
            raise

        # The official culture API currently fails TLS validation in this runtime.
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        response = requests.get(
            url,
            params=params,
            headers=headers,
            timeout=REQUEST_TIMEOUT_SECONDS,
            verify=False,
        )
        response.raise_for_status()
        return response.json()


@lru_cache(maxsize=1)
def _load_local_merged_events() -> list[dict[str, Any]]:
    if not EXHIBITIONS_MERGED_PATH.exists():
        return []
    try:
        payload = json.loads(EXHIBITIONS_MERGED_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []
    if not isinstance(payload, list):
        return []
    return [item for item in payload if isinstance(item, dict)]


def _events_for_category(category_code: str) -> list[dict[str, Any]]:
    all_events = _load_local_merged_events()
    return [e for e in all_events if str(e.get("category", "")).strip() == category_code]


def _tokenize_for_rag(value: str) -> set[str]:
    normalized = re.sub(r"\s+", " ", (value or "").lower()).strip()
    tokens = {t for t in re.split(r"[\s,，。；、|:/()\[\]{}<>\"'`!?\-]+", normalized) if len(t) >= 2}
    # Add 2-char CJK shingles for better zh keyword overlap.
    cjk = "".join(ch for ch in normalized if "\u4e00" <= ch <= "\u9fff")
    for i in range(max(0, len(cjk) - 1)):
        tokens.add(cjk[i : i + 2])
    return tokens


def _deterministic_embed(text: str, dimensions: int = 256) -> list[float]:
    """產生 deterministic hash embedding（作為 API 失敗時的 fallback）。"""
    values: list[float] = []
    text = text or ""
    for i in range(dimensions):
        seed = f"{i}|{text}".encode("utf-8")
        digest = hashlib.sha256(seed).digest()
        num = int.from_bytes(digest[:4], byteorder="big", signed=False)
        values.append((num / 2**31) - 1.0)
    return values


_EMBED_MODEL = "text-multilingual-embedding-002"


def _gemini_embed(text: str) -> list[float]:
    """
    使用 Vertex AI text-multilingual-embedding-002 產生真正的語意 Embedding (768 維)。
    失敗時 fallback 到 _deterministic_embed，確保系統不崩潰。
    """
    if not text:
        return _deterministic_embed("", 768)
    try:
        import os as _os
        _os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "1")
        _os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "adept-region-493401-t5")
        _os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")
        from google import genai as _genai
        _client = _genai.Client()
        resp = _client.models.embed_content(
            model=_EMBED_MODEL,
            contents=[text[:800]],
        )
        return list(resp.embeddings[0].values)
    except Exception:
        return _deterministic_embed(text, 768)


@lru_cache(maxsize=1)
def _load_vector_chunks() -> list[dict[str, Any]]:
    if not VECTOR_CHUNKS_PATH.exists():
        return []
    try:
        payload = json.loads(VECTOR_CHUNKS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []
    chunks = payload.get("chunks", []) if isinstance(payload, dict) else []
    if not isinstance(chunks, list):
        return []
    valid: list[dict[str, Any]] = []
    for chunk in chunks:
        if not isinstance(chunk, dict):
            continue
        emb = chunk.get("embedding", [])
        if not isinstance(emb, list) or not emb:
            continue
        valid.append(chunk)
    return valid


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def _rag_supporting_snippets_vector(query: str, event_title: str, top_k: int = 2) -> list[str]:
    chunks = _load_vector_chunks()
    if not chunks:
        return []
    # 使用真正的 Gemini Embedding 產生查詢向量（768 維語意空間）
    query_vec = _gemini_embed(f"{query} {event_title}")
    scored: list[tuple[float, str]] = []
    for chunk in chunks:
        emb = chunk.get("embedding", [])
        if not isinstance(emb, list):
            continue
        score = _cosine_similarity(query_vec, emb)
        if score <= 0:
            continue
        text = _truncate_text(str(chunk.get("chunk_text", "")), 260)
        title = str((chunk.get("metadata") or {}).get("title", "")).strip()
        if not text:
            continue
        snippet = f"{title}：{text}" if title else text
        scored.append((score, snippet))
    scored.sort(key=lambda row: row[0], reverse=True)

    snippets: list[str] = []
    seen: set[str] = set()
    for _score, snippet in scored:
        if snippet in seen:
            continue
        seen.add(snippet)
        snippets.append(snippet)
        if len(snippets) >= top_k:
            break
    return snippets


def _rag_supporting_snippets(query: str, event_title: str, event_description: str, top_k: int = 2) -> list[str]:
    vector_hits = _rag_supporting_snippets_vector(query=query, event_title=event_title, top_k=top_k)
    if vector_hits:
        return vector_hits

    query_tokens = _tokenize_for_rag(f"{query} {event_title}")
    if not query_tokens:
        return []

    ranked: list[tuple[int, str]] = []
    for item in _load_local_merged_events():
        title = _strip_html(str(item.get("title") or ""))
        description = _strip_html(str(item.get("descriptionFilterHtml") or ""))
        if not description:
            continue
        haystack_tokens = _tokenize_for_rag(f"{title} {description}")
        overlap = len(query_tokens & haystack_tokens)
        if overlap <= 0:
            continue
        snippet = _truncate_text(description, 260)
        ranked.append((overlap, f"{title}：{snippet}"))

    ranked.sort(key=lambda row: row[0], reverse=True)
    snippets: list[str] = []
    seen: set[str] = set()
    for _score, snippet in ranked:
        if snippet in seen:
            continue
        seen.add(snippet)
        snippets.append(snippet)
        if len(snippets) >= top_k:
            break
    return snippets


def _localized_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        for key in ("Zh_tw", "ZhTw", "zh_tw", "Name", "name", "En"):
            text = value.get(key)
            if isinstance(text, str) and text.strip():
                return text.strip()
    return ""


def _position_from_item(item: dict[str, Any]) -> tuple[float | None, float | None]:
    for key in ("StationPosition", "StopPosition", "Position"):
        position = item.get(key)
        if isinstance(position, dict):
            lat = _parse_float(position.get("PositionLat"))
            lon = _parse_float(position.get("PositionLon"))
            if lat is not None and lon is not None:
                return (lat, lon)

    lat = _parse_float(item.get("PositionLat") or item.get("lat"))
    lon = _parse_float(item.get("PositionLon") or item.get("lon"))
    return (lat, lon)


def _tdx_credentials() -> tuple[str | None, str | None]:
    return (os.getenv("TDX_CLIENT_ID"), os.getenv("TDX_CLIENT_SECRET"))


def _tdx_enabled() -> bool:
    client_id, client_secret = _tdx_credentials()
    return bool(client_id and client_secret)


def _places_api_key() -> str | None:
    return os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_PLACES_API_KEY")


def _places_enabled() -> bool:
    return bool(_places_api_key())


def _get_tdx_access_token() -> str:
    client_id, client_secret = _tdx_credentials()
    if not client_id or not client_secret:
        raise RuntimeError("尚未設定 TDX_CLIENT_ID / TDX_CLIENT_SECRET。")

    cached_token = _TDX_TOKEN_CACHE.get("access_token")
    expires_at = _TDX_TOKEN_CACHE.get("expires_at")
    if isinstance(cached_token, str) and isinstance(expires_at, datetime):
        if datetime.utcnow() + TDX_TOKEN_REFRESH_BUFFER < expires_at:
            return cached_token

    response = requests.post(
        TDX_AUTH_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    access_token = payload.get("access_token")
    expires_in = int(payload.get("expires_in") or 0)
    if not access_token:
        raise RuntimeError("TDX token 回應缺少 access_token。")

    _TDX_TOKEN_CACHE["access_token"] = access_token
    _TDX_TOKEN_CACHE["expires_at"] = datetime.utcnow() + timedelta(seconds=expires_in)
    return access_token


def _tdx_request_json(path: str, params: dict[str, Any]) -> Any:
    access_token = _get_tdx_access_token()
    response = requests.get(
        f"{TDX_API_BASE_URL}/{path.lstrip('/')}",
        params=params,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
        },
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json()


def _strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", value)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _truncate_text(value: str, limit: int = 220) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"


def _fetch_webpage_excerpt(url: str) -> str:
    if not url or not url.startswith(("http://", "https://")):
        return ""
    try:
        response = requests.get(
            url,
            headers=WEB_FETCH_HEADERS,
            timeout=PAGE_FETCH_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except requests.RequestException:
        return ""

    text = _strip_html(response.text)
    return _truncate_text(text, limit=260) if text else ""


def _places_text_search(query: str) -> dict[str, Any] | None:
    api_key = _places_api_key()
    if not api_key or not query:
        return None

    try:
        response = requests.post(
            GOOGLE_PLACES_TEXT_SEARCH_URL,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
            },
            json={
                "textQuery": query,
                "languageCode": "zh-TW",
                "regionCode": "TW",
                "maxResultCount": 1,
            },
            timeout=PAGE_FETCH_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException:
        return None

    places = payload.get("places") or []
    return places[0] if places else None


def _fetch_place_reviews(place_query: str) -> dict[str, Any]:
    if not _places_enabled():
        return {
            "enabled": False,
            "summary": "",
            "rating": None,
            "user_rating_count": None,
            "reviews": [],
        }

    place = _places_text_search(place_query)
    place_id = place.get("id") if isinstance(place, dict) else None
    if not place_id:
        return {
            "enabled": True,
            "summary": "",
            "rating": None,
            "user_rating_count": None,
            "reviews": [],
        }

    try:
        response = requests.get(
            f"{GOOGLE_PLACES_PLACE_URL}/{place_id}",
            headers={
                "X-Goog-Api-Key": _places_api_key() or "",
                "X-Goog-FieldMask": (
                    "id,displayName,formattedAddress,rating,userRatingCount,"
                    "reviews.text,reviews.rating,reviews.originalText"
                ),
            },
            timeout=PAGE_FETCH_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
    except requests.RequestException as exc:
        return {
            "enabled": True,
            "summary": f"Places reviews 查詢失敗：{exc}",
            "rating": None,
            "user_rating_count": None,
            "reviews": [],
        }

    reviews: list[dict[str, Any]] = []
    for review in payload.get("reviews") or []:
        text_value = _localized_text(review.get("text")) or _localized_text(review.get("originalText"))
        if not text_value:
            continue
        reviews.append(
            {
                "rating": review.get("rating"),
                "text": _truncate_text(text_value, limit=160),
            }
        )

    rating = payload.get("rating")
    user_rating_count = payload.get("userRatingCount")
    summary = ""
    if rating is not None and user_rating_count:
        summary = f"場館 Google Maps 評分約 {rating}，共 {user_rating_count} 則評價。"

    return {
        "enabled": True,
        "summary": summary,
        "rating": rating,
        "user_rating_count": user_rating_count,
        "reviews": reviews[:3],
    }


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    for fmt in ("%Y/%m/%d", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    dt_value = _parse_datetime(value)
    return dt_value.date() if dt_value else None


def _parse_float(value: str | None) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _today() -> date:
    return datetime.now().date()


def _normalize_category(category: str) -> list[str]:
    if not category:
        return list(CATEGORY_CODE_TO_LABEL.keys())

    normalized = category.strip().lower()
    if normalized in CATEGORY_CODE_TO_LABEL:
        return [normalized]

    matched_codes: list[str] = []
    for code, label in CATEGORY_CODE_TO_LABEL.items():
        aliases = [label, *CATEGORY_SYNONYMS.get(label, [])]
        if any(alias.lower() == normalized for alias in aliases):
            matched_codes.append(code)

    return matched_codes or list(CATEGORY_CODE_TO_LABEL.keys())


def _extract_district(address: str) -> str | None:
    normalized = address.replace("台", "臺")
    for district in TAIPEI_DISTRICTS:
        if district in normalized:
            return district
    return None


def _is_free(show_info: dict[str, Any]) -> bool:
    on_sales = (show_info.get("onSales") or "").upper()
    price_text = (show_info.get("price") or "").strip()
    if on_sales == "N":
        return True
    free_keywords = ("免費", "免票", "自由參觀", "免收費", "free")
    return any(keyword.lower() in price_text.lower() for keyword in free_keywords)


def _looks_indoor(show_info: dict[str, Any]) -> bool:
    text = " ".join(
        part for part in [show_info.get("location", ""), show_info.get("locationName", "")] if part
    ).lower()
    return any(keyword.lower() in text for keyword in INDOOR_KEYWORDS)


def _is_taipei(address: str, latitude: float | None, longitude: float | None) -> bool:
    normalized = address.replace("台", "臺")
    if "臺北市" in normalized:
        return True
    if latitude is None or longitude is None:
        return False
    return 24.9 <= latitude <= 25.25 and 121.45 <= longitude <= 121.7


def _maps_link(address: str, latitude: float | None, longitude: float | None) -> str:
    if latitude is not None and longitude is not None:
        return f"https://www.google.com/maps?q={latitude},{longitude}"
    return f"https://www.google.com/maps/search/?api=1&query={quote_plus(address)}"


def _directions_link(
    origin_coords: tuple[float, float] | None,
    dest_coords: tuple[float, float] | None,
    dest_address: str,
) -> str:
    if origin_coords and dest_coords:
        return (
            "https://www.google.com/maps/dir/?api=1"
            f"&origin={origin_coords[0]},{origin_coords[1]}"
            f"&destination={dest_coords[0]},{dest_coords[1]}"
            "&travelmode=transit"
        )
    if dest_coords:
        return f"https://www.google.com/maps/dir/?api=1&destination={dest_coords[0]},{dest_coords[1]}&travelmode=transit"
    return f"https://www.google.com/maps/dir/?api=1&destination={quote_plus(dest_address)}&travelmode=transit"


@lru_cache(maxsize=1024)
def _geocode_address(query: str) -> tuple[float | None, float | None]:
    if not query:
        return (None, None)
        
    # Clean up the query string to improve Nominatim success rate
    # 1. Remove Taiwan postal codes (e.g. "104", "10491") at the beginning
    clean_q = re.sub(r'^\d{3,5}\s*', '', query)
    # 2. Extract address inside parentheses if it exists, otherwise remove parentheses content
    # e.g. "臺北市立美術館（臺北市中山區中山北路三段181號）" -> "臺北市中山區中山北路三段181號"
    match = re.search(r'[（(](.+?[路街巷弄號].*?)[)）]', clean_q)
    if match:
        clean_q = match.group(1)
    else:
        clean_q = re.sub(r'[（(].*?[)）]', '', clean_q)
    # 3. Remove floor/room modifiers like "1F", "2樓", "B1" which confuse Nominatim
    clean_q = re.sub(r'\d+[Ff]|B\d+|\d+樓室?|-\d+號|之\d+.*$', '', clean_q)
    # 4. Remove common venue suffixes that aren't part of the street address if it ends with "號"
    if "號" in clean_q:
        clean_q = re.sub(r'號.*$', '號', clean_q)
        
    clean_q = clean_q.strip()
    if not clean_q:
        clean_q = query.strip() # fallback
    
    # 優先從本地快取表查找 (中山、大安、大同等行政區)
    normalized_q = clean_q.replace("台北市", "").replace("臺北市", "").replace("區", "").strip()
    if normalized_q in TAIPEI_DISTRICT_COORDS:
        return TAIPEI_DISTRICT_COORDS[normalized_q]

    # 2. 查場館名稱快取 (華山、松山文創、北美館等)
    for venue_key, coords in TAIPEI_VENUE_COORDS.items():
        if venue_key in query or venue_key in clean_q:
            return coords
    
    # 遵守 Nominatim 使用政策：限制頻率並增加延遲
    time_module.sleep(1.0) 

    max_retries = 2
    for attempt in range(max_retries + 1):
        try:
            data = _request_json(
                NOMINATIM_SEARCH_URL,
                {
                    "q": clean_q,
                    "format": "jsonv2",
                    "limit": 1,
                    "countrycodes": "tw",
                    "addressdetails": 1,
                },
                headers=NOMINATIM_HEADERS,
            )
            if not data:
                return (None, None)
            first = data[0]
            return (_parse_float(first.get("lat")), _parse_float(first.get("lon")))
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                if attempt < max_retries:
                    # 遇到 429 時等待更久後重試
                    time_module.sleep(2.0 * (attempt + 1))
                    continue
                # 超過重試次數：靜默回傳 (None, None)，由呼叫端的行政區 fallback 接手
                # 絕對不 raise，避免讓整個工具鏈崩潰
                return (None, None)
            return (None, None)  # 其他 HTTP 錯誤也不 raise
        except Exception:
            return (None, None)
    return (None, None)


def _get_db_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS sync_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS events (
            uid TEXT PRIMARY KEY,
            category_code TEXT NOT NULL,
            title TEXT NOT NULL,
            raw_json TEXT NOT NULL,
            fetched_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS event_occurrences (
            occurrence_id TEXT PRIMARY KEY,
            event_uid TEXT NOT NULL,
            category_code TEXT NOT NULL,
            title TEXT NOT NULL,
            category_label TEXT NOT NULL,
            start_date TEXT,
            end_date TEXT,
            event_time TEXT,
            event_end_time TEXT,
            venue_name TEXT,
            address TEXT,
            district TEXT,
            is_free INTEGER NOT NULL,
            on_sales TEXT,
            price TEXT,
            latitude REAL,
            longitude REAL,
            looks_indoor INTEGER NOT NULL,
            hit_rate INTEGER NOT NULL,
            summary TEXT,
            show_unit TEXT,
            source_web_name TEXT,
            promote_url TEXT,
            ticket_url TEXT,
            image_url TEXT,
            map_url TEXT,
            search_text TEXT NOT NULL,
            fetched_at TEXT NOT NULL,
            FOREIGN KEY(event_uid) REFERENCES events(uid) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_occurrence_category ON event_occurrences(category_code);
        CREATE INDEX IF NOT EXISTS idx_occurrence_dates ON event_occurrences(start_date, end_date);
        CREATE INDEX IF NOT EXISTS idx_occurrence_district ON event_occurrences(district);
        CREATE INDEX IF NOT EXISTS idx_occurrence_free ON event_occurrences(is_free);

        CREATE TABLE IF NOT EXISTS user_favorites (
            user_id TEXT NOT NULL,
            item_type TEXT NOT NULL DEFAULT 'event',
            item_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(user_id, item_type, item_id)
        );

        CREATE TABLE IF NOT EXISTS event_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_uid TEXT NOT NULL,
            user_id TEXT,
            rating INTEGER,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    conn.commit()


def _get_sync_value(conn: sqlite3.Connection, key: str) -> str | None:
    row = conn.execute("SELECT value FROM sync_state WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def _set_sync_value(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        """
        INSERT INTO sync_state(key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        (key, value),
    )


def _fetch_events_by_category(category_code: str) -> list[dict[str, Any]]:
    return _request_json(
        CULTURE_API_URL,
        {
            "method": "doFindTypeJ",
            "category": category_code,
        },
    )


def _search_text_from_event(event: dict[str, Any], show_info: dict[str, Any]) -> str:
    parts = [
        event.get("title", ""),
        _strip_html(event.get("descriptionFilterHtml")),
        event.get("showUnit", ""),
        " ".join(event.get("masterUnit") or []),
        " ".join(event.get("subUnit") or []),
        show_info.get("locationName", "") or "",
        show_info.get("location", "") or "",
        event.get("sourceWebName", "") or "",
    ]
    return " ".join(part.strip() for part in parts if part).lower()


def _sync_category_to_db(category_code: str, force: bool = False) -> dict[str, Any]:
    conn = _get_db_connection()
    _ensure_schema(conn)

    sync_key = f"category:{category_code}"
    last_synced = _get_sync_value(conn, sync_key)
    if not force and last_synced:
        last_dt = datetime.fromisoformat(last_synced)
        if datetime.utcnow() - last_dt < SYNC_TTL:
            count = conn.execute(
                "SELECT COUNT(*) AS count FROM event_occurrences WHERE category_code = ?",
                (category_code,),
            ).fetchone()["count"]
            conn.close()
            return {"category_code": category_code, "occurrence_count": count, "used_cache": True}

    items = _events_for_category(category_code)
    fetched_at = datetime.utcnow().isoformat()
    category_label = CATEGORY_CODE_TO_LABEL.get(category_code, category_code)

    with conn:
        conn.execute("DELETE FROM event_occurrences WHERE category_code = ?", (category_code,))
        conn.execute("DELETE FROM events WHERE category_code = ?", (category_code,))

        for event in items:
            uid = event.get("UID")
            if not uid:
                continue
            conn.execute(
                """
                INSERT INTO events(uid, category_code, title, raw_json, fetched_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(uid) DO UPDATE SET
                    category_code = excluded.category_code,
                    title = excluded.title,
                    raw_json = excluded.raw_json,
                    fetched_at = excluded.fetched_at
                """,
                (
                    uid,
                    category_code,
                    event.get("title", ""),
                    json.dumps(event, ensure_ascii=False),
                    fetched_at,
                ),
            )

            summary = _strip_html(event.get("descriptionFilterHtml"))
            summary = summary[:160] + ("..." if len(summary) > 160 else "")
            for index, show_info in enumerate(event.get("showInfo") or [{}]):
                address = show_info.get("location") or ""
                venue_name = show_info.get("locationName") or ""
                latitude = _parse_float(show_info.get("latitude"))
                longitude = _parse_float(show_info.get("longitude"))
                occurrence_id = f"{uid}:{index}"

                conn.execute(
                    """
                    INSERT INTO event_occurrences(
                        occurrence_id, event_uid, category_code, title, category_label,
                        start_date, end_date, event_time, event_end_time,
                        venue_name, address, district, is_free, on_sales, price,
                        latitude, longitude, looks_indoor, hit_rate, summary,
                        show_unit, source_web_name, promote_url, ticket_url,
                        image_url, map_url, search_text, fetched_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(occurrence_id) DO UPDATE SET
                        event_uid = excluded.event_uid,
                        category_code = excluded.category_code,
                        title = excluded.title,
                        category_label = excluded.category_label,
                        start_date = excluded.start_date,
                        end_date = excluded.end_date,
                        event_time = excluded.event_time,
                        event_end_time = excluded.event_end_time,
                        venue_name = excluded.venue_name,
                        address = excluded.address,
                        district = excluded.district,
                        is_free = excluded.is_free,
                        on_sales = excluded.on_sales,
                        price = excluded.price,
                        latitude = excluded.latitude,
                        longitude = excluded.longitude,
                        looks_indoor = excluded.looks_indoor,
                        hit_rate = excluded.hit_rate,
                        summary = excluded.summary,
                        show_unit = excluded.show_unit,
                        source_web_name = excluded.source_web_name,
                        promote_url = excluded.promote_url,
                        ticket_url = excluded.ticket_url,
                        image_url = excluded.image_url,
                        map_url = excluded.map_url,
                        search_text = excluded.search_text,
                        fetched_at = excluded.fetched_at
                    """,
                    (
                        occurrence_id,
                        uid,
                        category_code,
                        event.get("title", ""),
                        category_label,
                        event.get("startDate"),
                        event.get("endDate"),
                        show_info.get("time"),
                        show_info.get("endTime"),
                        venue_name,
                        address,
                        _extract_district(address) or "",
                        1 if _is_free(show_info) else 0,
                        show_info.get("onSales") or "",
                        show_info.get("price") or "",
                        latitude,
                        longitude,
                        1 if _looks_indoor(show_info) else 0,
                        int(event.get("hitRate") or 0),
                        summary,
                        event.get("showUnit") or "",
                        event.get("sourceWebName") or "",
                        event.get("sourceWebPromote") or "",
                        event.get("webSales") or "",
                        event.get("imageUrl") or "",
                        _maps_link(address or venue_name, latitude, longitude),
                        _search_text_from_event(event, show_info),
                        fetched_at,
                    ),
                )

        _set_sync_value(conn, sync_key, fetched_at)

    count = conn.execute(
        "SELECT COUNT(*) AS count FROM event_occurrences WHERE category_code = ?",
        (category_code,),
    ).fetchone()["count"]
    conn.close()
    return {"category_code": category_code, "occurrence_count": count, "used_cache": False}


def _ensure_categories_synced(category_codes: list[str], force: bool = False) -> list[dict[str, Any]]:
    return [_sync_category_to_db(code, force=force) for code in category_codes]


def _load_occurrence_rows(
    query: str = "",
    date_str: str = "",
    district: str = "",
    category: str = "",
    free_only: bool = False,
    indoor_only: bool = False,
    city: str = "臺北市",
) -> list[sqlite3.Row]:
    category_codes = _normalize_category(category)
    _ensure_categories_synced(category_codes)

    conn = _get_db_connection()
    _ensure_schema(conn)
    placeholders = ",".join("?" for _ in category_codes)
    sql = f"""
        SELECT *
        FROM event_occurrences
        WHERE category_code IN ({placeholders})
    """
    params: list[Any] = [*category_codes]

    if district:
        sql += " AND district = ?"
        params.append(district.replace("台", "臺"))

    if free_only:
        sql += " AND is_free = 1"

    if indoor_only:
        sql += " AND looks_indoor = 1"

    sql += " ORDER BY hit_rate DESC, start_date ASC, title ASC"
    rows = conn.execute(sql, params).fetchall()
    conn.close()

    if city.replace("台", "臺") == "臺北市":
        rows = [
            row
            for row in rows
            if _is_taipei(row["address"] or "", row["latitude"], row["longitude"])
        ]

    target_date = _parse_date(date_str) if date_str else None
    today = _today()
    filtered_rows: list[sqlite3.Row] = []
    for row in rows:
        start_date = _parse_date(row["start_date"])
        end_date = _parse_date(row["end_date"])
        if target_date:
            if start_date and target_date < start_date:
                continue
            if end_date and target_date > end_date:
                continue
        else:
            if end_date and end_date < today:
                continue
        filtered_rows.append(row)
    rows = filtered_rows

    if not query:
        return rows

    normalized = query.lower().strip()
    tokens = [token for token in re.split(r"[\s,，、/]+", normalized) if token]
    filtered: list[sqlite3.Row] = []
    for row in rows:
        haystack = (row["search_text"] or "").lower()
        if normalized in haystack or any(token in haystack for token in tokens):
            filtered.append(row)
    return filtered


def _score_row(row: sqlite3.Row, query: str, district: str, target_date: date | None) -> int:
    score = min(int((row["hit_rate"] or 0) / 100), 15)
    haystack = (row["search_text"] or "").lower()
    normalized_query = query.lower().strip()
    if normalized_query and normalized_query in haystack:
        score += 40
    elif normalized_query:
        for token in re.split(r"[\s,，、/]+", normalized_query):
            if token and token in haystack:
                score += 8

    if district and row["district"] == district.replace("台", "臺"):
        score += 10

    if target_date:
        start_date = _parse_date(row["start_date"])
        end_date = _parse_date(row["end_date"])
        if start_date and end_date and start_date <= target_date <= end_date:
            score += 8

    if row["is_free"]:
        score += 4
    if row["looks_indoor"]:
        score += 2
    if row["latitude"] is not None and row["longitude"] is not None:
        score += 3
    
    # 📉 排名微調：降權「畢業展」，提升一般大眾興趣活動的曝光度
    if "畢業展" in (row["title"] or ""):
        score -= 20
        
    return score


def _copy_seed_from_row(row: sqlite3.Row, include_reviews: bool = False) -> dict[str, Any]:
    summary = _truncate_text(row["summary"] or "", limit=220)
    official_page_excerpt = _fetch_webpage_excerpt(row["promote_url"] or "")
    seed_text = summary or official_page_excerpt

    if not seed_text:
        title = row["title"] or "這個展覽"
        venue_name = row["venue_name"] or "台北場館"
        category = row["category_label"] or "藝文活動"
        seed_text = (
            f"{title} 目前缺少完整官方摘要，可先從展名與場館脈絡理解為一檔適合在 {venue_name} 體驗的 {category}。"
        )

    context_hints: list[str] = []
    if row["is_free"]:
        context_hints.append("免費活動，適合順路安排")
    if row["looks_indoor"]:
        context_hints.append("室內場館，雨天較友善")
    if row["end_date"]:
        end_dt = _parse_date(row["end_date"])
        if end_dt and 0 <= (end_dt - _today()).days <= 21:
            context_hints.append("展期接近尾聲，可優先安排")

    review_context = {
        "enabled": False,
        "summary": "",
        "rating": None,
        "user_rating_count": None,
        "reviews": [],
    }
    if include_reviews:
        review_query = " ".join(
            part
            for part in [row["venue_name"] or "", row["address"] or "", "台北"]
            if part
        )
        review_context = _fetch_place_reviews(review_query)

    return {
        "source_text": seed_text,
        "source_priority": "official_summary" if summary else ("official_promote_page" if official_page_excerpt else "title_inference"),
        "official_summary": summary,
        "official_page_excerpt": official_page_excerpt,
        "context_hints": context_hints,
        "review_context": review_context,
    }


def _row_to_recommendable_event(row: sqlite3.Row) -> RecommendableEvent:
    city = shared_infer_city(row["address"] or "")
    description = row["summary"] or row["title"] or ""
    title = row["title"] or "未命名展覽"
    location_name = row["venue_name"] or ""
    address = row["address"] or ""
    start_date = _parse_date(row["start_date"]) or _today()
    end_date = _parse_date(row["end_date"]) or start_date
    return RecommendableEvent(
        uid=row["event_uid"],
        title=title,
        city=city,
        location_name=location_name,
        location=address,
        start_date=start_date,
        end_date=end_date,
        hit_rate=int(row["hit_rate"] or 0),
        is_free=bool(row["is_free"]),
        tags=shared_infer_tags(title, description, extra_text=row["category_label"] or ""),
        venues=shared_infer_venues(location_name, title, description),
        description=description,
        looks_indoor=bool(row["looks_indoor"]),
    )


def _build_user_preference(
    query: str,
    district: str,
    interests: str,
    weather_context: str,
    free_only: bool,
    indoor_only: bool,
) -> UserPreference:
    preferred_cities = ("台北市",)
    inferred_interest_tags = shared_infer_tags(interests or query, query or interests)
    preferred_tags = () if inferred_interest_tags == ("general",) else inferred_interest_tags
    venue_focus = ("museum", "art_museum", "cultural_center") if indoor_only else ()
    return UserPreference(
        preferred_cities=preferred_cities,
        preferred_tags=preferred_tags,
        venue_focus=venue_focus,
        interest_tokens=build_interest_tokens(query, interests),
        wants_free=free_only,
        popularity_preference="popular",
        indoor_only=indoor_only,
        weather_context=weather_context,
    )


def _row_to_result(row: sqlite3.Row, score: int, include_copy_seed: bool = False, include_reviews: bool = False) -> dict[str, Any]:
    description = row["summary"] or "官方目前未提供簡短介紹。"
    result = {
        "uid": row["event_uid"],
        "occurrence_id": row["occurrence_id"],
        "title": row["title"],
        "category": row["category_label"],
        "category_code": row["category_code"],
        "start_date": row["start_date"],
        "end_date": row["end_date"],
        "event_time": row["event_time"],
        "event_end_time": row["event_end_time"],
        "venue_name": row["venue_name"],
        "address": row["address"],
        "district": row["district"],
        "is_free": bool(row["is_free"]),
        "on_sales": row["on_sales"],
        "price": row["price"] or "",
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "source_web_name": row["source_web_name"] or "",
        "promote_url": row["promote_url"] or "",
        "ticket_url": row["ticket_url"] or "",
        "image_url": row["image_url"] or "",
        "summary": row["summary"] or "",
        "description": description,
        "score": score,
        "map_url": row["map_url"] or _maps_link(row["address"] or row["venue_name"] or "", row["latitude"], row["longitude"]),
    }
    if include_copy_seed:
        result["copy_seed"] = _copy_seed_from_row(row, include_reviews=include_reviews)
    return result


def _find_event_row(event_uid: str) -> sqlite3.Row | None:
    conn = _get_db_connection()
    _ensure_schema(conn)
    row = conn.execute("SELECT * FROM events WHERE uid = ?", (event_uid,)).fetchone()
    conn.close()
    return row


def _find_occurrence_rows(event_uid: str) -> list[sqlite3.Row]:
    conn = _get_db_connection()
    _ensure_schema(conn)
    rows = conn.execute(
        """
        SELECT *
        FROM event_occurrences
        WHERE event_uid = ?
        ORDER BY event_time ASC, venue_name ASC
        """,
        (event_uid,),
    ).fetchall()
    conn.close()
    return rows


def _ensure_event_exists(event_uid: str) -> None:
    if _find_event_row(event_uid):
        return
    # Temporarily disabled full force-sync on missing events because the culture API is unstable
    # and throws JSONDecodeError. It's better to just act like the event is missing than to crash.
    try:
        _ensure_categories_synced(["6"], force=False) # Try a soft sync of exhibitions first
    except Exception:
        pass


def _ensure_occurrence_coords(row: sqlite3.Row) -> tuple[float | None, float | None]:
    if row["latitude"] is not None and row["longitude"] is not None:
        return (row["latitude"], row["longitude"])

    # 嘗試用地址 geocode
    try:
        query = " ".join(part for part in [row["venue_name"] or "", row["address"] or ""] if part)
        lat, lon = _geocode_address(query)
        if lat is None or lon is None:
            lat, lon = _geocode_address(row["address"] or "")
    except Exception:
        lat, lon = None, None

    # 若 geocode 失敗，改用行政區中心座標作為 fallback
    if (lat is None or lon is None) and row["district"]:
        district_key = (row["district"] or "").replace("臺北市", "").replace("台北市", "").replace("區", "").strip()
        if district_key in TAIPEI_DISTRICT_COORDS:
            lat, lon = TAIPEI_DISTRICT_COORDS[district_key]

    if lat is None or lon is None:
        return (None, None)

    conn = _get_db_connection()
    _ensure_schema(conn)
    with conn:
        conn.execute(
            """
            UPDATE event_occurrences
            SET latitude = ?, longitude = ?, map_url = ?
            WHERE occurrence_id = ?
            """,
            (lat, lon, _maps_link(row["address"] or row["venue_name"] or "", lat, lon), row["occurrence_id"]),
        )
    conn.close()
    return (lat, lon)


def _normalize_show_info_from_row(row: sqlite3.Row) -> dict[str, Any]:
    latitude, longitude = _ensure_occurrence_coords(row)
    transit_access = _get_transit_access(latitude, longitude, row["address"] or row["venue_name"] or "")
    return {
        "time": row["event_time"],
        "end_time": row["event_end_time"],
        "location_name": row["venue_name"],
        "address": row["address"],
        "district": row["district"],
        "is_free": bool(row["is_free"]),
        "on_sales": row["on_sales"],
        "price": row["price"],
        "latitude": latitude,
        "longitude": longitude,
        "looks_indoor": bool(row["looks_indoor"]),
        "map_url": _maps_link(row["address"] or row["venue_name"] or "", latitude, longitude),
        "transit_access": transit_access,
    }


def _duration_for_category(category_code: str) -> timedelta:
    if category_code in {"6", "200"}:
        return timedelta(minutes=90)
    if category_code in {"7", "19"}:
        return timedelta(minutes=120)
    if category_code in {"8", "2", "3", "11", "17"}:
        return timedelta(minutes=150)
    return timedelta(minutes=120)


def _time_window_from_row(row: sqlite3.Row, target_date: date) -> tuple[datetime, datetime]:
    start_dt = _parse_datetime(row["event_time"])
    end_dt = _parse_datetime(row["event_end_time"])
    event_start = _parse_date(row["start_date"]) or target_date
    event_end = _parse_date(row["end_date"]) or target_date

    open_time = start_dt.time() if start_dt else DEFAULT_OPEN_TIME
    close_time = end_dt.time() if end_dt else DEFAULT_CLOSE_TIME

    window_start = start_dt if start_dt and start_dt.date() == target_date else datetime.combine(target_date, open_time)
    window_end = end_dt if end_dt and end_dt.date() == target_date else datetime.combine(target_date, close_time)

    if event_start > target_date or event_end < target_date:
        now = datetime.combine(target_date, DEFAULT_OPEN_TIME)
        return (now, now)

    if window_end <= window_start:
        window_end = window_start + _duration_for_category(row["category_code"])
    return (window_start, window_end)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    lat1_r = math.radians(lat1)
    lon1_r = math.radians(lon1)
    lat2_r = math.radians(lat2)
    lon2_r = math.radians(lon2)
    dlat = lat2_r - lat1_r
    dlon = lon2_r - lon1_r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius * c


def _station_result_from_item(
    item: dict[str, Any],
    origin_coords: tuple[float, float],
    item_type: str,
) -> dict[str, Any] | None:
    lat, lon = _position_from_item(item)
    if lat is None or lon is None:
        return None

    distance_km = round(_haversine_km(origin_coords[0], origin_coords[1], lat, lon), 2)
    distance_m = int(round(distance_km * 1000))
    if item_type == "metro":
        name = _localized_text(item.get("StationName")) or item.get("StationID") or "未命名捷運站"
        identifier = item.get("StationID") or item.get("StationUID") or ""
        line_name = _localized_text(item.get("LineName"))
    else:
        name = _localized_text(item.get("StopName")) or item.get("StopID") or "未命名公車站"
        identifier = item.get("StopID") or item.get("StopUID") or ""
        route_names = [
            _localized_text(route.get("RouteName"))
            for route in (item.get("Routes") or [])
            if isinstance(route, dict)
        ]
        line_name = "、".join(name for name in route_names if name)[:120]

    return {
        "type": item_type,
        "name": name,
        "id": identifier,
        "line": line_name,
        "latitude": lat,
        "longitude": lon,
        "distance_km": distance_km,
        "distance_m": distance_m,
        "map_url": _maps_link(name, lat, lon),
    }


@lru_cache(maxsize=256)
def _nearby_metro_stations(lat: float, lon: float, radius_m: int = 600, limit: int = 3) -> tuple[dict[str, Any], ...]:
    if not _tdx_enabled():
        return tuple()

    data = _tdx_request_json(
        "Rail/Metro/Station/TRTC",
        {
            "$spatialFilter": f"nearby({lat},{lon},{radius_m})",
            "$top": max(limit, 1),
            "$format": "JSON",
        },
    )
    results: list[dict[str, Any]] = []
    for item in data or []:
        normalized = _station_result_from_item(item, (lat, lon), "metro")
        if normalized:
            results.append(normalized)

    results.sort(key=lambda item: item["distance_m"])
    return tuple(results[:limit])


@lru_cache(maxsize=256)
def _nearby_bus_stops(lat: float, lon: float, radius_m: int = 400, limit: int = 3) -> tuple[dict[str, Any], ...]:
    if not _tdx_enabled():
        return tuple()

    data = _tdx_request_json(
        "Bus/Stop/NearBy",
        {
            "$spatialFilter": f"nearby({lat},{lon},{radius_m})",
            "$top": max(limit, 1),
            "$format": "JSON",
        },
    )
    results: list[dict[str, Any]] = []
    for item in data or []:
        normalized = _station_result_from_item(item, (lat, lon), "bus")
        if normalized:
            results.append(normalized)

    results.sort(key=lambda item: item["distance_m"])
    return tuple(results[:limit])


def _transit_summary(metro_stations: list[dict[str, Any]], bus_stops: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    if metro_stations:
        nearest_metro = metro_stations[0]
        line_text = f"（{nearest_metro['line']}）" if nearest_metro.get("line") else ""
        parts.append(
            f"最近捷運站是 {nearest_metro['name']}{line_text}，約 {nearest_metro['distance_m']} 公尺。"
        )
    if bus_stops:
        nearest_bus = bus_stops[0]
        route_text = f"，可留意 {nearest_bus['line']}" if nearest_bus.get("line") else ""
        parts.append(
            f"最近公車站是 {nearest_bus['name']}，約 {nearest_bus['distance_m']} 公尺{route_text}。"
        )
    return " ".join(parts)


def _get_transit_access(
    lat: float | None,
    lon: float | None,
    address: str,
    radius_m: int = 600,
    limit: int = 3,
) -> dict[str, Any]:
    if lat is None or lon is None:
        return {
            "tdx_enabled": _tdx_enabled(),
            "summary": "缺少活動座標，無法查詢附近捷運與公車站。",
            "metro_stations": [],
            "bus_stops": [],
        }

    if not _tdx_enabled():
        return {
            "tdx_enabled": False,
            "summary": "尚未設定 TDX 憑證，暫時只能提供 Google Maps 導航連結。",
            "metro_stations": [],
            "bus_stops": [],
        }

    try:
        metro_stations = list(_nearby_metro_stations(lat, lon, radius_m=radius_m, limit=limit))
        bus_stops = list(_nearby_bus_stops(lat, lon, radius_m=max(250, min(radius_m, 400)), limit=limit))
    except requests.RequestException as exc:
        return {
            "tdx_enabled": True,
            "summary": f"TDX 查詢失敗：{exc}",
            "metro_stations": [],
            "bus_stops": [],
            "warning": str(exc),
        }
    except Exception as exc:
        return {
            "tdx_enabled": True,
            "summary": f"TDX 查詢失敗：{exc}",
            "metro_stations": [],
            "bus_stops": [],
            "warning": str(exc),
        }

    summary = _transit_summary(metro_stations, bus_stops)
    if not summary:
        summary = "查不到附近的捷運站或公車站，建議直接用地圖導航確認路線。"

    return {
        "tdx_enabled": True,
        "address": address,
        "summary": summary,
        "metro_stations": metro_stations,
        "bus_stops": bus_stops,
    }


def _travel_estimate(
    origin_coords: tuple[float, float] | None,
    dest_coords: tuple[float, float] | None,
    dest_transit: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not origin_coords or not dest_coords:
        summary = "缺少完整座標，先以台北市區一般轉乘時間估 20 分鐘。"
        if dest_transit and dest_transit.get("summary"):
            summary = f"{summary} {dest_transit['summary']}"
        return {
            "distance_km": None,
            "estimated_minutes": 20,
            "mode": "city_transit",
            "summary": summary,
        }

    distance_km = round(_haversine_km(origin_coords[0], origin_coords[1], dest_coords[0], dest_coords[1]), 2)
    if distance_km <= 1.2:
        minutes = max(8, int(round(distance_km * 14 + 4)))
        mode = "walk"
        summary = f"兩點直線距離約 {distance_km} 公里，適合步行。"
    elif distance_km <= 4:
        minutes = max(15, int(round(distance_km * 7 + 8)))
        mode = "mrt_or_bus"
        summary = f"兩點直線距離約 {distance_km} 公里，較適合搭捷運或短程公車。"
    elif distance_km <= 10:
        minutes = max(24, int(round(distance_km * 5 + 12)))
        mode = "mrt"
        summary = f"兩點直線距離約 {distance_km} 公里，建議以捷運為主。"
    else:
        minutes = max(35, int(round(distance_km * 4 + 16)))
        mode = "transit"
        summary = f"兩點直線距離約 {distance_km} 公里，屬較長移動，建議使用大眾運輸。"

    if dest_transit and dest_transit.get("summary"):
        summary = f"{summary} {dest_transit['summary']}"

    return {
        "distance_km": distance_km,
        "estimated_minutes": minutes,
        "mode": mode,
        "summary": summary,
    }


def sync_event_catalog(category: str = "all", force: bool = False) -> dict[str, Any]:
    """
    將文化部藝文活動資料同步到本地 SQLite 資料庫。

    Args:
        category: 活動類型，可填「all」、「展覽」、「講座」或活動類別代碼。
        force: 若為 True，忽略同步時效直接重抓。

    Returns:
        dict: 同步結果摘要。
    """
    category_codes = (
        list(CATEGORY_CODE_TO_LABEL.keys())
        if category.strip().lower() in {"all", "活動", "展演", "藝文"}
        else _normalize_category(category)
    )
    results = _ensure_categories_synced(category_codes, force=force)
    return {
        "source": "文化部藝文活動 OpenAPI",
        "database_path": str(DB_PATH),
        "categories": results,
        "synced_at": datetime.utcnow().isoformat(),
    }


def search_events(
    query: str = "",
    date: str = "",
    district: str = "",
    category: str = "",
    free_only: bool = False,
    indoor_only: bool = False,
    limit: int = 8,
) -> dict[str, Any]:
    """
    搜尋台北市的真實藝文活動資料。

    資料會先同步進本地 SQLite 後再查詢，避免每次都直接掃官方 API。
    """
    bounded_limit = min(max(limit, 1), 20)
    target_date = _parse_date(date) if date else None
    rows = _load_occurrence_rows(
        query=query,
        date_str=date,
        district=district,
        category=category,
        free_only=free_only,
        indoor_only=indoor_only,
        city="臺北市",
    )

    results: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for row in rows:
        key = (row["event_uid"], row["address"] or "")
        if key in seen:
            continue
        seen.add(key)
        results.append(_row_to_result(row, _score_row(row, query, district, target_date)))

    results.sort(key=lambda item: (-item["score"], item.get("start_date") or "9999-12-31", item["title"]))
    return {
        "source": "文化部藝文活動 OpenAPI",
        "database_path": str(DB_PATH),
        "city": "臺北市",
        "query": {
            "query": query,
            "date": date,
            "district": district,
            "category": category,
            "free_only": free_only,
            "indoor_only": indoor_only,
            "limit": bounded_limit,
        },
        "count": min(len(results), bounded_limit),
        "events": results[:bounded_limit],
    }


def recommend_events(
    query: str = "",
    date: str = "",
    district: str = "",
    category: str = "展覽",
    interests: str = "",
    weather_context: str = "",
    free_only: bool = False,
    indoor_only: bool = False,
    limit: int = 6,
    include_reviews: bool = False,
) -> dict[str, Any]:
    """
    根據使用者當下需求，對台北展覽做情境式推薦排序。
    """
    bounded_limit = min(max(limit, 1), 12)
    target_date = _parse_date(date) if date else None
    rows = _load_occurrence_rows(
        query=query,
        date_str=date,
        district=district,
        category=category,
        free_only=free_only,
        indoor_only=indoor_only,
        city="臺北市",
    )
    preference = _build_user_preference(
        query=query,
        district=district,
        interests=interests,
        weather_context=weather_context,
        free_only=free_only,
        indoor_only=indoor_only,
    )

    ranked: list[tuple[float, sqlite3.Row, list[str]]] = []
    seen_event_uids: set[str] = set()
    for row in rows:
        if row["event_uid"] in seen_event_uids:
            continue
        event = _row_to_recommendable_event(row)
        score = score_event(preference, event, target_date or _today())
        reasons = shared_build_reasons(preference, event, target_date or _today())
        ranked.append((score, row, reasons))
        seen_event_uids.add(row["event_uid"])

    ranked.sort(key=lambda item: (-item[0], item[1]["start_date"] or "9999-12-31", item[1]["title"]))

    events: list[dict[str, Any]] = []
    for score, row, reasons in ranked[:bounded_limit]:
        result = _row_to_result(row, int(round(score)), include_copy_seed=True, include_reviews=include_reviews)
        result["recommendation_reasons"] = reasons
        result["rag_context"] = _rag_supporting_snippets(
            query=f"{query} {interests}",
            event_title=result.get("title", ""),
            event_description=result.get("description", ""),
            top_k=2,
        )
        result["scoring_context"] = {
            "weather_context": weather_context,
            "interests": interests,
        }
        events.append(result)

    return {
        "source": "文化部藝文活動 OpenAPI",
        "database_path": str(DB_PATH),
        "city": "臺北市",
        "query": {
            "query": query,
            "date": date,
            "district": district,
            "category": category,
            "interests": interests,
            "weather_context": weather_context,
            "free_only": free_only,
            "indoor_only": indoor_only,
            "limit": bounded_limit,
            "include_reviews": include_reviews and _places_enabled(),
        },
        "count": len(events),
        "events": events,
    }


def search_events_near_place(
    place: str,
    radius_km: float = 1.5,
    date: str = "",
    category: str = "",
    free_only: bool = False,
    indoor_only: bool = False,
    limit: int = 8,
) -> dict[str, Any]:
    """
    搜尋某個地點附近的台北藝文活動。

    適合處理像「台大附近」、「華山附近」、「中山站附近」這種自然語言需求。
    """
    bounded_limit = min(max(limit, 1), 20)
    place_lat, place_lon = _geocode_address(place)
    if place_lat is None or place_lon is None:
        return {
            "source": "文化部藝文活動 OpenAPI",
            "database_path": str(DB_PATH),
            "error": f"找不到地點 `{place}`，請改用更完整的名稱，例如 `國立臺灣大學`、`華山1914文創園區`。",
        }

    rows = _load_occurrence_rows(
        query="",
        date_str=date,
        district="",
        category=category,
        free_only=free_only,
        indoor_only=indoor_only,
        city="臺北市",
    )

    results: list[dict[str, Any]] = []
    seen_event_uids: set[str] = set()
    target_date = _parse_date(date) if date else None
    for row in rows:
        if row["event_uid"] in seen_event_uids:
            continue
        lat = row["latitude"]
        lon = row["longitude"]
        if lat is None or lon is None:
            lat, lon = _ensure_occurrence_coords(row)
        if lat is None or lon is None:
            continue

        distance_km = round(_haversine_km(place_lat, place_lon, lat, lon), 2)
        if distance_km > radius_km:
            continue

        score = _score_row(row, "", "", target_date)
        result = _row_to_result(row, score)
        result["latitude"] = lat
        result["longitude"] = lon
        result["map_url"] = _maps_link(row["address"] or row["venue_name"] or "", lat, lon)
        result["distance_km"] = distance_km
        result["directions_url"] = _directions_link((place_lat, place_lon), (lat, lon), row["address"] or row["venue_name"] or "")
        results.append(result)
        seen_event_uids.add(row["event_uid"])

    results.sort(key=lambda item: (item["distance_km"], -item["score"], item["title"]))

    return {
        "source": "文化部藝文活動 OpenAPI",
        "database_path": str(DB_PATH),
        "place": {
            "name": place,
            "latitude": place_lat,
            "longitude": place_lon,
            "map_url": _maps_link(place, place_lat, place_lon),
        },
        "radius_km": radius_km,
        "query": {
            "date": date,
            "category": category,
            "free_only": free_only,
            "indoor_only": indoor_only,
            "limit": bounded_limit,
        },
        "count": min(len(results), bounded_limit),
        "events": results[:bounded_limit],
    }


def get_transit_access(
    place: str = "",
    event_uid: str = "",
    radius_m: int = 600,
    limit: int = 3,
) -> dict[str, Any]:
    """
    查詢指定地點或活動附近的捷運站與公車站。

    Args:
        place: 自然語言地點，例如「台大醫院」、「華山1914文創園區」。
        event_uid: 文化部活動 UID。若提供，優先使用活動場館位置。
        radius_m: 搜尋半徑（公尺）。
        limit: 每種交通設施回傳筆數上限。

    Returns:
        dict: 附近捷運、公車站與交通摘要。
    """
    bounded_limit = min(max(limit, 1), 5)
    bounded_radius = min(max(radius_m, 200), 1200)

    if event_uid:
        _ensure_event_exists(event_uid)
        occurrence_rows = _find_occurrence_rows(event_uid)
        if not occurrence_rows:
            return {"error": f"找不到 UID 為 `{event_uid}` 的活動。"}

        row = occurrence_rows[0]
        lat, lon = _ensure_occurrence_coords(row)
        transit_access = _get_transit_access(lat, lon, row["address"] or row["venue_name"] or "", bounded_radius, bounded_limit)
        transit_access.update(
            {
                "source": "TDX",
                "event_uid": event_uid,
                "place": {
                    "name": row["venue_name"] or row["title"],
                    "address": row["address"] or "",
                    "latitude": lat,
                    "longitude": lon,
                    "map_url": _maps_link(row["address"] or row["venue_name"] or "", lat, lon),
                },
                "radius_m": bounded_radius,
            }
        )
        return transit_access

    if not place:
        return {"error": "請提供 `place` 或 `event_uid`。"}

    lat, lon = _geocode_address(place)
    if lat is None or lon is None:
        return {"error": f"找不到地點 `{place}`，請改用更完整的名稱。"}

    transit_access = _get_transit_access(lat, lon, place, bounded_radius, bounded_limit)
    transit_access.update(
        {
            "source": "TDX",
            "place": {
                "name": place,
                "address": place,
                "latitude": lat,
                "longitude": lon,
                "map_url": _maps_link(place, lat, lon),
            },
            "radius_m": bounded_radius,
        }
    )
    return transit_access


def get_event_detail(event_uid: str) -> dict[str, Any]:
    """
    取得單一藝文活動的完整資訊。
    """
    _ensure_event_exists(event_uid)
    event_row = _find_event_row(event_uid)
    if not event_row:
        return {"error": f"找不到 UID 為 `{event_uid}` 的活動。", "source": "文化部藝文活動 OpenAPI"}

    event = json.loads(event_row["raw_json"])
    artemperor_meta = event.get("artemperorMeta") if isinstance(event.get("artemperorMeta"), dict) else {}
    all_images = artemperor_meta.get("allImages", [])
    if not isinstance(all_images, list):
        all_images = []
    occurrence_rows = _find_occurrence_rows(event_uid)
    show_infos = [_normalize_show_info_from_row(row) for row in occurrence_rows]
    taipei_show_infos = [
        item for item in show_infos if _is_taipei(item.get("address") or "", item.get("latitude"), item.get("longitude"))
    ]
    primary_row = occurrence_rows[0] if occurrence_rows else None
    copy_seed = _copy_seed_from_row(primary_row, include_reviews=True) if primary_row else {}

    return {
        "source": "文化部藝文活動 OpenAPI",
        "database_path": str(DB_PATH),
        "transport_source": "TDX" if _tdx_enabled() else "",
        "event": {
            "uid": event.get("UID"),
            "title": event.get("title"),
            "category": CATEGORY_CODE_TO_LABEL.get(event.get("category", ""), event.get("category")),
            "category_code": event.get("category"),
            "show_unit": event.get("showUnit") or "",
            "description": _strip_html(event.get("descriptionFilterHtml")),
            "discount_info": _strip_html(event.get("discountInfo")),
            "master_unit": event.get("masterUnit") or [],
            "sub_unit": event.get("subUnit") or [],
            "support_unit": event.get("supportUnit") or [],
            "other_unit": event.get("otherUnit") or [],
            "image_url": event.get("imageUrl") or "",
            "all_images": all_images,
            "ticket_url": event.get("webSales") or "",
            "promote_url": event.get("sourceWebPromote") or "",
            "source_web_name": event.get("sourceWebName") or "",
            "comment": _strip_html(event.get("comment")),
            "start_date": event.get("startDate"),
            "end_date": event.get("endDate"),
            "hit_rate": event.get("hitRate") or 0,
            "copy_seed": copy_seed,
            "rag_context": _rag_supporting_snippets(
                query=event.get("title", ""),
                event_title=event.get("title", ""),
                event_description=_strip_html(event.get("descriptionFilterHtml")),
                top_k=3,
            ),
            "taipei_show_info": taipei_show_infos,
            "all_show_info": show_infos,
        },
    }


def get_nearby_events(event_uid: str, radius_km: float = 2.0, limit: int = 5) -> dict[str, Any]:
    """
    根據指定活動，找出附近的其他台北活動。
    """
    detail = get_event_detail(event_uid)
    if "error" in detail:
        return detail

    show_infos = detail["event"].get("taipei_show_info") or detail["event"].get("all_show_info") or []
    if not show_infos:
        return {"error": f"活動 `{event_uid}` 沒有可用的場館資料。"}

    base = next((item for item in show_infos if item.get("latitude") is not None and item.get("longitude") is not None), None)
    if not base:
        return {"error": f"活動 `{event_uid}` 沒有可用的場館座標。"}

    rows = _load_occurrence_rows()
    nearby: list[dict[str, Any]] = []
    seen_event_uids: set[str] = set()
    for row in rows:
        if row["event_uid"] == event_uid:
            continue
        if row["event_uid"] in seen_event_uids:
            continue
        lat = row["latitude"]
        lon = row["longitude"]
        if lat is None or lon is None:
            continue
        distance_km = round(_haversine_km(base["latitude"], base["longitude"], lat, lon), 2)
        if distance_km <= radius_km:
            event = _row_to_result(row, _score_row(row, "", "", None))
            event["distance_km"] = distance_km
            nearby.append(event)
            seen_event_uids.add(row["event_uid"])

    nearby.sort(key=lambda item: (item["distance_km"], -item["score"]))
    bounded_limit = min(max(limit, 1), 20)
    return {
        "source": "文化部藝文活動 OpenAPI",
        "database_path": str(DB_PATH),
        "transport_source": "TDX" if _tdx_enabled() else "",
        "base_event": {
            "uid": detail["event"]["uid"],
            "title": detail["event"]["title"],
            "venue_name": base.get("location_name"),
            "address": base.get("address"),
            "map_url": base.get("map_url"),
            "transit_access": base.get("transit_access"),
        },
        "radius_km": radius_km,
        "count": min(len(nearby), bounded_limit),
        "events": nearby[:bounded_limit],
    }


def plan_itinerary(
    query: str = "",
    date: str = "",
    start_time: str = "13:00",
    end_time: str = "20:00",
    district: str = "",
    category: str = "",
    free_only: bool = False,
    indoor_only: bool = False,
    limit: int = 3,
) -> dict[str, Any]:
    """
    根據真實活動資料，規劃台北市的半日或一日藝文行程。
    """
    target_date = _parse_date(date) if date else _today()
    if not target_date:
        return {"error": f"無法解析日期 `{date}`，請改用 YYYY-MM-DD。"}

    try:
        start_clock = datetime.strptime(start_time, "%H:%M").time()
        end_clock = datetime.strptime(end_time, "%H:%M").time()
    except ValueError:
        return {"error": "時間格式錯誤，請使用 HH:MM，例如 13:30。"}

    day_start = datetime.combine(target_date, start_clock)
    day_end = datetime.combine(target_date, end_clock)
    if day_end <= day_start:
        return {"error": "結束時間必須晚於開始時間。"}

    rows = _load_occurrence_rows(
        query=query,
        date_str=target_date.isoformat(),
        district=district,
        category=category,
        free_only=free_only,
        indoor_only=indoor_only,
        city="臺北市",
    )
    if not rows:
        return {
            "source": "文化部藝文活動 OpenAPI",
            "database_path": str(DB_PATH),
            "error": "找不到符合條件的台北活動，請放寬條件後再試。",
        }

    scored_rows = [(row, _score_row(row, query, district, target_date)) for row in rows]
    scored_rows.sort(key=lambda item: (-item[1], item[0]["start_date"] or "9999-12-31", item[0]["title"]))

    current_time = day_start
    current_coords: tuple[float, float] | None = None
    selected: list[dict[str, Any]] = []
    used_events: set[str] = set()
    bounded_limit = min(max(limit, 1), 6)

    while len(selected) < bounded_limit:
        feasible: list[tuple[float, sqlite3.Row, int, datetime, datetime, dict[str, Any]]] = []
        for row, score in scored_rows:
            if row["event_uid"] in used_events:
                continue
            window_start, window_end = _time_window_from_row(row, target_date)
            duration = _duration_for_category(row["category_code"])
            dest_coords = (row["latitude"], row["longitude"]) if row["latitude"] is not None and row["longitude"] is not None else None
            travel = _travel_estimate(current_coords, dest_coords)
            suggested_start = max(current_time + timedelta(minutes=travel["estimated_minutes"]), window_start)
            suggested_end = suggested_start + duration
            if suggested_end > window_end or suggested_end > day_end:
                continue
            utility = float(score) - float(travel["estimated_minutes"]) / 3
            feasible.append((utility, row, score, suggested_start, suggested_end, travel))

        if not feasible:
            break

        feasible.sort(key=lambda item: (-item[0], item[3], -item[2]))
        _, row, score, suggested_start, suggested_end, travel = feasible[0]
        dest_coords = (row["latitude"], row["longitude"]) if row["latitude"] is not None and row["longitude"] is not None else None
        dest_transit = _get_transit_access(
            row["latitude"],
            row["longitude"],
            row["address"] or row["venue_name"] or "",
        )
        travel = _travel_estimate(current_coords, dest_coords, dest_transit=dest_transit)
        selected.append(
            {
                "uid": row["event_uid"],
                "occurrence_id": row["occurrence_id"],
                "title": row["title"],
                "category": row["category_label"],
                "venue_name": row["venue_name"],
                "address": row["address"],
                "district": row["district"],
                "start_at": suggested_start.isoformat(timespec="minutes"),
                "end_at": suggested_end.isoformat(timespec="minutes"),
                "estimated_stay_minutes": int((suggested_end - suggested_start).total_seconds() / 60),
                "travel_mode": travel["mode"],
                "estimated_travel_minutes": travel["estimated_minutes"],
                "estimated_travel_distance_km": travel["distance_km"],
                "travel_summary": travel["summary"],
                "directions_url": _directions_link(current_coords, dest_coords, row["address"] or row["venue_name"] or ""),
                "map_url": row["map_url"] or _maps_link(row["address"] or row["venue_name"] or "", row["latitude"], row["longitude"]),
                "transit_access": dest_transit,
                "is_free": bool(row["is_free"]),
                "price": row["price"] or "",
                "source_web_name": row["source_web_name"] or "",
                "promote_url": row["promote_url"] or "",
                "ticket_url": row["ticket_url"] or "",
                "score": score,
                "reason": (
                    f"符合條件且分數較高；"
                    f"{'免費活動，' if row['is_free'] else ''}"
                    f"{'室內場館，' if row['looks_indoor'] else ''}"
                    f"活動類型為 {row['category_label']}。"
                ),
            }
        )
        used_events.add(row["event_uid"])
        current_time = suggested_end
        current_coords = dest_coords

    return {
        "source": "文化部藝文活動 OpenAPI",
        "database_path": str(DB_PATH),
        "date": target_date.isoformat(),
        "window": {
            "start_time": start_time,
            "end_time": end_time,
        },
        "query": {
            "query": query,
            "district": district,
            "category": category,
            "free_only": free_only,
            "indoor_only": indoor_only,
            "limit": bounded_limit,
        },
        "notes": [
            "活動資料已先同步進本地 SQLite，減少每次直接打官方 API 的延遲與不穩定。",
            "移動時間仍是簡化估算，不是即時路線規劃結果。",
            "若已設定 TDX 憑證，會補上附近捷運站與公車站資訊，讓每站更接近真實交通情境。",
        ],
        "count": len(selected),
        "itinerary": selected,
    }

def recommend_hotels(
    event_ids: list[str],
    budget_level: str = None,
    limit: int = 5,
    prefer_mrt: bool = True
) -> dict[str, Any]:
    """
    根據已選定或感興趣的展演活動，推薦鄰近的合法旅宿。
    
    此工具只會從政府公開的合法旅宿白名單中挑選，確保住宿安全。
    """
    stays = _load_legal_stays()
    if not stays:
        return {"error": "目前系統中查無合法旅宿資料。", "count": 0, "hotels": []}

    # 1. 取得所有指定活動的座標
    event_coords = []
    event_details = []
    for uid in event_ids:
        _ensure_event_exists(uid)
        rows = _find_occurrence_rows(uid)
        if rows:
            row = rows[0]
            lat, lon = _ensure_occurrence_coords(row)
            if lat is not None and lon is not None:
                event_coords.append((lat, lon))
                event_details.append({"uid": uid, "title": row["title"], "venue": row["venue_name"]})

    if not event_coords:
        return {"error": "無法取得選定活動的座標，無法進行精確推薦。", "count": 0, "hotels": []}

    # 2. 計算每個合法旅宿到展演點的距離
    # 這裡我們只推薦在台北市境內的住宿 (簡單判斷)
    taipei_stays = [
        s for s in stays 
        if "Taipei" in (s.get("address") or {}).get("city", "") or "台北" in (s.get("address") or {}).get("full", "")
    ]
    
    if not taipei_stays:
        # 如果沒過濾到台北，就用全部資料前 1000 筆來算 (demo 穩定)
        taipei_stays = stays[:2000]

    scored_stays = []
    for hotel in taipei_stays:
        dist = _get_distance_to_event(hotel, event_coords)
        if dist > 10.0: # 太遠的就不推
            continue
        
        # 簡單計算一個分數
        score = 100 - (dist * 10)
        if prefer_mrt:
            # 這裡暫時沒有捷運資料欄位，先以距離展演點近為主
            pass
            
        scored_stays.append((score, hotel, dist))

    scored_stays.sort(key=lambda x: -x[0])
    
    results = []
    for score, h, dist in scored_stays[:limit]:
        results.append({
            "id": h.get("id"),
            "name": h.get("name"),
            "license_number": h.get("licenseNumber"),
            "address": (h.get("address") or {}).get("full"),
            "district": (h.get("address") or {}).get("town"),
            "description": h.get("description"),
            "class_labels": h.get("classLabels"),
            "distance_km": round(dist, 2),
            "latitude": (h.get("location") or {}).get("lat"),
            "longitude": (h.get("location") or {}).get("lng"),
            "is_legal": True, # 來自白名單，保證合法
            "map_url": _maps_link(h.get("name"), (h.get("location") or {}).get("lat"), (h.get("location") or {}).get("lng"))
        })

    return {
        "source": "交通部觀光署合法旅宿白名單",
        "anchors": event_details,
        "count": len(results),
        "hotels": results,
        "note": "以上推薦皆收錄於政府合法旅宿資料庫，請安心選擇。"
    }


def check_hotel_legality(name: str, address: str = "") -> dict[str, Any]:
    """
    查核特定旅宿是否在政府的合法旅宿白名單中。
    """
    stays = _load_legal_stays()
    name_clean = name.strip().lower()
    addr_clean = address.strip().lower() if address else ""
    
    match = None
    for h in stays:
        h_name = h.get("name", "").lower()
        h_addr = (h.get("address") or {}).get("full", "").lower()
        if name_clean in h_name or (h_name and h_name in name_clean):
            match = h
            break
        if addr_clean and (addr_clean in h_addr or h_addr in addr_clean):
            match = h
            break
            
    if match:
        return {
            "is_legal": True,
            "name": match.get("name"),
            "license_number": match.get("licenseNumber"),
            "address": (match.get("address") or {}).get("full"),
            "message": f"驗證通過：此旅宿為合法登記旅宿 (編號: {match.get('licenseNumber')})。"
        }
    else:
        return {
            "is_legal": False,
            "message": "目前未在合法旅宿白名單中查得此資料，建議優先考慮其他政府核案的安心旅宿。",
            "suggestion": "為了住宿安全，建議考慮我們為你準備的鄰近合法替代住宿。"
        }


def add_to_favorites(item_id: str, item_type: str = "event", user_id: str = "local-user") -> dict[str, Any]:
    """
    將展演活動或旅宿加入使用者的收藏清單。
    
    item_type 可為 'event' 或 'hotel'。
    """
    conn = _get_db_connection()
    _ensure_schema(conn)
    fetched_at = datetime.utcnow().isoformat()
    
    try:
        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO user_favorites(user_id, item_type, item_id, created_at) VALUES (?, ?, ?, ?)",
                (user_id, item_type, item_id, fetched_at)
            )
        return {"status": "success", "message": f"已成功將 {item_type} 收藏。", "item_id": item_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        conn.close()


def get_favorites(user_id: str = "local-user") -> dict[str, Any]:
    """
    讀取使用者目前的收藏清單，包含展演與旅宿。
    """
    conn = _get_db_connection()
    _ensure_schema(conn)
    
    favs = conn.execute("SELECT * FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC", (user_id,)).fetchall()
    conn.close()
    
    events = []
    hotels = []
    
    # 用於查詢詳情
    for f in favs:
        i_type = f["item_type"]
        i_id = f["item_id"]
        
        if i_type == "event":
            # 取得活動詳情
            _ensure_event_exists(i_id)
            rows = _find_occurrence_rows(i_id)
            if rows:
                row = rows[0]
                events.append({
                    "uid": row["event_uid"],
                    "title": row["title"],
                    "venue": row["venue_name"],
                    "start_date": row["start_date"],
                    "address": row["address"],
                    "latitude": row["latitude"],
                    "longitude": row["longitude"]
                })
        elif i_type == "hotel":
            # 從合法清單查找
            stays = _load_legal_stays()
            for h in stays:
                if h.get("id") == i_id:
                    hotels.append({
                        "id": h.get("id"),
                        "name": h.get("name"),
                        "address": (h.get("address") or {}).get("full")
                    })
                    break
                    
    return {
        "user_id": user_id,
        "count_events": len(events),
        "count_hotels": len(hotels),
        "events": events,
        "hotels": hotels
    }


def generate_itinerary(user_id: str = "local-user", date: str = "") -> dict[str, Any]:
    """
    根據使用者收藏的內容，生成一個完整的時間軸行程規劃。
    """
    fav_data = get_favorites(user_id)
    events = fav_data["events"]
    hotels = fav_data["hotels"]
    
    if not events:
        return {"error": "你的收藏中目前沒有展演活動，無法生成行程。建議先收藏感興趣的展覽！"}

    target_date = _parse_date(date) if date else _today()
    
    # 1. 依時間排序活動
    # 這裡假設活動都在同一天，或者我們只取日期相符的
    # 實際上簡化處理：取所有收藏的活動依開始時間排
    scored_events = []
    for ev in events:
        rows = _find_occurrence_rows(ev["uid"])
        if rows:
            row = rows[0]
            start_dt, end_dt = _time_window_from_row(row, target_date)
            scored_events.append((start_dt, end_dt, row))
            
    scored_events.sort(key=lambda x: x[0])
    
    itinerary = []
    current_time = scored_events[0][0] if scored_events else None
    
    for start_dt, end_dt, row in scored_events:
        # 計算前一站到這一站的交通 (簡化，目前假設從上一站來)
        # TODO: 可以加入交通緩衝
        itinerary.append({
            "type": "event",
            "time_range": f"{start_dt.strftime('%H:%M')} - {end_dt.strftime('%H:%M')}",
            "title": row["title"],
            "venue": row["venue_name"],
            "address": row["address"],
            "map_url": row["map_url"]
        })
        
    # 2. 如果有住宿，把它加到行程最後作為結束點
    if hotels:
        h = hotels[0] # 取第一個收藏的住宿
        itinerary.append({
            "type": "hotel",
            "time_range": "21:30~",
            "title": h["name"],
            "address": h["address"],
            "note": "行程結束，回到安心旅宿休息。"
        })
    else:
        # 如果沒收藏住宿，推薦一個最近的
        recommend = recommend_hotels([e["uid"] for e in events], limit=1)
        if recommend.get("hotels"):
            bh = recommend["hotels"][0]
            itinerary.append({
                "type": "hotel_recommend",
                "time_range": "21:30~",
                "title": bh["name"],
                "address": bh["address"],
                "note": "建議選擇鄰近合法旅宿休息。",
                "id": bh["id"]
            })

    return {
        "user_id": user_id,
        "date": target_date.isoformat(),
        "summary": f"為你規劃了這一天包含 {len(events)} 個展演點的探索行程。",
        "timeline": itinerary
    }

