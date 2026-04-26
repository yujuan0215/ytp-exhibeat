import argparse
import asyncio
import hashlib
import json
import os
import re as _re
import sqlite3
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.responses import Response, StreamingResponse
import httpx
from pydantic import BaseModel
from dotenv import load_dotenv
import uvicorn

# ─── Project Root Discovery ──────────────────────────────────────────────────
def discover_project_root():
    curr = Path(__file__).resolve().parent
    for _ in range(5):
        if (curr / "exhibitions.json").exists():
            return curr
        curr = curr.parent
    return Path(__file__).resolve().parent.parent.parent

PROJECT_ROOT = discover_project_root()
sys.path.insert(0, str(PROJECT_ROOT))
load_dotenv(Path(__file__).parent / "gemini_agent" / ".env", override=False)

import logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("api_proxy")

from backend.app.recommender.exhibeat_lightfm_demo import run_demo  # noqa: E402
from backend.adk_agent.auth_service import (  # noqa: E402
    Favorite,
    FavoriteCreateRequest,
    FavoriteResponse,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    User,
    UserResponse,
    bearer_scheme,
    create_access_token,
    decode_token,
    ensure_database_ready,
    get_current_user,
    get_db,
    hash_password,
    normalize_email,
    verify_password,
)

def _gemini_api_key_is_placeholder(value: str) -> bool:
    raw = (value or "").strip()
    if not raw:
        return True
    lowered = raw.lower()
    return lowered in {
        "your_api_key_here",
        "<paste-your-google-ai-studio-api-key-here>",
        "changeme",
    }


def _agent_credentials_ready() -> tuple[bool, str]:
    """Return (ready, human_message). Used to short-circuit /api/run when misconfigured."""
    use_vertex = str(os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "0")).strip() in {"1", "true", "True"}
    if use_vertex:
        project = str(os.environ.get("GOOGLE_CLOUD_PROJECT", "")).strip()
        location = str(os.environ.get("GOOGLE_CLOUD_LOCATION", "")).strip()
        if not project or project in {"your_project_id", "<your-google-cloud-project-id>"}:
            return False, "Vertex AI is enabled but GOOGLE_CLOUD_PROJECT is not set."
        if not location:
            return False, "Vertex AI is enabled but GOOGLE_CLOUD_LOCATION is not set."
        return True, ""

    api_key = str(os.environ.get("GOOGLE_API_KEY", "")).strip()
    if _gemini_api_key_is_placeholder(api_key):
        return (
            False,
            "Gemini API key is missing/invalid. Set GOOGLE_API_KEY in backend/adk_agent/gemini_agent/.env (Google AI Studio API key).",
        )
    return True, ""


def discover_exhibitions_path() -> Path:
    configured = os.environ.get("EXHIBEAT_EXHIBITIONS_PATH", "").strip()
    if configured:
        candidate = Path(configured)
        if not candidate.is_absolute():
            candidate = PROJECT_ROOT / candidate
        return candidate

    all_candidate = PROJECT_ROOT / "data" / "all_exhibitions.json"
    if all_candidate.exists():
        return all_candidate

    merged_candidate = PROJECT_ROOT / "data" / "exhibitions_merged.json"
    if merged_candidate.exists():
        return merged_candidate

    return PROJECT_ROOT / "exhibitions.json"


EXHIBITIONS_PATH = discover_exhibitions_path()
LEGAL_STAYS_PATH = PROJECT_ROOT / "data" / "legal_stays" / "legal_stays.json"
AI_SUMMARY_DB_PATH = PROJECT_ROOT / "data" / "ai_summaries.sqlite3"
EXHIBITION_TRANSLATIONS_PATH = PROJECT_ROOT / "data" / "exhibition_translations.json"
EXHIBITION_TRANSLATIONS_DIR = PROJECT_ROOT / "data" / "exhibition_translations"
logger.info(f"Project Root: {PROJECT_ROOT}")
logger.info(f"Exhibitions Path: {EXHIBITIONS_PATH}")

if not EXHIBITIONS_PATH.exists():
    logger.error(f"CRITICAL: {EXHIBITIONS_PATH} not found!")
    sys.exit(1)

app = FastAPI(title="ExhiBeat Recommender & Proxy API")
ensure_database_ready()

_legal_stays_cache: dict | None = None
_exhibitions_cache_by_path: dict[str, tuple[float, list[dict]]] = {}
_exhibition_translation_cache: dict[str, dict[tuple[str, str], str]] = {}
_exhibition_translation_cache_stamp: tuple[tuple[str, float], ...] | None = None


def load_legal_stays_dataset() -> dict:
    global _legal_stays_cache
    if _legal_stays_cache is not None:
        return _legal_stays_cache
    if not LEGAL_STAYS_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Legal stays dataset is not generated. Run scripts/prepare_legal_stays_dataset.py first.",
        )
    _legal_stays_cache = json.loads(LEGAL_STAYS_PATH.read_text(encoding="utf-8"))
    return _legal_stays_cache


def _resolve_exhibitions_path_for_locale(locale: str | None = None) -> Path:
    if not locale:
        return EXHIBITIONS_PATH
    normalized_locale = _normalize_locale(locale)
    if normalized_locale == "zh-TW":
        return EXHIBITIONS_PATH
    localized_candidate = PROJECT_ROOT / "data" / f"all_exhibitions_{normalized_locale}.json"
    if localized_candidate.exists():
        return localized_candidate
    return EXHIBITIONS_PATH


def load_exhibitions_dataset(locale: str | None = None) -> list[dict]:
    target_path = _resolve_exhibitions_path_for_locale(locale)
    if not target_path.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Exhibitions dataset missing: {target_path}",
        )
    current_mtime = target_path.stat().st_mtime
    cache_key = str(target_path)
    cached = _exhibitions_cache_by_path.get(cache_key)
    if cached and cached[0] == current_mtime:
        return cached[1]
    payload = json.loads(target_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Exhibitions dataset format is invalid.",
        )
    normalized_payload = [item for item in payload if isinstance(item, dict)]
    _exhibitions_cache_by_path[cache_key] = (current_mtime, normalized_payload)
    return normalized_payload


def _normalize_locale(locale: str) -> str:
    raw = str(locale or "").strip()
    if not raw:
        return "zh-TW"
    lowered = raw.lower()
    if lowered in {"zh", "zh-tw", "zh-hant", "zh_hant", "zh_tw"}:
        return "zh-TW"
    if lowered in {"zh-cn", "zh-hans", "zh_hans", "zh_cn"}:
        return "zh-CN"
    if "-" in raw:
        head, tail = raw.split("-", 1)
        return f"{head.lower()}-{tail.upper()}" if head.lower() == "zh" else f"{head.lower()}-{tail.lower()}"
    return lowered


def _translation_files_with_stamp() -> tuple[list[Path], tuple[tuple[str, float], ...]]:
    files: list[Path] = []
    if EXHIBITION_TRANSLATIONS_DIR.exists():
        files.extend(sorted(EXHIBITION_TRANSLATIONS_DIR.glob("exhibition_translations.*.json")))
    if EXHIBITION_TRANSLATIONS_PATH.exists():
        files.append(EXHIBITION_TRANSLATIONS_PATH)
    stamp = tuple((str(path), path.stat().st_mtime) for path in files)
    return files, stamp


