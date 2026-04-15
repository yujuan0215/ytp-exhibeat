from __future__ import annotations

import html
import json
import math
import re
import sqlite3
from datetime import date, datetime, time, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus, urlparse

import requests
import urllib3


CULTURE_API_URL = "https://cloud.culture.tw/frontsite/trans/SearchShowAction.do"
CULTURE_API_HOST = "cloud.culture.tw"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
REQUEST_TIMEOUT_SECONDS = 30
SYNC_TTL = timedelta(hours=6)

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

DEFAULT_OPEN_TIME = time(10, 0)
DEFAULT_CLOSE_TIME = time(18, 0)
NOMINATIM_HEADERS = {
    "User-Agent": "ExhiBeat-Hackathon-Prototype/1.0",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
}

CURRENT_DIR = Path(__file__).resolve().parent
REPO_ROOT = CURRENT_DIR.parent.parent
DATA_DIR = REPO_ROOT / ".adk"
DB_PATH = DATA_DIR / "exhibeat.sqlite3"


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


def _strip_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", value)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


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


@lru_cache(maxsize=256)
def _geocode_address(query: str) -> tuple[float | None, float | None]:
    if not query:
        return (None, None)
    data = _request_json(
        NOMINATIM_SEARCH_URL,
        {
            "q": query,
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
            event_uid TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY(user_id, event_uid)
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

    items = _fetch_events_by_category(category_code)
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
    return score


def _row_to_result(row: sqlite3.Row, score: int) -> dict[str, Any]:
    description = row["summary"] or "官方目前未提供簡短介紹。"
    return {
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
    _ensure_categories_synced(list(CATEGORY_CODE_TO_LABEL.keys()), force=True)


def _ensure_occurrence_coords(row: sqlite3.Row) -> tuple[float | None, float | None]:
    if row["latitude"] is not None and row["longitude"] is not None:
        return (row["latitude"], row["longitude"])

    query = " ".join(part for part in [row["venue_name"] or "", row["address"] or ""] if part)
    lat, lon = _geocode_address(query)
    if lat is None or lon is None:
        lat, lon = _geocode_address(row["address"] or "")
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


def _travel_estimate(
    origin_coords: tuple[float, float] | None,
    dest_coords: tuple[float, float] | None,
) -> dict[str, Any]:
    if not origin_coords or not dest_coords:
        return {
            "distance_km": None,
            "estimated_minutes": 20,
            "mode": "city_transit",
            "summary": "缺少完整座標，先以台北市區一般轉乘時間估 20 分鐘。",
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


def get_event_detail(event_uid: str) -> dict[str, Any]:
    """
    取得單一藝文活動的完整資訊。
    """
    _ensure_event_exists(event_uid)
    event_row = _find_event_row(event_uid)
    if not event_row:
        return {"error": f"找不到 UID 為 `{event_uid}` 的活動。", "source": "文化部藝文活動 OpenAPI"}

    event = json.loads(event_row["raw_json"])
    occurrence_rows = _find_occurrence_rows(event_uid)
    show_infos = [_normalize_show_info_from_row(row) for row in occurrence_rows]
    taipei_show_infos = [
        item for item in show_infos if _is_taipei(item.get("address") or "", item.get("latitude"), item.get("longitude"))
    ]

    return {
        "source": "文化部藝文活動 OpenAPI",
        "database_path": str(DB_PATH),
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
            "ticket_url": event.get("webSales") or "",
            "promote_url": event.get("sourceWebPromote") or "",
            "source_web_name": event.get("sourceWebName") or "",
            "comment": _strip_html(event.get("comment")),
            "start_date": event.get("startDate"),
            "end_date": event.get("endDate"),
            "hit_rate": event.get("hitRate") or 0,
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
        "base_event": {
            "uid": detail["event"]["uid"],
            "title": detail["event"]["title"],
            "venue_name": base.get("location_name"),
            "address": base.get("address"),
            "map_url": base.get("map_url"),
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
            "移動時間使用台北市區簡化的大眾運輸／步行估算，不是即時路線規劃結果。",
            "若後續接入 TDX，可再將 travel estimate 升級成站點級或路線級規劃。",
        ],
        "count": len(selected),
        "itinerary": selected,
    }