def _load_split_translation_index() -> dict[str, dict[tuple[str, str], str]]:
    result: dict[str, dict[tuple[str, str], str]] = {}
    if not EXHIBITION_TRANSLATIONS_DIR.exists():
        return result
    for path in sorted(EXHIBITION_TRANSLATIONS_DIR.glob("exhibition_translations.*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        locale = _normalize_locale(str(payload.get("locale", "")))
        if not locale:
            continue
        bucket = result.setdefault(locale, {})
        entries = payload.get("entries", [])
        if not isinstance(entries, list):
            continue
        for row in entries:
            if not isinstance(row, dict):
                continue
            event_id = str(row.get("event_id", "")).strip()
            field = str(row.get("field", "")).strip()
            text = str(row.get("text", "")).strip()
            if event_id and field and text:
                bucket[(event_id, field)] = text
    return result


def _load_legacy_translation_index() -> dict[str, dict[tuple[str, str], str]]:
    if not EXHIBITION_TRANSLATIONS_PATH.exists():
        return {}
    payload = json.loads(EXHIBITION_TRANSLATIONS_PATH.read_text(encoding="utf-8"))
    locales = payload.get("locales", [])
    entries = payload.get("entries", [])
    if not isinstance(locales, list) or not isinstance(entries, list):
        return {}
    result: dict[str, dict[tuple[str, str], str]] = {
        _normalize_locale(str(locale)): {} for locale in locales
    }
    for row in entries:
        if not isinstance(row, dict):
            continue
        event_id = str(row.get("event_id", "")).strip()
        field = str(row.get("field", "")).strip()
        translations = row.get("translations", {})
        if not event_id or not field or not isinstance(translations, dict):
            continue
        for raw_locale, data in translations.items():
            locale = _normalize_locale(str(raw_locale))
            text = str((data or {}).get("text", "")).strip() if isinstance(data, dict) else ""
            status = str((data or {}).get("status", "")).strip() if isinstance(data, dict) else ""
            if text and status == "translated":
                result.setdefault(locale, {})[(event_id, field)] = text
    return result


def load_exhibition_translation_index() -> dict[str, dict[tuple[str, str], str]]:
    global _exhibition_translation_cache, _exhibition_translation_cache_stamp
    files, stamp = _translation_files_with_stamp()
    if _exhibition_translation_cache_stamp == stamp:
        return _exhibition_translation_cache
    if files and EXHIBITION_TRANSLATIONS_DIR.exists():
        _exhibition_translation_cache = _load_split_translation_index()
    else:
        _exhibition_translation_cache = _load_legacy_translation_index()
    _exhibition_translation_cache_stamp = stamp
    return _exhibition_translation_cache


def _localized_event_field(event_id: str, field: str, locale: str) -> str | None:
    normalized_locale = _normalize_locale(locale)
    if normalized_locale == "zh-TW":
        return None
    table = load_exhibition_translation_index().get(normalized_locale, {})
    translated = table.get((event_id, field))
    # Some translation files are seeded with empty placeholders.
    # Treat empty/whitespace text as missing and fallback to source text.
    if isinstance(translated, str) and translated.strip():
        return translated
    return None


def _translate_event_field(event_id: str, field: str, locale: str, fallback_text: str) -> str:
    translated = _localized_event_field(event_id, field, locale)
    if translated is not None:
        return translated
    return fallback_text


def list_available_tags() -> list[str]:
    tags: set[str] = set()
    for item in load_exhibitions_dataset():
        for raw in _extract_event_tags(item):
            mapped = _normalize_event_tag(str(raw))
            if not mapped:
                continue
            tags.add(mapped)
    return sorted(tags)


def list_available_tag_stats() -> list[dict[str, int | str]]:
    counts: dict[str, int] = {}
    for item in load_exhibitions_dataset():
        deduped_in_event: set[str] = set()
        for raw in _extract_event_tags(item):
            mapped = _normalize_event_tag(str(raw))
            if not mapped:
                continue
            deduped_in_event.add(mapped)
        for tag in deduped_in_event:
            counts[tag] = counts.get(tag, 0) + 1
    return [
        {"tag": tag, "count": count}
        for tag, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def get_optional_current_user(
    creds = Depends(bearer_scheme),
    db = Depends(get_db),
) -> User | None:
    if not creds:
        return None
    try:
        user_id = decode_token(creds.credentials)
    except HTTPException:
        return None
    user = db.get(User, user_id)
    if not user or not user.is_active:
        return None
    return user


def _user_preference_tags(user: User | None) -> list[str]:
    if not user:
        return []
    raw = getattr(user, "preference_tags", None)
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            return []
    if not isinstance(raw, list):
        return []
    tags = [str(tag).strip() for tag in raw if str(tag).strip()]
    # Deduplicate while preserving order.
    deduped: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        if tag in seen:
            continue
        seen.add(tag)
        deduped.append(tag)
    return deduped


def _recommendation_args_for_preferences(
    *,
    tags: list[str],
    top_k: int,
    cities: str = "",
    persona_name: str = "你的偏好",
) -> argparse.Namespace:
    return argparse.Namespace(
        exhibitions=str(EXHIBITIONS_PATH),
        top_k=top_k,
        date="",
        backend="fallback",
        blend_alpha=0.65,
        persona="",
        cities=cities,
        tags=",".join(tags),
        venue_focus="",
        free_only=False,
        popular=False,
        persona_name=persona_name,
        seed=42,
        components=16,
        epochs=30,
        threads=2,
    )


def _recommendation_args_for_home_feed(top_k: int) -> argparse.Namespace:
    return argparse.Namespace(
        exhibitions=str(EXHIBITIONS_PATH),
        top_k=top_k,
        date="",
        backend="fallback",
        blend_alpha=0.65,
        persona="",
        cities="",
        tags="",
        venue_focus="",
        free_only=False,
        popular=True,
        persona_name="熱門探索",
        seed=42,
        components=16,
        epochs=30,
        threads=2,
    )


def _home_diversity_venue_key(exhibition: dict) -> str:
    location = str(exhibition.get("location") or "").strip()
    venue = location.split(" • ", 1)[0].strip()
    if "臺北表演藝術中心" in venue or "台北表演藝術中心" in venue:
        return "臺北表演藝術中心"
    if "國立臺北藝術大學" in venue or "北藝大" in venue:
        return "國立臺北藝術大學"
    return venue or "unknown"


def _home_diversity_city_key(exhibition: dict) -> str:
    location = str(exhibition.get("location") or "").strip()
    if " • " in location:
        return location.rsplit(" • ", 1)[-1].strip() or "unknown"
    return "unknown"


def _home_diversity_tag_key(exhibition: dict) -> str:
    tags = exhibition.get("tags") or []
    if isinstance(tags, list) and tags:
        return str(tags[0]).strip() or "unknown"
    return "unknown"


def diversify_home_feed(ranked_exhibitions: list[dict]) -> list[dict]:
    remaining = list(enumerate(ranked_exhibitions))
    diversified: list[dict] = []
    venue_counts: dict[str, int] = {}
    city_counts: dict[str, int] = {}
    tag_counts: dict[str, int] = {}

    while remaining:
        best_position = 0
        best_adjusted_score = float("-inf")
        for position, (rank, exhibition) in enumerate(remaining):
            raw_score = exhibition.get("_meta", {}).get("score", 0) if isinstance(exhibition.get("_meta"), dict) else 0
            try:
                score = float(raw_score)
            except (TypeError, ValueError):
                score = 0.0
            venue_key = _home_diversity_venue_key(exhibition)
            city_key = _home_diversity_city_key(exhibition)
            tag_key = _home_diversity_tag_key(exhibition)
            adjusted_score = (
                score
                - venue_counts.get(venue_key, 0) * 0.85
                - city_counts.get(city_key, 0) * 0.08
                - tag_counts.get(tag_key, 0) * 0.05
                - rank * 0.000001
            )
            if adjusted_score > best_adjusted_score:
                best_adjusted_score = adjusted_score
                best_position = position

        _, selected = remaining.pop(best_position)
        diversified.append(selected)
        venue_counts[_home_diversity_venue_key(selected)] = venue_counts.get(_home_diversity_venue_key(selected), 0) + 1
        city_counts[_home_diversity_city_key(selected)] = city_counts.get(_home_diversity_city_key(selected), 0) + 1
        tag_counts[_home_diversity_tag_key(selected)] = tag_counts.get(_home_diversity_tag_key(selected), 0) + 1

    return diversified


def filter_legal_stays(
    *,
    q: str = "",
    city: str = "",
    town: str = "",
    class_label: str = "",
    service_status: int | None = 1,
) -> list[dict]:
    payload = load_legal_stays_dataset()
    stays = payload.get("stays", [])
    q_norm = q.strip().lower()
    city_norm = city.strip().lower()
    town_norm = town.strip().lower()
    class_norm = class_label.strip().lower()

    filtered = []
    for stay in stays:
        address = stay.get("address", {})
        if service_status is not None and stay.get("serviceStatus") != service_status:
            continue
        if city_norm and not _city_matches(city_norm, [str(address.get("city", "")), str(address.get("cityEn", ""))]):
            continue
        if town_norm and town_norm not in str(address.get("town", "")).lower():
            continue
        if class_norm and not any(class_norm in str(label).lower() for label in stay.get("classLabels", [])):
            continue
        if q_norm and q_norm not in str(stay.get("searchText", "")).lower():
            continue
        filtered.append(stay)
    return filtered


def _is_chinese_locale(locale: str) -> bool:
    return (locale or "").lower().startswith("zh")


def _normalize_city_keyword(text: str) -> str:
    return str(text or "").strip().lower().replace("台", "臺")


def _city_matches(query: str, candidates: list[str]) -> bool:
    q = _normalize_city_keyword(query)
    if not q:
        return True

    normalized = [_normalize_city_keyword(item) for item in candidates if item]
    if any(q in item for item in normalized):
        return True

    taipei_aliases = {"taipei", "taipei city", "臺北市", "台北市"}
    if q in taipei_aliases and any(city in taipei_aliases for city in normalized):
        return True
    return False


def localize_legal_stay(stay: dict, locale: str) -> dict:
    """
    zh* locales keep Chinese fields.
    en and all other non-zh locales fallback to English fields.
    """
    if _is_chinese_locale(locale):
        return stay

    localized = dict(stay)
    address = dict(stay.get("address", {}))

    localized["name"] = stay.get("nameEn") or stay.get("name", "")
    localized["description"] = stay.get("descriptionEn") or stay.get("description", "")
    localized["classLabels"] = stay.get("classLabelsEn") or stay.get("classLabels", [])
    localized["serviceStatusLabel"] = stay.get("serviceStatusLabelEn") or stay.get("serviceStatusLabel", "")
    address["city"] = address.get("cityEn") or address.get("city", "")
    address["town"] = address.get("townEn") or address.get("town", "")
    address["street"] = address.get("streetEn") or address.get("street", "")
    address["full"] = address.get("fullEn") or address.get("full", "")
    localized["address"] = address
    return localized


# ─── Image Pool ──────────────────────────────────────────────────────────────
PLACEHOLDER_IMAGES = [
    "https://images.unsplash.com/photo-1549490349-8643362247b5?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1514924013411-cbf25faa35bb?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1536924940846-227afb31e2a5?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1555529733-0e670560f7e1?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1561214115-f2f134cc4912?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1561059488-916d69792237?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1520095972714-909e91b038e5?w=600&auto=format&fit=crop&q=80",
    "https://images.unsplash.com/photo-1594736797933-d0501ba2fe65?w=600&auto=format&fit=crop&q=80",
]

# ─── AI Summarisation with Gemini (persistent cache) ─────────────────────────
_summary_table_ready: bool = False
_summary_cache_loaded: bool = False
_summary_cache_db_mtime: float = -1.0
_summary_exact_cache: dict[tuple[str, str, str], str] = {}
_summary_latest_cache: dict[tuple[str, str], str] = {}

def _is_meaningful_description(text: str) -> bool:
    if not text or len(text) < 15:
        return False
    non_space = text.replace(" ", "")
    if not non_space:
        return False
    ascii_count = sum(1 for c in non_space if ord(c) < 128)
    return ascii_count / len(non_space) <= 0.6


def _strip_summary_html(text: str) -> str:
    plain = _re.sub(r"<[^>]+>", " ", str(text or ""))
    return " ".join(plain.split()).strip()


def _normalize_full_description(text: str, max_chars: int = 4000) -> str:
    clean = _strip_summary_html(text)
    if len(clean) > max_chars:
        return clean[:max_chars].rstrip() + "…"
    return clean


def _naive_summary(description: str) -> str:
    clean = _strip_summary_html(description)
    fallback = clean[:50].rstrip() + ("…" if len(clean) > 50 else "")
    return fallback if _is_meaningful_description(fallback) else ""


def _summary_source_hash(title: str, description: str) -> str:
    source = f"{title.strip()}|{_strip_summary_html(description)}"
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _ensure_summary_table() -> None:
    global _summary_table_ready
    if _summary_table_ready:
        return
    AI_SUMMARY_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(AI_SUMMARY_DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_summaries (
              uid TEXT NOT NULL,
              locale TEXT NOT NULL DEFAULT 'zh-TW',
              source_hash TEXT NOT NULL,
              summary TEXT NOT NULL,
              model TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (uid, locale)
            )
            """
        )
        # Lightweight migration path for older DB snapshots without locale column.
        table_info = conn.execute("PRAGMA table_info(ai_summaries)").fetchall()
        col_names = {str(row[1]) for row in table_info if len(row) > 1}
        if "locale" not in col_names:
            conn.execute("ALTER TABLE ai_summaries RENAME TO ai_summaries_old")
            conn.execute(
                """
                CREATE TABLE ai_summaries (
                  uid TEXT NOT NULL,
                  locale TEXT NOT NULL DEFAULT 'zh-TW',
                  source_hash TEXT NOT NULL,
                  summary TEXT NOT NULL,
                  model TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY (uid, locale)
                )
                """
            )
            conn.execute(
                """
                INSERT INTO ai_summaries (uid, locale, source_hash, summary, model, updated_at)
                SELECT uid, 'zh-TW', source_hash, summary, model, updated_at
                FROM ai_summaries_old
                """
            )
            conn.execute("DROP TABLE ai_summaries_old")
    _summary_table_ready = True


def _load_summary_cache_if_needed() -> None:
    global _summary_cache_loaded, _summary_cache_db_mtime, _summary_exact_cache, _summary_latest_cache
    _ensure_summary_table()
    db_mtime = AI_SUMMARY_DB_PATH.stat().st_mtime if AI_SUMMARY_DB_PATH.exists() else -1.0
    if _summary_cache_loaded and _summary_cache_db_mtime == db_mtime:
        return
    exact: dict[tuple[str, str, str], str] = {}
    latest: dict[tuple[str, str], str] = {}
    with sqlite3.connect(AI_SUMMARY_DB_PATH) as conn:
        rows = conn.execute("SELECT uid, locale, source_hash, summary FROM ai_summaries").fetchall()
    for uid, locale, source_hash, summary in rows:
        uid_s = str(uid or "").strip()
        locale_s = _normalize_locale(str(locale or "zh-TW"))
        source_hash_s = str(source_hash or "").strip()
        summary_s = str(summary or "").strip()
        if not uid_s:
            continue
        if source_hash_s:
            exact[(uid_s, locale_s, source_hash_s)] = summary_s
        latest[(uid_s, locale_s)] = summary_s
    _summary_exact_cache = exact
    _summary_latest_cache = latest
    _summary_cache_db_mtime = db_mtime
    _summary_cache_loaded = True


def _load_summary_from_db(uid: str, locale: str, source_hash: str) -> str | None:
    _load_summary_cache_if_needed()
    return _summary_exact_cache.get((uid, _normalize_locale(locale), source_hash))


def _load_latest_summary(uid: str, locale: str) -> str | None:
    _load_summary_cache_if_needed()
    return _summary_latest_cache.get((uid, _normalize_locale(locale)))


def _summary_generation_environment() -> dict[str, object]:
    use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "0") == "1"
    return {
        "use_vertex": use_vertex,
        "google_api_key_set": bool(os.environ.get("GOOGLE_API_KEY", "").strip()),
        "google_cloud_project_set": bool(os.environ.get("GOOGLE_CLOUD_PROJECT", "").strip()),
        "google_cloud_location": os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        "gemini_model": os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-001"),
    }


def _assert_summary_generation_ready() -> dict[str, object]:
    env = _summary_generation_environment()
    if bool(env["use_vertex"]):
        if not bool(env["google_cloud_project_set"]):
            raise RuntimeError("GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_USE_VERTEXAI=1")
    else:
        if not bool(env["google_api_key_set"]):
            raise RuntimeError("GOOGLE_API_KEY is required for Gemini summarization")
    return env


def _summary_prompt_for_locale(locale: str, title: str, clean_description: str) -> str:
    normalized_locale = _normalize_locale(locale)
    description = clean_description[:4000]
    prompts = {
        "zh-TW": (
            "你是一位展演內容編輯。請根據 description 內容，"
            "以繁體中文撰寫約 200 字的摘要，要求清晰、具體、吸引人，"
            "可讀性高，避免空泛與重複。"
            "只輸出摘要內容本身，不要加標題、條列或多餘說明。\n"
            f"展覽名稱：{title}\n"
            f"description：{description}"
        ),
        "zh-CN": (
            "你是一位展演内容编辑。请根据 description 内容，"
            "以简体中文撰写约 200 字的摘要，要求清晰、具体、吸引人，"
            "可读性高，避免空泛与重复。"
            "只输出摘要内容本身，不要加标题、列表或多余说明。\n"
            f"展览名称：{title}\n"
            f"description：{description}"
        ),
        "en": (
            "You are an exhibition content editor. Based on the description, "
            "write a concise and engaging English summary in about 80-140 words. "
            "Be clear and specific, avoid generic filler, and output only the summary text.\n"
            f"Title: {title}\n"
            f"Description: {description}"
        ),
        "fr": (
            "Vous êtes rédacteur culturel spécialisé dans les expositions. À partir de la description, "
            "rédigez un résumé en français clair, précis et engageant d'environ 80 à 140 mots. "
            "Évitez les formules vagues et ne produisez que le résumé, sans titre ni liste.\n"
            f"Titre : {title}\n"
            f"Description : {description}"
        ),
        "ja": (
            "あなたは展覧会・舞台芸術の編集者です。description の内容をもとに、"
            "日本語で80〜140語程度の明確で具体的、魅力的な紹介文を書いてください。"
            "抽象的な表現や重複を避け、タイトルや箇条書きは付けず、本文だけを出力してください。\n"
            f"タイトル：{title}\n"
            f"description：{description}"
        ),
        "es": (
            "Eres redactor cultural especializado en exposiciones. A partir de la descripción, "
            "escribe un resumen en español claro, específico y atractivo de unas 80 a 140 palabras. "
            "Evita frases genéricas y entrega solo el resumen, sin título ni viñetas.\n"
            f"Título: {title}\n"
            f"Descripción: {description}"
        ),
        "pt": (
            "Você é um editor cultural especializado em exposições. Com base na descrição, "
            "escreva um resumo em português claro, específico e envolvente com cerca de 80 a 140 palavras. "
            "Evite generalidades e entregue apenas o texto do resumo, sem título nem listas.\n"
            f"Título: {title}\n"
            f"Descrição: {description}"
        ),
        "ar": (
            "أنت محرر ثقافي متخصص في المعارض والفعاليات. اعتمادا على الوصف، "
            "اكتب ملخصا عربيا واضحا ومحددا وجذابا من نحو 80 إلى 140 كلمة. "
            "تجنب العبارات العامة، وأخرج نص الملخص فقط دون عنوان أو نقاط.\n"
            f"العنوان: {title}\n"
            f"الوصف: {description}"
        ),
        "hi": (
            "आप प्रदर्शनियों और सांस्कृतिक कार्यक्रमों के संपादक हैं। description के आधार पर "
            "लगभग 80-140 शब्दों में स्पष्ट, विशिष्ट और आकर्षक हिंदी सारांश लिखें। "
            "सामान्य वाक्यों से बचें और केवल सारांश पाठ दें, कोई शीर्षक या सूची नहीं।\n"
            f"शीर्षक: {title}\n"
            f"description: {description}"
        ),
    }
    return prompts.get(normalized_locale, prompts["zh-TW"])


def _save_summary_to_db(uid: str, locale: str, source_hash: str, summary: str, model_name: str) -> None:
    _ensure_summary_table()
    normalized_locale = _normalize_locale(locale)
    with sqlite3.connect(AI_SUMMARY_DB_PATH) as conn:
        conn.execute(
            """
            INSERT INTO ai_summaries (uid, locale, source_hash, summary, model, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(uid, locale) DO UPDATE SET
              source_hash = excluded.source_hash,
              summary = excluded.summary,
              model = excluded.model,
              updated_at = excluded.updated_at
            """,
            (uid, normalized_locale, source_hash, summary, model_name),
        )
    _summary_exact_cache[(uid, normalized_locale, source_hash)] = summary
    _summary_latest_cache[(uid, normalized_locale)] = summary
    if AI_SUMMARY_DB_PATH.exists():
        # Keep mtime in sync so we don't need an immediate full reload.
        global _summary_cache_db_mtime, _summary_cache_loaded
        _summary_cache_db_mtime = AI_SUMMARY_DB_PATH.stat().st_mtime
        _summary_cache_loaded = True


def _generate_gemini_summary(title: str, description: str, locale: str = "zh-TW") -> tuple[str, str]:
    clean_description = _strip_summary_html(description)
    if not _is_meaningful_description(clean_description):
        return "", "none"

    from dotenv import load_dotenv
    env_path = Path(__file__).parent / "gemini_agent" / ".env"
    load_dotenv(env_path, override=False)

    env = _assert_summary_generation_ready()
    model_name = str(env["gemini_model"])
    use_vertex = bool(env["use_vertex"])
    normalized_locale = _normalize_locale(locale)
    prompt = _summary_prompt_for_locale(normalized_locale, title, clean_description)

    if use_vertex:
        import vertexai
        from vertexai.generative_models import GenerativeModel
        vertexai.init(
            project=os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        )
        model = GenerativeModel(model_name)
        response = model.generate_content(prompt)
        summary = (response.text or "").strip()
    else:
        api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(prompt)
            summary = (response.text or "").strip()
        except Exception:
            from google import genai as genai_client
            client = genai_client.Client(api_key=api_key)
            response = client.models.generate_content(model=model_name, contents=prompt)
            summary = (getattr(response, "text", "") or "").strip()

    summary = " ".join(summary.split())
    return summary, model_name


def _gemini_summarize(uid: str, title: str, description: str, locale: str = "zh-TW") -> str:
    normalized_locale = _normalize_locale(locale)
    source_hash = _summary_source_hash(title, description)
    cached = _load_summary_from_db(uid, normalized_locale, source_hash)
    if cached is not None:
        return cached
    try:
        summary, model_name = _generate_gemini_summary(title, description, normalized_locale)
        _save_summary_to_db(uid, normalized_locale, source_hash, summary, model_name)
        return summary
    except Exception as exc:
        logger.warning("Gemini summarisation failed for %s (%s): %s", uid, normalized_locale, exc)
        latest = _load_latest_summary(uid, normalized_locale)
        if latest is not None:
            return latest
        return _naive_summary(description)


def _normalize_existing_summary(summary: str) -> str:
    clean = _strip_summary_html(summary)
    if not clean:
        return ""
    if len(clean) > 50:
        clean = clean[:50].rstrip() + "…"
    return clean if _is_meaningful_description(clean) else ""


def _resolve_summary_for_response(
    *,
    uid: str,
    title: str,
    description: str,
    existing_summary: str = "",
    locale: str = "zh-TW",
) -> str:
    """
    Online path: only read precomputed summaries from DB cache.
    Never call Gemini in request flow to avoid long latency.
    """
    normalized_locale = _normalize_locale(locale)
    source_hash = _summary_source_hash(title, description)
    cached = _load_summary_from_db(uid, normalized_locale, source_hash)
    normalized_existing = _normalize_existing_summary(existing_summary)
    if cached is not None:
        return cached
    latest = _load_latest_summary(uid, normalized_locale)
    if latest is not None:
        return latest
    localized_existing = _localized_event_field(uid, "aiSummary", normalized_locale)
    if localized_existing is not None:
        return localized_existing
    if normalized_existing:
        if normalized_locale == "zh-TW":
            return normalized_existing
        return ""
    naive = _naive_summary(description)
    if normalized_locale == "zh-TW":
        return naive
    return ""

# ─── Helpers ─────────────────────────────────────────────────────────────────
def _pick_image(uid: str, raw_url: str) -> str:
    normalized = _normalize_image_url(raw_url)
    if normalized:
        return normalized
    h = int(hashlib.md5(uid.encode()).hexdigest(), 16)
    return PLACEHOLDER_IMAGES[h % len(PLACEHOLDER_IMAGES)]


def _normalize_image_url(raw_url: str) -> str:
    if not raw_url:
        return ""

    url = str(raw_url).strip()
    if not url:
        return ""

    # Common malformed payload from source data:
    # "https://cloud.culture.twhttps//cloud.culture.tw/..."
    url = _re.sub(
        r"^https?://cloud\.culture\.twhttps?//(?:cloud\.culture\.tw/)?",
        "https://cloud.culture.tw/",
        url,
        flags=_re.I,
    )
    url = _re.sub(
        r"^https?://cloud\.culture\.twhttps?://cloud\.culture\.tw/",
        "https://cloud.culture.tw/",
        url,
        flags=_re.I,
    )

    # Fix missing colon in scheme, e.g. "https//example.com/..."
    if url.startswith("https//"):
        url = "https://" + url[len("https//") :]
    elif url.startswith("http//"):
        url = "http://" + url[len("http//") :]

    # Protocol-relative URL
    if url.startswith("//"):
        url = "https:" + url

    # Relative path from culture host
    if url.startswith("/"):
        url = "https://cloud.culture.tw" + url

    parsed = urlparse(url)
    if parsed.scheme in {"http", "https"} and parsed.netloc:
        return url
    return ""

def _format_price(price_text: str, is_free: bool) -> str:
    if is_free:
        return "FREE"
    if not price_text:
        return "—"
    raw = str(price_text).strip()
    if not raw:
        return "—"

    # Source payloads occasionally contain mixed date/time fragments in the
    # price field (e.g. "500、2026、5、4、12、00..."). Prefer extracting only
    # recognizable currency expressions; otherwise avoid showing noisy numbers.
    clean = " ".join(raw.replace("\n", " ").split())
    lower = clean.lower()
    if any(keyword in lower for keyword in ("免費", "免票", "free", "free entry")):
        return "FREE"

    currency_patterns = [
        r"(?:nt\$|ntd|twd|新台幣)\s*\d{1,6}",
        r"\d{1,6}\s*元",
        r"\d{1,6}\s*[-~至]\s*\d{1,6}\s*元",
    ]
    extracted: list[str] = []
    for pattern in currency_patterns:
        matches = _re.findall(pattern, clean, flags=_re.I)
        for match in matches:
            value = " ".join(str(match).split())
            if value and value not in extracted:
                extracted.append(value)
        if extracted:
            break

    if extracted:
        joined = " / ".join(extracted[:2])
        return joined[:30] + ("…" if len(joined) > 30 else "")

    # If the field is mostly numeric fragments and looks like date/time tokens,
    # don't surface it as price.
    numeric_tokens = _re.findall(r"\d+", clean)
    has_year_like = any(len(token) == 4 and token.startswith("20") for token in numeric_tokens)
    if has_year_like and len(numeric_tokens) >= 4:
        first_number = next((token for token in numeric_tokens if token and not (len(token) == 4 and token.startswith("20"))), None)
        if first_number:
            return f"NT${first_number}"
        return clean[:30] + ("…" if len(clean) > 30 else "")

    return clean[:30] + ("…" if len(clean) > 30 else "")

def map_event_to_frontend_exhibition(rec: dict, locale: str = "zh-TW") -> dict:
    uid   = rec["uid"]
    title = rec["title"]
    image_url  = _pick_image(uid, rec.get("image_url", ""))
    description = str(rec.get("description", "") or "")
    full_description = _normalize_full_description(
        str(rec.get("description_full") or rec.get("descriptionFilterHtml") or description)
    )
    existing_summary = str(
        rec.get("ai_summary")
        or rec.get("aiSummary")
        or rec.get("summary")
        or ""
    )
    ai_summary = _resolve_summary_for_response(
        uid=uid,
        title=title,
        description=description,
        existing_summary=existing_summary,
        locale=locale,
    )
    normalized_location_name = rec.get("location_name", "")
    normalized_city = rec.get("city", "")
    # Data fix: these two TIFA programs are performed at 國家戲劇院.
    if title in {
        "2026TIFA 柏林德意志劇院 ✕ 克里斯多福．魯賓《不過就是世界末日》",
        "2026TIFA 克莉絲朵．派特 ✕ 強納森．楊《集會遊戲》",
    }:
        normalized_location_name = "國家戲劇院"
        normalized_city = "台北市"

    translated_title = _translate_event_field(uid, "title", locale, title)
    translated_location_name = _translate_event_field(uid, "locationName", locale, normalized_location_name)

    date_range    = rec.get("date_range", "")
    end_date_str  = date_range.split(" -> ")[-1] if " -> " in date_range else ""
    edit_date_str = rec.get("edit_modify_date", "")  # "YYYY/MM/DD HH:MM:SS"

    raw_images = rec.get("all_images", [])
    all_images = (
        [u for u in (_normalize_image_url(v) for v in raw_images) if u]
        if isinstance(raw_images, list)
        else []
    )

    source_tags = rec.get("source_tags", [])
    if isinstance(source_tags, list):
        normalized_source_tags = []
        for tag in source_tags:
            mapped = _normalize_event_tag(str(tag))
            if mapped:
                normalized_source_tags.append(mapped)
        normalized_source_tags = list(dict.fromkeys(normalized_source_tags))
    else:
        normalized_source_tags = []
    display_tags = normalized_source_tags if normalized_source_tags else rec.get("reasons", ["推薦活動"])[:2]

    return {
        "id":         uid,
        "title":      translated_title,
        "price":      _format_price(rec.get("price_text", ""), rec.get("is_free", False)),
        "dateStr":    date_range,
        "location":   f"{translated_location_name} • {normalized_city}",
        "aiSummary":  ai_summary,
        "fullDescription": full_description,
        "tags":       display_tags,
        "imageUrl":   image_url,
        "isFavorite": False,
        "_meta": {
            "isFree":          rec.get("is_free", False),
            "endDate":         end_date_str,
            "editModifyDate":  edit_date_str,
            "score":           rec.get("score", 0),
            "allImages":       all_images,
        },
    }


def _extract_show_info(event: dict) -> dict:
    show_info = event.get("showInfo", [])
    if isinstance(show_info, list) and show_info and isinstance(show_info[0], dict):
        return show_info[0]
    return {}


def _format_raw_event_date(event: dict) -> str:
    start = str(event.get("startDate", "")).strip()
    end = str(event.get("endDate", "")).strip()
    if start and end:
        return f"{start} -> {end}"
    return start or end or "日期待確認"


def _normalize_event_tag(raw_value: str, *, source_key: str = "") -> str | None:
    value = str(raw_value or "").strip()
    if not value:
        return None
    key = str(source_key or "").strip()
    normalized = value if value.startswith("#") else f"#{value}"
    normalized = normalized.replace(" ", "")
    normalized = _re.sub(r"^#(?:臺|台)北市", "#", normalized)

    # Ignore placeholder-style tags that do not represent user-facing categories.
    if any(token in normalized for token in ("無折扣", "未提供", "無資料", "未知", "待確認")):
        return None

    key_map: dict[str, dict[str, str | None]] = {
        "價位": {
            "#低": "#低價位",
            "#中": "#中價位",
            "#高": "#高價位",
            "#免費": "#免費",
        },
        "時間": {
            "#早": "#早上",
            "#中": "#中午",
            "#晚": "#晚上",
        },
        "折扣": {
            "#折扣中": "#打折中",
            "#打折中": "#打折中",
        },
        "室內室外": {
            "#室內": "#室內",
            "#室外": "#室外",
            "#室內外": "#室內外",
        },
    }
    if key in key_map:
        mapped = key_map[key].get(normalized)
        if mapped:
            return mapped
        if normalized.endswith("區"):
            return normalized
        return None

    generic_map: dict[str, str | None] = {
        "#低": "#低價位",
        "#中": "#中價位",
        "#高": "#高價位",
        "#早": "#早上",
        "#晚": "#晚上",
        "#折扣中": "#打折中",
        "#打折中": "#打折中",
        "#室內": "#室內",
        "#室外": "#室外",
        "#室內外": "#室內外",
        "#免費": "#免費",
        "#未提供": None,
    }
    mapped = generic_map.get(normalized, normalized)
    return mapped


def _extract_taipei_district_tag(event: dict) -> str | None:
    show = _extract_show_info(event)
    text_parts = [
        str(show.get("location", "")),
        str(show.get("locationName", "")),
        str(event.get("title", "")),
    ]
    text = " ".join(text_parts)
    match = _re.search(r"(?:臺|台)北市\s*([^\s,，。]{1,6}區)", text)
    if not match:
        return None
    district = match.group(1).strip()
    if not district or district in {"台北市", "臺北市"}:
        return None
    return f"#{district}"


def _extract_event_tags(event: dict) -> list[str]:
    tags: list[str] = []
    raw_tags = event.get("tag", [])
    if not raw_tags:
        raw_tags = event.get("tags", [])
    if isinstance(raw_tags, list):
        tags = [str(tag).strip() for tag in raw_tags if str(tag).strip()]
    elif isinstance(raw_tags, str) and raw_tags.strip():
        tags = [raw_tags.strip()]

    normalized: list[str] = []
    for tag in tags:
        mapped = _normalize_event_tag(tag)
        if mapped:
            normalized.append(mapped)

    derived = event.get("derivedTags", {})
    if isinstance(derived, dict):
        for raw_key, raw_value in derived.items():
            mapped = _normalize_event_tag(str(raw_value), source_key=str(raw_key))
            if mapped:
                normalized.append(mapped)

    district_tag = _extract_taipei_district_tag(event)
    if district_tag:
        normalized.append(district_tag)

    # Deduplicate while preserving display order.
    return list(dict.fromkeys(normalized))


def map_raw_event_to_frontend_exhibition(event: dict, locale: str = "zh-TW") -> dict:
    uid = str(event.get("UID", "")).strip()
    title = str(event.get("title", "")).strip() or "未命名展演"
    show = _extract_show_info(event)
    location_name = str(show.get("locationName", "")).strip() or str(show.get("location", "")).strip()
    location = location_name or "地點待確認"
    date_range = _format_raw_event_date(event)
    description = str(event.get("descriptionFilterHtml", "")).strip()
    full_description = _normalize_full_description(
        str(event.get("description") or event.get("descriptionFilterHtml") or "")
    )
    price_raw = str(show.get("price", "")).strip() or str(event.get("price", "")).strip()
    normalized_tags = _extract_event_tags(event)

    image_url = _pick_image(uid or title, str(event.get("imageUrl", "")).strip())
    all_images = [image_url] if image_url else []
    is_free = any(k in price_raw.lower() for k in ["free", "免費", "免票", "免收費"])
    summary_uid = uid or hashlib.md5(title.encode("utf-8")).hexdigest()
    existing_summary = str(
        event.get("aiSummary")
        or event.get("ai_summary")
        or event.get("summary")
        or event.get("description")
        or ""
    )
    ai_summary = _resolve_summary_for_response(
        uid=summary_uid,
        title=title,
        description=description,
        existing_summary=existing_summary,
        locale=locale,
    )
    end_date = str(event.get("endDate", "")).strip()

    event_id = uid or hashlib.md5(title.encode("utf-8")).hexdigest()
    translated_title = _translate_event_field(event_id, "title", locale, title)
    translated_location = _translate_event_field(event_id, "locationName", locale, location)

    return {
        "id": event_id,
        "title": translated_title,
        "price": _format_price(price_raw, is_free),
        "dateStr": date_range,
        "location": translated_location,
        "aiSummary": ai_summary,
        "fullDescription": full_description,
        "tags": normalized_tags,
        "imageUrl": image_url,
        "isFavorite": False,
        "_meta": {
            "isFree": is_free,
            "endDate": end_date,
            "editModifyDate": str(event.get("editModifyDate", "")).strip(),
            "score": 0,
            "allImages": all_images,
        },
    }

# ─── Recommender ─────────────────────────────────────────────────────────────
def get_recommendations_for_persona(persona_id: str, top_k: int = 6, locale: str = "zh-TW") -> list[dict]:
    persona_map = {
        "taipei_after_work":  {"cities": "台北市,新北市",         "tags": "art,photogenic,culture"},
        "history_nerd":        {"cities": "台中市,台南市,高雄市,基隆市",  "tags": "history,culture,indigenous"},
        "free_city_explorer":  {"cities": "台北市,新北市,基隆市,桃園市", "tags": "culture,photogenic,general", "free": True},
    }
    p = persona_map.get(persona_id, {"cities": "台北市"})

    args = argparse.Namespace(
        exhibitions=str(EXHIBITIONS_PATH),
        top_k=top_k,
        date="",
        backend="fallback",
        blend_alpha=0.65,
        persona="",
        cities=p.get("cities", ""),
        tags=p.get("tags", ""),
        venue_focus="",
        free_only=p.get("free", False),
        popular=False,
        persona_name="探索者",
        seed=42,
        components=16,
        epochs=30,
        threads=2,
    )
    payload = run_demo(args)
    results = payload.get("results", [])
    if not results:
        return []
    recs = results[0].get("recommendations", [])
    return [map_event_to_frontend_exhibition(r, locale=locale) for r in recs]


def get_recommendations_for_user(
    user: User | None, top_k: int = 6, cities: str = "", locale: str = "zh-TW"
) -> list[dict]:
    tags = _user_preference_tags(user)
    if not tags:
        return []
    payload = run_demo(
        _recommendation_args_for_preferences(
            tags=tags,
            top_k=top_k,
            cities=cities,
            persona_name=user.display_name if user else "你的偏好",
        )
    )
    results = payload.get("results", [])
    if not results:
        return []
    recs = results[0].get("recommendations", [])
    return [map_event_to_frontend_exhibition(r, locale=locale) for r in recs]
# ─── API Endpoints ────────────────────────────────────────────────────────────
@app.get("/api/recommendations/home")
async def get_home_recommendations(
    limit: int = Query(18, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    locale: str = Query("zh-TW"),
    current_user: User | None = Depends(get_optional_current_user),
):
    normalized_locale = _normalize_locale(locale)
    if _user_preference_tags(current_user):
        personalized = get_recommendations_for_user(
            current_user, top_k=offset + limit, locale=normalized_locale
        )
        if not personalized:
            personalized = get_recommendations_for_persona(
                "taipei_after_work", top_k=offset + limit, locale=normalized_locale
            )
        return {
            "exhibitions": personalized[offset : offset + limit],
            "offset": offset,
            "limit": limit,
            "total": len(personalized),
            "hasMore": offset + limit < len(personalized),
            "personalized": True,
        }
    all_events = load_exhibitions_dataset(normalized_locale)
    total = len(all_events)
    page_events = all_events[offset : offset + limit]
    exhibitions = [map_raw_event_to_frontend_exhibition(event, locale=normalized_locale) for event in page_events]
    return {
        "exhibitions": exhibitions,
        "offset": offset,
        "limit": limit,
        "total": total,
        "hasMore": offset + limit < total,
        "personalized": False,
    }


@app.get("/api/tags")
async def get_available_tags():
    return {"tags": list_available_tags()}


@app.get("/api/tags/stats")
async def get_available_tag_stats():
    return {"tags": list_available_tag_stats()}


@app.get("/api/recommendations/collection/more")
async def get_more_collection_recommendations(
    locale: str = Query("zh-TW"),
    current_user: User | None = Depends(get_optional_current_user),
):
    normalized_locale = _normalize_locale(locale)
    sidebar = get_recommendations_for_user(current_user, 9, locale=normalized_locale) or get_recommendations_for_persona(
        "free_city_explorer", 9, locale=normalized_locale
    )
    return {"recommendations": [
        {"id": s["id"], "title": s["title"], "tag": s["tags"][0] if s["tags"] else "熱門活動",
         "location": s["location"], "imageUrl": s["imageUrl"]}
        for s in sidebar
    ]}

@app.get("/api/recommendations/collection")
async def get_collection_recommendations(
    locale: str = Query("zh-TW"),
    current_user: User | None = Depends(get_optional_current_user),
):
    normalized_locale = _normalize_locale(locale)
    exhibitions = get_recommendations_for_user(current_user, 4, locale=normalized_locale) or get_recommendations_for_persona(
        "history_nerd", 4, locale=normalized_locale
    )
    sidebar = get_recommendations_for_user(current_user, 3, locale=normalized_locale) or get_recommendations_for_persona(
        "free_city_explorer", 3, locale=normalized_locale
    )
    return {
        "collectionExhibitions": exhibitions,
        "recommendations": [
            {"id": s["id"], "title": s["title"], "tag": s["tags"][0] if s["tags"] else "熱門活動",
             "location": s["location"], "imageUrl": s["imageUrl"]}
            for s in sidebar
        ],
    }


@app.get("/api/legal-stays")
async def list_legal_stays(
    q: str = "",
    city: str = "",
    town: str = "",
    class_label: str = Query("", alias="class"),
    service_status: int = Query(1, ge=0, le=3),
    locale: str = Query("zh-TW"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    dataset = load_legal_stays_dataset()
    filtered = filter_legal_stays(
        q=q,
        city=city,
        town=town,
        class_label=class_label,
        service_status=None if service_status == 0 else service_status,
    )
    localized = [localize_legal_stay(stay, locale) for stay in filtered[offset : offset + limit]]
    return {
        "metadata": dataset.get("metadata", {}),
        "total": len(filtered),
        "offset": offset,
        "limit": limit,
        "locale": locale,
        "stays": localized,
    }


@app.get("/api/legal-stays/geojson")
async def list_legal_stays_geojson(
    q: str = "",
    city: str = "",
    town: str = "",
    class_label: str = Query("", alias="class"),
    service_status: int = Query(1, ge=0, le=3),
    locale: str = Query("zh-TW"),
    limit: int = Query(1000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    dataset = load_legal_stays_dataset()
    filtered_all = filter_legal_stays(
        q=q,
        city=city,
        town=town,
        class_label=class_label,
        service_status=None if service_status == 0 else service_status,
    )
    filtered = [localize_legal_stay(stay, locale) for stay in filtered_all[offset : offset + limit]]
    return {
        "type": "FeatureCollection",
        "metadata": {
            **dataset.get("metadata", {}),
            "total": len(filtered_all),
            "offset": offset,
            "limit": limit,
            "locale": locale,
        },
        "features": [
            {
                "type": "Feature",
                "id": stay["id"],
                "geometry": {
                    "type": "Point",
                    "coordinates": [stay["location"]["lng"], stay["location"]["lat"]],
                },
                "properties": {
                    "id": stay["id"],
                    "licenseNumber": stay["licenseNumber"],
                    "name": stay["name"],
                    "classLabels": stay["classLabels"],
                    "serviceStatus": stay["serviceStatus"],
                    "serviceStatusLabel": stay["serviceStatusLabel"],
                    "city": stay["address"]["city"],
                    "town": stay["address"]["town"],
                    "address": stay["address"]["full"],
                    "lowestPrice": stay["priceRange"]["lowest"],
                    "ceilingPrice": stay["priceRange"]["ceiling"],
                    "totalRooms": stay["totalRooms"],
                    "website": stay["urls"]["website"],
                    "updateTime": stay["updateTime"],
                },
            }
            for stay in filtered
        ],
    }


@app.post("/api/auth/register", response_model=TokenResponse)
async def register(payload: RegisterRequest, db=Depends(get_db)):
    normalized_email = normalize_email(payload.email)
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        id=str(uuid.uuid4()),
        email=normalized_email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        preference_tags=json.dumps(payload.preference_tags, ensure_ascii=False),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token, expires_in = create_access_token(user.id)
    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserResponse.from_orm_user(user),
    )


@app.post("/api/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db=Depends(get_db)):
    normalized_email = normalize_email(payload.email)
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token, expires_in = create_access_token(user.id)
    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserResponse.from_orm_user(user),
    )


@app.get("/api/auth/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse.from_orm_user(current_user)

# ─── Favorites (requires auth) ───────────────────────────────────────────────
def _favorite_to_response(fav: Favorite) -> FavoriteResponse:
    try:
        payload = json.loads(fav.payload or "{}")
        if not isinstance(payload, dict):
            payload = {}
    except json.JSONDecodeError:
        payload = {}
    return FavoriteResponse(
        exhibition_id=fav.exhibition_id,
        payload=payload,
        created_at=fav.created_at,
    )


@app.get("/api/favorites", response_model=list[FavoriteResponse])
async def list_favorites(
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    favs = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id)
        .order_by(Favorite.created_at.desc())
        .all()
    )
    return [_favorite_to_response(f) for f in favs]


@app.post("/api/favorites", response_model=FavoriteResponse)
async def add_favorite(
    payload: FavoriteCreateRequest,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    existing = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id, Favorite.exhibition_id == payload.exhibition_id)
        .first()
    )
    if existing:
        existing.payload = json.dumps(payload.payload, ensure_ascii=False)
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return _favorite_to_response(existing)

    fav = Favorite(
        user_id=current_user.id,
        exhibition_id=payload.exhibition_id,
        payload=json.dumps(payload.payload, ensure_ascii=False),
    )
    db.add(fav)
    db.commit()
    db.refresh(fav)
    return _favorite_to_response(fav)


@app.delete("/api/favorites/{exhibition_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_favorite(
    exhibition_id: str,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    fav = (
        db.query(Favorite)
        .filter(Favorite.user_id == current_user.id, Favorite.exhibition_id == exhibition_id)
        .first()
    )
    if fav:
        db.delete(fav)
        db.commit()
    return None

# ─── ADK Reverse Proxy ────────────────────────────────────────────────────────
ADK_PORT = int(os.environ.get("ADK_PORT", "8001"))
ADK_HOST = f"http://127.0.0.1:{ADK_PORT}"


_REPLY_LANGUAGE_NAMES = {
    "zh-TW": "Traditional Chinese",
    "zh-CN": "Simplified Chinese",
    "en": "English",
    "fr": "French",
    "ja": "Japanese",
    "es": "Spanish",
    "pt": "Portuguese",
    "ar": "Arabic",
    "hi": "Hindi",
}


def _normalize_optional_locale(locale: str) -> str:
    raw = str(locale or "").strip()
    return _normalize_locale(raw) if raw else ""


def _preferred_reply_language(text: str, locale: str = "") -> str:
    normalized_locale = _normalize_optional_locale(locale)
    if normalized_locale in _REPLY_LANGUAGE_NAMES:
        return normalized_locale
    cjk_count = len(_re.findall(r"[\u4e00-\u9fff]", text))
    latin_count = len(_re.findall(r"[A-Za-z]", text))
    if latin_count >= 3 and cjk_count == 0:
        return "en"
    if cjk_count > 0:
        return "zh-TW"
    return ""


def _reply_language_hint(locale: str) -> str:
    normalized_locale = _normalize_locale(locale)
    language_name = _REPLY_LANGUAGE_NAMES.get(normalized_locale)
    if not language_name:
        return ""
    if normalized_locale == "zh-TW":
        return "\n\n[回覆語言指示：請全程使用繁體中文回覆。]"
    if normalized_locale == "zh-CN":
        return "\n\n[回复语言指示：请全程使用简体中文回复。]"
    return (
        f"\n\n[Reply language instruction: The current interface language is {language_name}. "
        f"Reply in {language_name} only. Keep original Chinese exhibition titles, venue names, "
        "and addresses only when there is no localized data, but all explanations, labels, "
        "summaries, and follow-up questions must use the interface language.]"
    )


def _extract_run_request_locale(body_bytes: bytes) -> str:
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        return ""
    if not isinstance(payload, dict):
        return ""
    return _normalize_optional_locale(str(payload.get("locale") or payload.get("lang") or ""))


def _inject_reply_language_hint(body_bytes: bytes) -> bytes:
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        return body_bytes
    if not isinstance(payload, dict):
        return body_bytes

    request_locale = _normalize_optional_locale(str(payload.pop("locale", "") or payload.pop("lang", "")))

    message = payload.get("newMessage") or payload.get("new_message") or {}
    parts = message.get("parts") if isinstance(message, dict) else None
    if not isinstance(parts, list):
        return json.dumps(payload, ensure_ascii=False).encode("utf-8") if request_locale else body_bytes

    text_chunks = [part.get("text", "") for part in parts if isinstance(part, dict)]
    latest_text = "\n".join(chunk for chunk in text_chunks if chunk).strip()
    language = _preferred_reply_language(latest_text, request_locale)
    if not language:
        return json.dumps(payload, ensure_ascii=False).encode("utf-8") if request_locale else body_bytes

    hint = _reply_language_hint(language)
    if not hint:
        return json.dumps(payload, ensure_ascii=False).encode("utf-8") if request_locale else body_bytes

    for part in reversed(parts):
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            if "Reply language instruction:" in part["text"] or "回覆語言指示：" in part["text"]:
                return json.dumps(payload, ensure_ascii=False).encode("utf-8")
            part["text"] += hint
            return json.dumps(payload, ensure_ascii=False).encode("utf-8")

    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _extract_latest_user_text_from_run_request(body_bytes: bytes) -> str:
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        return ""
    message = payload.get("newMessage") or payload.get("new_message") or {}
    if not isinstance(message, dict):
        return ""
    parts = message.get("parts")
    if not isinstance(parts, list):
        return ""
    texts = [str(part.get("text", "")).strip() for part in parts if isinstance(part, dict)]
    return "\n".join(text for text in texts if text).strip()


def _is_recommendation_intent(text: str) -> bool:
    normalized = (text or "").lower()
    if not normalized:
        return False
    keywords = (
        "推薦",
        "推荐",
        "rec",
        "recommend",
        "suggest",
        "展覽",
        "展演",
        "活動",
        "event",
        "exhibition",
    )
    return any(keyword in normalized for keyword in keywords) and any(
        keyword in normalized for keyword in ("推薦", "推荐", "rec", "recommend", "suggest")
    )


def _is_itinerary_intent(text: str) -> bool:
    normalized = (text or "").lower()
    if not normalized:
        return False
    itinerary_keywords = (
        "行程",
        "規劃",
        "规划",
        "itinerary",
        "route",
        "schedule",
        "timeline",
        "交通",
        "時間安排",
        "注意事項",
    )
    if any(keyword in normalized for keyword in itinerary_keywords):
        return True
    # Explicit list-to-plan prompt pattern used by collection prefill.
    return "請根據以下" in (text or "") and "行程清單" in (text or "")


def _is_list_itinerary_prompt(text: str) -> bool:
    raw = (text or "").strip()
    if not raw:
        return False
    return ("請根據以下" in raw and "行程清單" in raw) and bool(
        _re.search(r"(^|\n)\s*\d+\.\s*\[(展演|旅宿)\]", raw)
    )


def _extract_list_items_from_prompt(text: str) -> list[dict[str, str]]:
    lines = [line.strip() for line in (text or "").splitlines()]
    items: list[dict[str, str]] = []
    current: dict[str, str] | None = None

    for line in lines:
        if not line:
            continue
        header = _re.match(r"^\s*(\d+)\.\s*\[(展演|旅宿)\]\s*(.+)$", line)
        if header:
            if current:
                items.append(current)
            current = {
                "kind": "event" if header.group(2) == "展演" else "stay",
                "title": header.group(3).strip(),
            }
            continue
        if not current:
            continue
        field = _re.match(r"^(地點|地址|檔期|日期|價格|票價)[：:]\s*(.+)$", line)
        if not field:
            continue
        key_map = {
            "地點": "location",
            "地址": "address",
            "檔期": "date",
            "日期": "date",
            "價格": "price",
            "票價": "price",
        }
        mapped = key_map.get(field.group(1))
        if mapped:
            current[mapped] = field.group(2).strip()

    if current:
        items.append(current)
    return items


def _inject_list_itinerary_payload(run_response_bytes: bytes, latest_user_text: str = "") -> bytes:
    if not _is_list_itinerary_prompt(latest_user_text):
        return run_response_bytes
    list_items = _extract_list_items_from_prompt(latest_user_text)
    if not list_items:
        return run_response_bytes

    try:
        payload = json.loads(run_response_bytes.decode("utf-8"))
    except Exception:
        return run_response_bytes
    if not isinstance(payload, list) or not payload:
        return run_response_bytes

    list_name_match = _re.search(r"「([^」]+)」", latest_user_text or "")
    list_name = list_name_match.group(1).strip() if list_name_match else "行程清單"

    itinerary: list[dict[str, object]] = []
    base_hour = 10
    for idx, item in enumerate(list_items):
        start_hour = min(base_hour + idx * 2, 21)
        end_hour = min(start_hour + (2 if item.get("kind") == "event" else 10), 23)
        itinerary.append(
            {
                "id": f"list_item_{idx + 1}",
                "type": "event" if item.get("kind") == "event" else "stay",
                "title": item.get("title", "").strip(),
                "time_range": f"{start_hour:02d}:00 - {end_hour:02d}:00",
                "estimated_stay_minutes": 120 if item.get("kind") == "event" else 600,
                "reason": "此站點來自你提供的行程清單。",
                "venue_name": item.get("location", "").strip() or item.get("address", "").strip(),
                "address": item.get("address", "").strip() or item.get("location", "").strip(),
                "date": item.get("date", "").strip(),
                "price": item.get("price", "").strip(),
                "travel_mode": "步行/大眾運輸",
                "estimated_travel_minutes": 25 if idx > 0 else 0,
                "travel_summary": "此段交通時間為估算值，建議出發前再確認即時路線。",
            }
        )

    itinerary_payload = {
        "date": "",
        "summary": f"以下為根據「{list_name}」清單整理的行程草案，共 {len(itinerary)} 站。",
        "itinerary": itinerary,
    }

    target = next((item for item in reversed(payload) if isinstance(item, dict)), None)
    if not isinstance(target, dict):
        return run_response_bytes
    target["itinerary_payload"] = itinerary_payload
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _is_accommodation_intent(text: str) -> bool:
    normalized = (text or "").lower()
    if not normalized:
        return False
    return any(
        keyword in normalized
        for keyword in ("住宿", "旅宿", "飯店", "酒店", "hotel", "accommodation", "stay", "hostel")
    )


def _extract_taipei_town_from_text(text: str) -> str:
    normalized = str(text or "").strip().lower().replace("臺", "台")
    if not normalized:
        return ""
    town_aliases: dict[str, tuple[str, ...]] = {
        "中正區": ("中正區", "zhongzheng", "zhong zheng"),
        "大同區": ("大同區", "datong", "da tong"),
        "中山區": ("中山區", "zhongshan", "zhong shan"),
        "松山區": ("松山區", "songshan", "song shan"),
        "大安區": ("大安區", "daan", "da an"),
        "萬華區": ("萬華區", "wanhua", "wan hua"),
        "信義區": ("信義區", "xinyi", "xin yi"),
        "士林區": ("士林區", "shilin", "shi lin"),
        "北投區": ("北投區", "beitou", "bei tou"),
        "內湖區": ("內湖區", "neihu", "nei hu"),
        "南港區": ("南港區", "nangang", "nan gang"),
        "文山區": ("文山區", "wenshan", "wen shan"),
    }
    for town, aliases in town_aliases.items():
        if any(alias in normalized for alias in aliases):
            return town
    return ""


def _is_taipei_location_text(text: str) -> bool:
    normalized = str(text or "").lower().replace("臺", "台")
    return "台北" in normalized or "taipei" in normalized


def _fallback_recommendation_events(limit: int = 6, locale: str = "zh-TW") -> list[dict]:
    normalized_locale = _normalize_locale(locale)
    try:
        recs = get_recommendations_for_persona("taipei_after_work", top_k=limit, locale=normalized_locale)
    except Exception:
        return []
    events: list[dict] = []
    for rec in recs:
        event_id = str(rec.get("id") or "").strip()
        title = str(rec.get("title") or "").strip()
        if not event_id or not title:
            continue
        reason = ""
        tags = rec.get("tags")
        if isinstance(tags, list):
            reason = "、".join(str(tag).strip() for tag in tags if str(tag).strip())
        events.append(
            {
                "id": event_id,
                "title": title,
                "dateStr": str(rec.get("dateStr") or "日期待確認"),
                "location": str(rec.get("location") or "地點待確認"),
                "imageUrl": str(rec.get("imageUrl") or ""),
                "reason": reason,
            }
        )
    return events


def _fallback_event_cards_for_text(
    text: str,
    limit: int = 6,
    current_user: User | None = None,
    locale: str = "zh-TW",
) -> list[dict]:
    normalized_locale = _normalize_locale(locale)
    target_town = _extract_taipei_town_from_text(text)
    cards: list[dict] = []
    seen_ids: set[str] = set()

    if target_town:
        town_matches: list[dict] = []
        for event in load_exhibitions_dataset(normalized_locale):
            if not isinstance(event, dict):
                continue
            mapped = map_raw_event_to_frontend_exhibition(event, locale=normalized_locale)
            search_text = " ".join(
                [
                    str(mapped.get("title") or ""),
                    str(mapped.get("location") or ""),
                    " ".join(str(tag) for tag in mapped.get("tags", []) if tag),
                    str(event.get("descriptionFilterHtml") or ""),
                ]
            )
            if target_town not in search_text:
                continue
            event_id = str(mapped.get("id") or "").strip()
            title = str(mapped.get("title") or "").strip()
            if not event_id or not title or event_id in seen_ids:
                continue
            seen_ids.add(event_id)
            town_matches.append(
                {
                    "id": event_id,
                    "title": title,
                    "dateStr": str(mapped.get("dateStr") or "日期待確認"),
                    "location": str(mapped.get("location") or "地點待確認"),
                    "imageUrl": str(mapped.get("imageUrl") or ""),
                    "reason": f"符合地區條件：{target_town}",
                    "itemType": "event",
                }
            )
            if len(town_matches) >= limit:
                break
        cards.extend(town_matches)

    if len(cards) < limit:
        for event in _fallback_recommendation_events(limit=limit * 2, locale=normalized_locale):
            event_id = str(event.get("id") or "").strip()
            if not event_id or event_id in seen_ids:
                continue
            seen_ids.add(event_id)
            cards.append(event)
            if len(cards) >= limit:
                break

    return cards[:limit]


def _fallback_accommodation_cards(text: str, limit: int = 6, locale: str = "zh-TW") -> list[dict]:
    normalized_locale = _normalize_locale(locale)
    target_town = _extract_taipei_town_from_text(text)
    try:
        stays = filter_legal_stays(city="台北市", town=target_town, service_status=1)
        if not stays and target_town:
            stays = filter_legal_stays(city="台北市", service_status=1)
    except Exception:
        return []
    cards: list[dict] = []
    stay_locale = "zh-TW" if normalized_locale == "zh-TW" else "en"
    for raw_stay in stays[: max(limit, 1)]:
        stay = localize_legal_stay(raw_stay, stay_locale) if isinstance(raw_stay, dict) else raw_stay
        if not isinstance(stay, dict):
            continue
        stay_id = str(stay.get("id") or "").strip()
        name = str(stay.get("name") or "").strip()
        if not stay_id or not name:
            continue
        address = stay.get("address") or {}
        if isinstance(address, dict):
            location = str(address.get("full") or "").strip()
        else:
            location = ""
        location_obj = stay.get("location") or {}
        if isinstance(location_obj, dict):
            lat = location_obj.get("lat")
            lng = location_obj.get("lng")
        else:
            lat = None
            lng = None
        class_labels = stay.get("classLabels") or []
        reason = ""
        if isinstance(class_labels, list):
            reason = "、".join(str(label).strip() for label in class_labels if str(label).strip())
        cards.append(
            {
                "id": stay_id,
                "title": name,
                "dateStr": "合法旅宿",
                "location": location or "地址待確認",
                "imageUrl": "",
                "reason": reason,
                "itemType": "stay",
                "stayLat": lat,
                "stayLng": lng,
                "stayAddress": location,
                "stayData": stay,
            }
        )
    return cards


def _extract_recommendation_events_from_obj(obj: object) -> list[dict]:
    collected: list[dict] = []
    seen_event_ids: set[str] = set()

    def append_event(raw: dict) -> None:
        event_id = str(raw.get("uid") or raw.get("id") or "").strip()
        title = str(raw.get("title") or "").strip()
        if not event_id or not title or event_id in seen_event_ids:
            return
        start = str(raw.get("start_date") or "").strip()
        end = str(raw.get("end_date") or "").strip()
        date_str = str(raw.get("dateStr") or "").strip() or (
            f"{start} -> {end}" if start and end else (start or end or "日期待確認")
        )
        venue = str(raw.get("venue_name") or "").strip()
        address = str(raw.get("address") or "").strip()
        city = str(raw.get("city") or "").strip()
        location = str(raw.get("location") or "").strip()
        location_text = (
            location
            or " • ".join([part for part in [venue, city] if part])
            or " • ".join([part for part in [venue, address] if part])
            or "地點待確認"
        )
        image_url = str(raw.get("imageUrl") or raw.get("image_url") or "").strip()
        reasons = raw.get("recommendation_reasons") or raw.get("reasons") or []
        reason_text = ""
        if isinstance(reasons, list):
            reason_text = "、".join(str(r).strip() for r in reasons if str(r).strip())
        elif isinstance(reasons, str):
            reason_text = reasons.strip()

        collected.append(
            {
                "id": event_id,
                "title": title,
                "dateStr": date_str,
                "location": location_text,
                "imageUrl": image_url,
                "reason": reason_text,
                "itemType": "event",
            }
        )
        seen_event_ids.add(event_id)

    def walk(node: object) -> None:
        if isinstance(node, str):
            candidate = node.strip()
            if candidate.startswith("{") or candidate.startswith("["):
                try:
                    walk(json.loads(candidate))
                except Exception:
                    pass
            return
        if isinstance(node, dict):
            # ADK frequently nests tool outputs under functionResponse.response.
            if "functionResponse" in node:
                walk(node.get("functionResponse"))
            if "response" in node:
                walk(node.get("response"))
            if "output" in node:
                walk(node.get("output"))
            if "result" in node:
                walk(node.get("result"))

            events = node.get("events")
            if isinstance(events, list):
                for raw in events:
                    if not isinstance(raw, dict):
                        continue
                    append_event(raw)

            # Some responses return one event-like object at a time.
            if (
                ("uid" in node or "id" in node)
                and "title" in node
                and ("start_date" in node or "end_date" in node or "venue_name" in node or "address" in node)
            ):
                append_event(node)

            hotels = node.get("hotels")
            if isinstance(hotels, list):
                for raw in hotels:
                    if not isinstance(raw, dict):
                        continue
                    stay_id = str(raw.get("id") or raw.get("uid") or "").strip()
                    title = str(raw.get("name") or raw.get("title") or "").strip()
                    if not stay_id or not title:
                        continue
                    location_text = str(raw.get("address") or raw.get("location") or "").strip() or "地址待確認"
                    lat = raw.get("latitude")
                    lng = raw.get("longitude")
                    class_labels = raw.get("class_labels") or raw.get("classLabels") or []
                    reason_text = ""
                    if isinstance(class_labels, list):
                        reason_text = "、".join(str(label).strip() for label in class_labels if str(label).strip())
                    distance = raw.get("distance_km")
                    if distance is not None:
                        try:
                            reason_text = f"距離展演約 {float(distance):.1f} 公里" + (f"｜{reason_text}" if reason_text else "")
                        except Exception:
                            pass
                    collected.append(
                        {
                            "id": stay_id,
                            "title": title,
                            "dateStr": "合法旅宿",
                            "location": location_text,
                            "imageUrl": "",
                            "reason": reason_text,
                            "itemType": "stay",
                            "stayLat": lat,
                            "stayLng": lng,
                            "stayAddress": location_text,
                        }
                    )
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(obj)
    return collected


def _extract_latest_assistant_text_from_payload(payload: object) -> str:
    latest_text = ""

    def walk(node: object) -> None:
        nonlocal latest_text
        if isinstance(node, dict):
            maybe_text = node.get("text")
            if isinstance(maybe_text, str) and maybe_text.strip():
                latest_text = maybe_text.strip()
            parts = node.get("parts")
            if isinstance(parts, list):
                for part in parts:
                    if isinstance(part, dict):
                        text = part.get("text")
                        if isinstance(text, str) and text.strip():
                            latest_text = text.strip()
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(payload)
    return latest_text


def _extract_recommendation_events_from_text(text: str) -> list[dict]:
    raw = str(text or "").strip()
    if not raw:
        return []

    blocks = [block.strip() for block in _re.split(r"\n\s*\n", raw) if block.strip()]
    results: list[dict] = []
    seen_ids: set[str] = set()

    for block in blocks:
        if not any(token in block for token in ("時間", "地點", "票價", "購票", "日期")):
            continue

        title_match = _re.search(r"\*\*(.+?)\*\*", block)
        if title_match:
            title = title_match.group(1).strip()
        else:
            first_line = block.splitlines()[0].strip(" -*•\t")
            title = _re.sub(r"^[0-9]+[.)]\s*", "", first_line).strip()

        if not title or len(title) < 2:
            continue

        time_match = _re.search(r"(?:時間|日期|檔期)[：:]\s*([^\n]+)", block)
        location_match = _re.search(r"(?:地點|場館|地點資訊)[：:]\s*([^\n]+)", block)
        price_match = _re.search(r"(?:票價|價格|費用)[：:]\s*([^\n]+)", block)
        ticket_match = _re.search(r"\((https?://[^\s)]+)\)", block)
        if not ticket_match:
            ticket_match = _re.search(r"(https?://[^\s)]+)", block)

        date_str = time_match.group(1).strip() if time_match else "日期待確認"
        location_text = location_match.group(1).strip() if location_match else "地點待確認"

        reason_parts: list[str] = []
        if price_match:
            reason_parts.append(f"票價：{price_match.group(1).strip()}")
        if ticket_match:
            reason_parts.append("含購票連結")
        reason_text = "、".join(reason_parts)

        event_id = hashlib.md5(f"{title}|{date_str}|{location_text}".encode("utf-8")).hexdigest()[:16]
        if event_id in seen_ids:
            continue
        seen_ids.add(event_id)
        results.append(
            {
                "id": f"text_{event_id}",
                "title": title,
                "dateStr": date_str,
                "location": location_text,
                "imageUrl": "",
                "reason": reason_text,
                "itemType": "event",
            }
        )

    return results


def _inject_recommendation_carousel_payload(
    run_response_bytes: bytes,
    latest_user_text: str = "",
    current_user: User | None = None,
    locale: str = "zh-TW",
) -> bytes:
    try:
        payload = json.loads(run_response_bytes.decode("utf-8"))
    except Exception:
        return run_response_bytes
    if not isinstance(payload, list) or not payload:
        return run_response_bytes

    wants_accommodation = _is_accommodation_intent(latest_user_text)
    target_town = _extract_taipei_town_from_text(latest_user_text)

    # Keep first occurrence order and avoid duplicates by event ID.
    merged: list[dict] = []
    seen_ids: set[str] = set()
    for event in _extract_recommendation_events_from_obj(payload):
        event_id = event.get("id")
        if not isinstance(event_id, str) or not event_id or event_id in seen_ids:
            continue
        if wants_accommodation:
            if str(event.get("itemType") or "") != "stay":
                continue
            location_text = str(event.get("location") or event.get("stayAddress") or "")
            if location_text and not _is_taipei_location_text(location_text):
                continue
            if target_town and target_town not in location_text:
                continue
        seen_ids.add(event_id)
        merged.append(event)
        if len(merged) >= 12:
            break

    if not merged and _is_recommendation_intent(latest_user_text) and not _is_itinerary_intent(latest_user_text):
        assistant_text = _extract_latest_assistant_text_from_payload(payload)
        if assistant_text:
            merged = _extract_recommendation_events_from_text(assistant_text)[:6]

    if not merged and _is_recommendation_intent(latest_user_text) and not _is_itinerary_intent(latest_user_text):
        merged = (
            _fallback_accommodation_cards(text=latest_user_text, limit=6, locale=locale)
            if wants_accommodation
            else _fallback_recommendation_events(limit=6, locale=locale)
        )

    if not merged:
        return run_response_bytes

    normalized_locale = _normalize_locale(locale)
    copy = {
        "zh-TW": {
            "stayTitle": "住宿推薦",
            "eventTitle": "推薦活動",
            "stayIntro": "以下是你可以直接查看的住宿選項",
            "eventIntro": "以下是你可以直接瀏覽的推薦展演",
        },
        "zh-CN": {
            "stayTitle": "住宿推荐",
            "eventTitle": "推荐活动",
            "stayIntro": "以下是你可以直接查看的住宿选项",
            "eventIntro": "以下是你可以直接浏览的推荐展演",
        },
        "en": {
            "stayTitle": "Stay Recommendations",
            "eventTitle": "Recommended Events",
            "stayIntro": "Here are stay options you can review now.",
            "eventIntro": "Here are recommended exhibitions you can browse now.",
        },
        "fr": {
            "stayTitle": "Hébergements recommandés",
            "eventTitle": "Événements recommandés",
            "stayIntro": "Voici des options d'hébergement à consulter.",
            "eventIntro": "Voici des expositions recommandées à parcourir.",
        },
        "ja": {
            "stayTitle": "宿泊施設のおすすめ",
            "eventTitle": "おすすめイベント",
            "stayIntro": "すぐに確認できる宿泊候補です。",
            "eventIntro": "すぐに閲覧できるおすすめ展演です。",
        },
        "es": {
            "stayTitle": "Alojamientos recomendados",
            "eventTitle": "Eventos recomendados",
            "stayIntro": "Aquí tienes opciones de alojamiento para revisar.",
            "eventIntro": "Aquí tienes exposiciones recomendadas para explorar.",
        },
        "pt": {
            "stayTitle": "Hospedagens recomendadas",
            "eventTitle": "Eventos recomendados",
            "stayIntro": "Aqui estão opções de hospedagem para conferir.",
            "eventIntro": "Aqui estão exposições recomendadas para explorar.",
        },
        "ar": {
            "stayTitle": "أماكن إقامة مقترحة",
            "eventTitle": "فعاليات مقترحة",
            "stayIntro": "إليك خيارات إقامة يمكنك مراجعتها الآن.",
            "eventIntro": "إليك معارض وفعاليات مقترحة يمكنك تصفحها الآن.",
        },
        "hi": {
            "stayTitle": "अनुशंसित ठहरने की जगहें",
            "eventTitle": "अनुशंसित कार्यक्रम",
            "stayIntro": "यहां ठहरने के विकल्प हैं जिन्हें आप देख सकते हैं।",
            "eventIntro": "यहां वे प्रदर्शनियां हैं जिन्हें आप अभी देख सकते हैं।",
        },
    }.get(normalized_locale, {})
    zh_copy = {
        "stayTitle": "住宿推薦",
        "eventTitle": "推薦活動",
        "stayIntro": "以下是你可以直接查看的住宿選項",
        "eventIntro": "以下是你可以直接瀏覽的推薦展演",
    }
    carousel_title = str(copy.get("stayTitle" if wants_accommodation else "eventTitle") or zh_copy["stayTitle" if wants_accommodation else "eventTitle"])
    carousel_intro = str(copy.get("stayIntro" if wants_accommodation else "eventIntro") or zh_copy["stayIntro" if wants_accommodation else "eventIntro"])
    recommendation_payload = {
        "title": carousel_title,
        "introText": carousel_intro,
        "events": merged,
    }

    target = next((item for item in reversed(payload) if isinstance(item, dict)), None)
    if not isinstance(target, dict):
        return run_response_bytes

    target["recommendation_carousel"] = recommendation_payload
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")

@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy_adk(
    request: Request,
    path: str,
    current_user: User | None = Depends(get_optional_current_user),
):
    import urllib.parse
    # ADK exposes its routes at the root (e.g. /apps/..., /run, /list-apps),
    # not under /api/. The frontend adds /api/ as a uniform prefix, and Vite's
    # dev proxy forwards that to us; we strip it here before talking to ADK.
    url = f"{ADK_HOST}/{path}"
    qp = dict(request.query_params)
    if qp:
        url += "?" + urllib.parse.urlencode(qp)

    # /run may take several seconds when Gemini is generating content.
    # Use explicit, longer timeout values to avoid premature 500s from proxy.
    timeout = httpx.Timeout(connect=10.0, read=300.0, write=120.0, pool=120.0)

    async def body_stream():
        async for chunk in request.stream():
            yield chunk

    # ADK receives this request server-to-server from the proxy. Forwarding the
    # browser Origin/Referer headers causes ADK's origin checks to reject with
    # 403 ("origin not allowed"), even though traffic is local.
    blocked_headers = {
        "host",
        "content-length",
        "origin",
        "referer",
        "sec-fetch-site",
        "sec-fetch-mode",
        "sec-fetch-dest",
    }
    forwarded_headers = {
        k: v for k, v in request.headers.items() if k.lower() not in blocked_headers
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        # ADK /run is occasionally flaky with transient 5xx. Retry once so the
        # chat UI doesn't fail on recoverable backend hiccups.
        if path == "run" and request.method == "POST":
            ready, message = _agent_credentials_ready()
            if not ready:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail=message,
                )
            raw_body_bytes = await request.body()
            request_locale = _extract_run_request_locale(raw_body_bytes)
            body_bytes = _inject_reply_language_hint(raw_body_bytes)
            latest_user_text = _extract_latest_user_text_from_run_request(body_bytes)
            attempts = 2
            response = None
            for idx in range(attempts):
                try:
                    response = await client.request(
                        request.method,
                        url,
                        headers=forwarded_headers,
                        content=body_bytes,
                    )
                except httpx.TimeoutException as exc:
                    logger.warning(
                        "ADK /run timed out (attempt %s/%s): %s",
                        idx + 1,
                        attempts,
                        exc,
                    )
                    if idx + 1 < attempts:
                        await asyncio.sleep(0.35)
                        continue
                    raise HTTPException(
                        status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                        detail="Backend agent took too long to respond. Please try again.",
                    ) from exc
                except httpx.HTTPError as exc:
                    logger.error("Proxy transport error for /api/run: %s", exc)
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail="Backend agent service is temporarily unavailable.",
                    ) from exc
                if response.status_code < 500:
                    break
                logger.warning(
                    "ADK /run returned %s (attempt %s/%s)",
                    response.status_code,
                    idx + 1,
                    attempts,
                )
                if idx + 1 < attempts:
                    await asyncio.sleep(0.35)

            headers = {
                k: v
                for k, v in response.headers.items()
                if k.lower() not in ("transfer-encoding", "content-length", "content-encoding")
            }
            transformed = response.content
            if response.status_code >= 500 and _is_recommendation_intent(latest_user_text) and not _is_itinerary_intent(latest_user_text):
                fallback_events = _fallback_event_cards_for_text(
                    latest_user_text,
                    limit=6,
                    current_user=current_user,
                    locale=request_locale or "zh-TW",
                )
                if fallback_events:
                    fallback_copy = {
                        "zh-TW": {
                            "text": "AI 目前無法回應，先用本地展演資料提供推薦。",
                            "title": "推薦活動",
                            "intro": "AI 服務暫時不可用，以下是根據你的條件從本地資料篩出的展演",
                        },
                        "en": {
                            "text": "The AI is temporarily unavailable, so I used local exhibition data for recommendations.",
                            "title": "Recommended Events",
                            "intro": "The AI service is temporarily unavailable. These events were matched locally from your criteria.",
                        },
                        "fr": {
                            "text": "L'IA est temporairement indisponible ; voici des recommandations issues des données locales.",
                            "title": "Événements recommandés",
                            "intro": "Le service IA est temporairement indisponible. Voici des événements filtrés localement selon vos critères.",
                        },
                    }.get(_normalize_locale(request_locale or "zh-TW"), {})
                    transformed = json.dumps(
                        [
                            {
                                "content": {
                                    "parts": [
                                        {
                                            "text": fallback_copy.get("text", "AI 目前無法回應，先用本地展演資料提供推薦。")
                                        }
                                    ]
                                },
                                "recommendation_carousel": {
                                    "title": fallback_copy.get("title", "推薦活動"),
                                    "introText": fallback_copy.get(
                                        "intro",
                                        "AI 服務暫時不可用，以下是根據你的條件從本地資料篩出的展演",
                                    ),
                                    "events": fallback_events,
                                },
                            }
                        ],
                        ensure_ascii=False,
                    ).encode("utf-8")
                    response.status_code = 200
            elif response.status_code < 400:
                transformed = _inject_list_itinerary_payload(transformed, latest_user_text=latest_user_text)
                transformed = _inject_recommendation_carousel_payload(
                    transformed,
                    latest_user_text=latest_user_text,
                    current_user=current_user,
                    locale=request_locale or "zh-TW",
                )
            return Response(content=transformed, status_code=response.status_code, headers=headers)

        req = client.build_request(
            request.method,
            url,
            headers=forwarded_headers,
            content=body_stream() if request.method in ("POST", "PUT", "PATCH") else None,
        )
        try:
            response = await client.send(req, stream=True)
        except httpx.HTTPError as exc:
            logger.error("Proxy transport error for /api/%s: %s", path, exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Backend agent service is temporarily unavailable.",
            ) from exc
        headers = {
            k: v
            for k, v in response.headers.items()
            if k.lower() not in ("transfer-encoding", "content-length", "content-encoding")
        }

        content = await response.aread()
        await response.aclose()
        return Response(content=content, status_code=response.status_code, headers=headers)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
