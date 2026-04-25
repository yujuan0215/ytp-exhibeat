import argparse
import asyncio
import hashlib
import json
import os
import re as _re
import sys
import uuid
from pathlib import Path
from urllib.parse import urlparse
import urllib.parse
import urllib.request

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.responses import Response, StreamingResponse
import httpx
from pydantic import BaseModel, Field
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
    PREFERENCE_OPTIONS,
    Favorite,
    FavoriteCreateRequest,
    FavoriteResponse,
    LoginRequest,
    PreferenceOption,
    PreferenceUpdateRequest,
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
    sanitize_preference_tags,
    verify_password,
)

def discover_exhibitions_path() -> Path:
    configured = os.environ.get("EXHIBEAT_EXHIBITIONS_PATH", "").strip()
    if configured:
        candidate = Path(configured)
        if not candidate.is_absolute():
            candidate = PROJECT_ROOT / candidate
        return candidate

    merged_candidate = PROJECT_ROOT / "data" / "exhibitions_merged.json"
    if merged_candidate.exists():
        return merged_candidate

    return PROJECT_ROOT / "exhibitions.json"


EXHIBITIONS_PATH = discover_exhibitions_path()
LEGAL_STAYS_PATH = PROJECT_ROOT / "data" / "legal_stays" / "legal_stays.json"
logger.info(f"Project Root: {PROJECT_ROOT}")
logger.info(f"Exhibitions Path: {EXHIBITIONS_PATH}")

if not EXHIBITIONS_PATH.exists():
    logger.error(f"CRITICAL: {EXHIBITIONS_PATH} not found!")
    sys.exit(1)

app = FastAPI(title="ExhiBeat Recommender & Proxy API")
ensure_database_ready()

_legal_stays_cache: dict | None = None
_exhibitions_cache: list[dict] | None = None
_exhibitions_cache_mtime: float | None = None
_translation_cache: dict[str, dict[str, str]] = {}
_offline_translation_cache: dict[tuple[str, str], str] | None = None
_offline_translation_mtime: float | None = None
OFFLINE_TRANSLATIONS_PATH = PROJECT_ROOT / "data" / "exhibition_translations.json"


class TranslationRequest(BaseModel):
    texts: list[str] = Field(default_factory=list, max_length=50)
    target_locale: str = Field(alias="targetLocale")
    source_locale: str = Field(default="zh-TW", alias="sourceLocale")
    context: str = ""


class TranslationResponse(BaseModel):
    target_locale: str
    source_locale: str
    translations: dict[str, str]
    backend: str


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


def load_exhibitions_dataset() -> list[dict]:
    global _exhibitions_cache, _exhibitions_cache_mtime
    if not EXHIBITIONS_PATH.exists():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Exhibitions dataset missing: {EXHIBITIONS_PATH}",
        )
    current_mtime = EXHIBITIONS_PATH.stat().st_mtime
    if _exhibitions_cache is not None and _exhibitions_cache_mtime == current_mtime:
        return _exhibitions_cache
    payload = json.loads(EXHIBITIONS_PATH.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Exhibitions dataset format is invalid.",
        )
    _exhibitions_cache = [item for item in payload if isinstance(item, dict)]
    _exhibitions_cache_mtime = current_mtime
    return _exhibitions_cache


def list_available_tags() -> list[str]:
    tags: set[str] = set()
    for item in load_exhibitions_dataset():
        raw_tags = item.get("tag", [])
        if isinstance(raw_tags, str):
            raw_tags = [raw_tags]
        if not isinstance(raw_tags, list):
            continue
        for raw in raw_tags:
            value = str(raw).strip()
            if not value:
                continue
            tags.add(value if value.startswith("#") else f"#{value}")
    return sorted(tags)


def list_available_tag_stats() -> list[dict[str, int | str]]:
    counts: dict[str, int] = {}
    for item in load_exhibitions_dataset():
        raw_tags = item.get("tag", [])
        if isinstance(raw_tags, str):
            raw_tags = [raw_tags]
        if not isinstance(raw_tags, list):
            continue
        deduped_in_event: set[str] = set()
        for raw in raw_tags:
            value = str(raw).strip()
            if not value:
                continue
            normalized = value if value.startswith("#") else f"#{value}"
            deduped_in_event.add(normalized)
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
    try:
        tags = json.loads(user.preference_tags or "[]")
    except json.JSONDecodeError:
        return []
    if not isinstance(tags, list):
        return []
    return [str(tag).strip() for tag in tags if str(tag).strip()]


def _recommendation_args_for_preferences(
    *,
    tags: list[str],
    top_k: int,
    cities: str = "",
    persona_name: str = "你的偏好",
) -> argparse.Namespace:
    wants_free = "free" in tags
    scoring_tags = [tag for tag in tags if tag != "free"]
    venue_focus_by_tag = {
        "art": ("art_museum", "cultural_center"),
        "history": ("museum", "cultural_center"),
        "culture": ("museum", "cultural_center"),
        "indigenous": ("museum", "cultural_center"),
        "science": ("museum",),
        "family": ("museum", "cultural_center"),
    }
    venue_focus = tuple(
        dict.fromkeys(
            venue
            for tag in scoring_tags
            for venue in venue_focus_by_tag.get(tag, ())
        )
    )
    return argparse.Namespace(
        exhibitions=str(EXHIBITIONS_PATH),
        top_k=top_k,
        date="",
        backend="fallback",
        blend_alpha=0.65,
        persona="",
        cities=cities,
        tags=",".join(scoring_tags),
        venue_focus=",".join(venue_focus),
        free_only=wants_free,
        popular=False,
        persona_name=persona_name,
        seed=42,
        components=16,
        epochs=30,
        threads=2,
    )


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


def _translation_cache_key(text: str, target_locale: str, source_locale: str) -> str:
    digest = hashlib.sha256(f"{source_locale}|{target_locale}|{text}".encode("utf-8")).hexdigest()
    return digest


def _translation_source_hash(text: str) -> str:
    return hashlib.sha256(" ".join(str(text).split()).encode("utf-8")).hexdigest()


def _load_offline_translation_index() -> dict[tuple[str, str], str]:
    global _offline_translation_cache, _offline_translation_mtime
    current_mtime = OFFLINE_TRANSLATIONS_PATH.stat().st_mtime if OFFLINE_TRANSLATIONS_PATH.exists() else None
    if _offline_translation_cache is not None and _offline_translation_mtime == current_mtime:
        return _offline_translation_cache

    index: dict[tuple[str, str], str] = {}
    if not OFFLINE_TRANSLATIONS_PATH.exists():
        _offline_translation_cache = index
        _offline_translation_mtime = None
        return index

    try:
        payload = json.loads(OFFLINE_TRANSLATIONS_PATH.read_text(encoding="utf-8"))
        entries = payload.get("entries", [])
        if not isinstance(entries, list):
            entries = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            source_hash = str(entry.get("source_hash", "")).strip()
            translations = entry.get("translations", {})
            if not source_hash or not isinstance(translations, dict):
                continue
            for locale, value in translations.items():
                if isinstance(value, dict):
                    text = str(value.get("text", "")).strip()
                    status = str(value.get("status", "translated"))
                else:
                    text = str(value).strip()
                    status = "translated"
                if text and status == "translated":
                    index[(source_hash, str(locale))] = text
    except Exception as exc:
        logger.warning("Failed to load offline translations: %s", exc)

    _offline_translation_cache = index
    _offline_translation_mtime = current_mtime
    return index


def _lookup_offline_translation(text: str, target_locale: str) -> str | None:
    if target_locale == "zh-TW":
        return text
    normalized = " ".join(str(text).split())
    if not normalized:
        return None
    return _load_offline_translation_index().get((_translation_source_hash(normalized), target_locale))


def _translate_texts_naive(texts: list[str]) -> dict[str, str]:
    return {text: text for text in texts}


def _contains_cjk(text: str) -> bool:
    return any(
        ("\u4e00" <= ch <= "\u9fff")  # CJK Unified Ideographs
        or ("\u3400" <= ch <= "\u4dbf")  # CJK Extension A
        for ch in text
    )


def _requires_non_cjk_output(target_locale: str) -> bool:
    # For these locales, we expect mostly non-CJK script output.
    non_cjk_locales = {"en", "fr", "es", "de", "it", "pt", "id", "vi", "th"}
    base = (target_locale or "").split("-")[0].lower()
    return base in non_cjk_locales


def _google_translate_fallback(text: str, target_locale: str, source_locale: str) -> str:
    try:
        query = urllib.parse.quote(text, safe="")
        sl = (source_locale or "zh-TW").lower()
        tl = (target_locale or "en").lower()
        url = (
            "https://translate.googleapis.com/translate_a/single"
            f"?client=gtx&sl={sl}&tl={tl}&dt=t&q={query}"
        )
        with urllib.request.urlopen(url, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        chunks = payload[0] if isinstance(payload, list) and payload else []
        translated = "".join(part[0] for part in chunks if isinstance(part, list) and part and part[0])
        return translated.strip() or text
    except Exception:
        return text


def _translate_texts_with_gemini(
    texts: list[str],
    target_locale: str,
    source_locale: str,
    context: str,
) -> dict[str, str]:
    if os.environ.get("EXHIBEAT_ENABLE_AI_TRANSLATION", "0") != "1":
        return _translate_texts_naive(texts)

    try:
        import google.generativeai as genai
        api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
        if not api_key:
            return _translate_texts_naive(texts)

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-001"))
        prompt = (
            "Translate the following UI or event content for an international traveler.\n"
            "Translate into natural target-language phrasing. Keep dates/URLs/prices/IDs unchanged.\n"
            "For exhibition titles, translate descriptive words. Keep proper nouns as-is (or transliterate), but do not leave the entire title untouched unless it is already in the target language.\n"
            "Return ONLY a JSON object whose keys are the exact source strings and values are translations.\n"
            f"Source locale: {source_locale}\n"
            f"Target locale: {target_locale}\n"
            f"Context: {context[:300]}\n"
            f"Texts: {json.dumps(texts, ensure_ascii=False)}"
        )
        response = model.generate_content(prompt)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = _re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=_re.I | _re.S).strip()
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return _translate_texts_naive(texts)
        translated = {text: str(parsed.get(text, text)) for text in texts}

        force_non_cjk = _requires_non_cjk_output(target_locale)
        unresolved = [
            text
            for text in texts
            if (
                (
                    translated.get(text, text) == text
                    and _contains_cjk(text)
                    and not target_locale.lower().startswith("zh")
                )
                or (
                    force_non_cjk
                    and _contains_cjk(text)
                    and _contains_cjk(translated.get(text, text))
                )
            )
        ]
        if unresolved:
            for text in unresolved[:10]:
                prompts = [
                    (
                        "Translate the following Traditional Chinese exhibition title into the target locale.\n"
                        "Keep proper names if needed, but translate descriptive words naturally.\n"
                        "Output translation only.\n"
                        + (
                            "IMPORTANT: Do not output Chinese/Japanese characters in the final result; use the target language script.\n"
                            if force_non_cjk
                            else ""
                        )
                        + f"Target locale: {target_locale}\n"
                        + f"Source: {text}"
                    ),
                    (
                        "Translate this title to the target locale in fluent wording.\n"
                        "Return one line only.\n"
                        + (
                            "Use Latin alphabet only (ASCII letters, numbers, punctuation). Do NOT use Chinese/Japanese characters.\n"
                            if force_non_cjk
                            else ""
                        )
                        + f"Target locale: {target_locale}\n"
                        + f"Title: {text}"
                    ),
                ]
                for single_prompt in prompts:
                    single_response = model.generate_content(single_prompt)
                    candidate = single_response.text.strip()
                    if candidate.startswith("```"):
                        candidate = _re.sub(r"^```(?:text)?\s*|\s*```$", "", candidate, flags=_re.I | _re.S).strip()
                    if not candidate or candidate == text:
                        continue
                    if force_non_cjk and _contains_cjk(candidate):
                        continue
                    translated[text] = candidate
                    break
                if force_non_cjk and _contains_cjk(translated.get(text, text)):
                    translated[text] = _google_translate_fallback(
                        text=text,
                        target_locale=target_locale,
                        source_locale=source_locale,
                    )

        return translated
    except Exception as exc:
        logger.warning("AI translation fallback used: %s", exc)
        if _requires_non_cjk_output(target_locale):
            return {
                text: _google_translate_fallback(
                    text=text,
                    target_locale=target_locale,
                    source_locale=source_locale,
                )
                for text in texts
            }
        return _translate_texts_naive(texts)

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

# ─── AI Summarisation with Gemini (cached) ───────────────────────────────────
_summary_cache: dict[str, str] = {}
# Set to True after the first Gemini failure so we stop paying the timeout cost
# on every subsequent request. The process can be restarted to re-enable.
_gemini_disabled: bool = False
# Default to fast naive summary so recommendation APIs stay responsive.
# Set EXHIBEAT_ENABLE_GEMINI_SUMMARY=1 to enable model-generated summaries.
_enable_gemini_summary: bool = os.environ.get("EXHIBEAT_ENABLE_GEMINI_SUMMARY", "0") == "1"

def _is_meaningful_description(text: str) -> bool:
    if not text or len(text) < 15:
        return False
    non_space = text.replace(" ", "")
    if not non_space:
        return False
    ascii_count = sum(1 for c in non_space if ord(c) < 128)
    return ascii_count / len(non_space) <= 0.6

def _naive_summary(description: str) -> str:
    clean = " ".join(description.split())
    fallback = clean[:50].rstrip() + ("…" if len(clean) > 50 else "")
    return fallback if _is_meaningful_description(fallback) else ""

def _gemini_summarize(uid: str, title: str, description: str) -> str:
    global _gemini_disabled
    if uid in _summary_cache:
        return _summary_cache[uid]
    if not _is_meaningful_description(description):
        _summary_cache[uid] = ""
        return ""
    if not _enable_gemini_summary:
        result = _naive_summary(description)
        _summary_cache[uid] = result
        return result
    if _gemini_disabled:
        result = _naive_summary(description)
        _summary_cache[uid] = result
        return result
    try:
        from dotenv import load_dotenv
        env_path = Path(__file__).parent / "gemini_agent" / ".env"
        load_dotenv(env_path, override=False)

        use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "0") == "1"
        prompt = (
            f"請根據以下展覽資訊，用繁體中文寫一句不超過50個字的摘要，"
            f"只輸出摘要本身，不加任何其他文字或標點。\n"
            f"展覽名稱：{title}\n"
            f"展覽說明：{description[:300]}"
        )

        if use_vertex:
            import vertexai
            from vertexai.generative_models import GenerativeModel
            vertexai.init(
                project=os.environ.get("GOOGLE_CLOUD_PROJECT", ""),
                location=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
            )
            model = GenerativeModel(os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-001"))
            response = model.generate_content(prompt)
            summary = response.text.strip()
        else:
            import google.generativeai as genai
            genai.configure(api_key=os.environ.get("GOOGLE_API_KEY", ""))
            model = genai.GenerativeModel(os.environ.get("GEMINI_MODEL", "gemini-2.0-flash-001"))
            response = model.generate_content(prompt)
            summary = response.text.strip()

        if len(summary) > 50:
            summary = summary[:50].rstrip() + "…"
        _summary_cache[uid] = summary
        return summary

    except Exception as exc:
        logger.warning(
            f"Gemini summarisation failed for {uid}: {exc}. "
            "Disabling AI summariser for this process; subsequent items will use naive truncation."
        )
        _gemini_disabled = True
        result = _naive_summary(description)
        _summary_cache[uid] = result
        return result

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

def map_event_to_frontend_exhibition(rec: dict) -> dict:
    uid   = rec["uid"]
    title = rec["title"]
    image_url  = _pick_image(uid, rec.get("image_url", ""))
    ai_summary = _gemini_summarize(uid, title, rec.get("description", ""))

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
        normalized_source_tags = [str(tag).strip() for tag in source_tags if str(tag).strip()]
    else:
        normalized_source_tags = []
    display_tags = normalized_source_tags if normalized_source_tags else rec.get("reasons", ["推薦活動"])[:2]

    return {
        "id":         uid,
        "title":      title,
        "price":      _format_price(rec.get("price_text", ""), rec.get("is_free", False)),
        "dateStr":    date_range,
        "location":   f"{rec['location_name']} • {rec['city']}",
        "aiSummary":  ai_summary,
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


def map_raw_event_to_frontend_exhibition(event: dict) -> dict:
    uid = str(event.get("UID", "")).strip()
    title = str(event.get("title", "")).strip() or "未命名展演"
    show = _extract_show_info(event)
    location_name = str(show.get("locationName", "")).strip() or str(show.get("location", "")).strip()
    location = location_name or "地點待確認"
    date_range = _format_raw_event_date(event)
    description = str(event.get("descriptionFilterHtml", "")).strip()
    price_raw = str(show.get("price", "")).strip() or str(event.get("price", "")).strip()
    normalized_tags = []
    raw_tags = event.get("tag", [])
    if isinstance(raw_tags, list):
        normalized_tags = [str(tag).strip() for tag in raw_tags if str(tag).strip()]
    elif isinstance(raw_tags, str) and raw_tags.strip():
        normalized_tags = [raw_tags.strip()]

    image_url = _pick_image(uid or title, str(event.get("imageUrl", "")).strip())
    all_images = [image_url] if image_url else []
    is_free = any(k in price_raw.lower() for k in ["free", "免費", "免票", "免收費"])
    ai_summary = _naive_summary(description)
    end_date = str(event.get("endDate", "")).strip()

    return {
        "id": uid or hashlib.md5(title.encode("utf-8")).hexdigest(),
        "title": title,
        "price": _format_price(price_raw, is_free),
        "dateStr": date_range,
        "location": location,
        "aiSummary": ai_summary,
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
def get_recommendations_for_persona(persona_id: str, top_k: int = 6) -> list[dict]:
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
    return [map_event_to_frontend_exhibition(r) for r in recs]


def get_recommendations_for_user(user: User | None, top_k: int = 6, cities: str = "") -> list[dict]:
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
    return [map_event_to_frontend_exhibition(r) for r in recs]

# ─── API Endpoints ────────────────────────────────────────────────────────────
@app.get("/api/recommendations/home")
async def get_home_recommendations(
    limit: int = Query(18, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    current_user: User | None = Depends(get_optional_current_user),
):
    if _user_preference_tags(current_user):
        max_items = min(len(load_exhibitions_dataset()), 5000)
        personalized = get_recommendations_for_user(current_user, top_k=max(offset + limit, max_items))
        if not personalized:
            personalized = get_recommendations_for_persona("taipei_after_work", top_k=max(offset + limit, max_items))
        return {
            "exhibitions": personalized[offset : offset + limit],
            "offset": offset,
            "limit": limit,
            "total": len(personalized),
            "hasMore": offset + limit < len(personalized),
            "personalized": True,
        }

    all_events = load_exhibitions_dataset()
    exhibitions = [map_raw_event_to_frontend_exhibition(event) for event in all_events]
    return {
        "exhibitions": exhibitions[offset : offset + limit],
        "offset": offset,
        "limit": limit,
        "total": len(exhibitions),
        "hasMore": offset + limit < len(exhibitions),
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
    current_user: User | None = Depends(get_optional_current_user),
):
    sidebar = get_recommendations_for_user(current_user, 9) or get_recommendations_for_persona("free_city_explorer", 9)
    return {"recommendations": [
        {"id": s["id"], "title": s["title"], "tag": s["tags"][0] if s["tags"] else "熱門活動",
         "location": s["location"], "imageUrl": s["imageUrl"]}
        for s in sidebar
    ]}

@app.get("/api/recommendations/collection")
async def get_collection_recommendations(
    current_user: User | None = Depends(get_optional_current_user),
):
    exhibitions = get_recommendations_for_user(current_user, 4) or get_recommendations_for_persona("history_nerd", 4)
    sidebar = get_recommendations_for_user(current_user, 3) or get_recommendations_for_persona("free_city_explorer", 3)
    return {
        "collectionExhibitions": exhibitions,
        "recommendations": [
            {"id": s["id"], "title": s["title"], "tag": s["tags"][0] if s["tags"] else "熱門活動",
             "location": s["location"], "imageUrl": s["imageUrl"]}
            for s in sidebar
        ],
    }


@app.post("/api/i18n/translate", response_model=TranslationResponse)
async def translate_dynamic_content(payload: TranslationRequest):
    target_locale = payload.target_locale.strip()
    source_locale = payload.source_locale.strip() or "zh-TW"
    unique_texts = []
    seen = set()
    for raw in payload.texts:
        text = " ".join(str(raw).split())
        if not text or text in seen:
            continue
        seen.add(text)
        unique_texts.append(text[:1200])

    if not unique_texts or target_locale == source_locale:
        return TranslationResponse(
            target_locale=target_locale,
            source_locale=source_locale,
            translations={text: text for text in unique_texts},
            backend="passthrough",
        )

    missing = []
    translations: dict[str, str] = {}
    for text in unique_texts:
        offline = _lookup_offline_translation(text, target_locale)
        if offline:
            translations[text] = offline
            continue
        cache_key = _translation_cache_key(text, target_locale, source_locale)
        cached = _translation_cache.get(cache_key)
        if cached:
            translations[text] = cached["translation"]
        else:
            missing.append(text)

    backend = "cache"
    if missing:
        generated = _translate_texts_with_gemini(
            missing,
            target_locale=target_locale,
            source_locale=source_locale,
            context=payload.context,
        )
        backend = "gemini" if os.environ.get("EXHIBEAT_ENABLE_AI_TRANSLATION", "0") == "1" else "passthrough"
        for text, translated in generated.items():
            translations[text] = translated
            # Avoid poisoning cache with unchanged CJK strings in non-Chinese targets.
            if not (
                translated == text
                and _contains_cjk(text)
                and not target_locale.lower().startswith("zh")
            ):
                _translation_cache[_translation_cache_key(text, target_locale, source_locale)] = {
                    "translation": translated,
                }

    return TranslationResponse(
        target_locale=target_locale,
        source_locale=source_locale,
        translations=translations,
        backend=backend,
    )


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


@app.get("/api/auth/preference-options", response_model=list[PreferenceOption])
async def preference_options():
    return [PreferenceOption(**opt) for opt in PREFERENCE_OPTIONS]


@app.post("/api/auth/register", response_model=TokenResponse)
async def register(payload: RegisterRequest, db=Depends(get_db)):
    normalized_email = normalize_email(payload.email)
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    sanitized_tags = sanitize_preference_tags(payload.preference_tags)
    user = User(
        id=str(uuid.uuid4()),
        email=normalized_email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name.strip(),
        preference_tags=json.dumps(sanitized_tags),
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


@app.patch("/api/auth/me/preferences", response_model=UserResponse)
async def update_my_preferences(
    payload: PreferenceUpdateRequest,
    current_user: User = Depends(get_current_user),
    db=Depends(get_db),
):
    sanitized_tags = sanitize_preference_tags(payload.preference_tags)
    current_user.preference_tags = json.dumps(sanitized_tags)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
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


def _preferred_reply_language(text: str) -> str:
    cjk_count = len(_re.findall(r"[\u4e00-\u9fff]", text))
    latin_count = len(_re.findall(r"[A-Za-z]", text))
    if latin_count >= 3 and cjk_count == 0:
        return "en"
    if cjk_count > 0:
        return "zh-TW"
    return ""


def _inject_reply_language_hint(body_bytes: bytes) -> bytes:
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception:
        return body_bytes

    message = payload.get("newMessage") or payload.get("new_message") or {}
    parts = message.get("parts") if isinstance(message, dict) else None
    if not isinstance(parts, list):
        return body_bytes

    text_chunks = [part.get("text", "") for part in parts if isinstance(part, dict)]
    latest_text = "\n".join(chunk for chunk in text_chunks if chunk).strip()
    language = _preferred_reply_language(latest_text)
    if not language:
        return body_bytes

    hint = (
        "\n\n[Reply language instruction: The user's latest message is in English. "
        "Reply in English only. Keep original Chinese exhibition titles and addresses if needed, "
        "but all explanations, labels, and follow-up questions must be in English.]"
        if language == "en"
        else "\n\n[回覆語言指示：使用者最後一則訊息是中文，請全程使用繁體中文回覆。]"
    )

    for part in reversed(parts):
        if isinstance(part, dict) and isinstance(part.get("text"), str):
            if "Reply language instruction:" in part["text"] or "回覆語言指示：" in part["text"]:
                return body_bytes
            part["text"] += hint
            return json.dumps(payload, ensure_ascii=False).encode("utf-8")

    return body_bytes


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


def _fallback_recommendation_events(limit: int = 6, current_user: User | None = None) -> list[dict]:
    try:
        recs = get_recommendations_for_user(current_user, top_k=limit) or get_recommendations_for_persona("taipei_after_work", top_k=limit)
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


def _fallback_event_cards_for_text(text: str, limit: int = 6, current_user: User | None = None) -> list[dict]:
    target_town = _extract_taipei_town_from_text(text)
    cards: list[dict] = []
    seen_ids: set[str] = set()

    if target_town:
        town_matches: list[dict] = []
        for event in load_exhibitions_dataset():
            if not isinstance(event, dict):
                continue
            mapped = map_raw_event_to_frontend_exhibition(event)
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
        for event in _fallback_recommendation_events(limit=limit * 2, current_user=current_user):
            event_id = str(event.get("id") or "").strip()
            if not event_id or event_id in seen_ids:
                continue
            seen_ids.add(event_id)
            cards.append(event)
            if len(cards) >= limit:
                break

    return cards[:limit]


def _fallback_accommodation_cards(text: str, limit: int = 6) -> list[dict]:
    target_town = _extract_taipei_town_from_text(text)
    try:
        stays = filter_legal_stays(city="台北市", town=target_town, service_status=1)
        if not stays and target_town:
            stays = filter_legal_stays(city="台北市", service_status=1)
    except Exception:
        return []
    cards: list[dict] = []
    for stay in stays[: max(limit, 1)]:
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

    def walk(node: object) -> None:
        if isinstance(node, dict):
            events = node.get("events")
            if isinstance(events, list):
                for raw in events:
                    if not isinstance(raw, dict):
                        continue
                    event_id = str(raw.get("uid") or raw.get("id") or "").strip()
                    title = str(raw.get("title") or "").strip()
                    if not event_id or not title:
                        continue
                    start = str(raw.get("start_date") or "").strip()
                    end = str(raw.get("end_date") or "").strip()
                    date_str = str(raw.get("dateStr") or "").strip() or (
                        f"{start} -> {end}" if start and end else (start or end or "日期待確認")
                    )
                    venue = str(raw.get("venue_name") or "").strip()
                    address = str(raw.get("address") or "").strip()
                    location = str(raw.get("location") or "").strip()
                    location_text = location or " • ".join([part for part in [venue, address] if part]) or "地點待確認"
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


def _inject_recommendation_carousel_payload(
    run_response_bytes: bytes,
    latest_user_text: str = "",
    current_user: User | None = None,
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
        merged = (
            _fallback_accommodation_cards(text=latest_user_text, limit=6)
            if wants_accommodation
            else _fallback_recommendation_events(limit=6, current_user=current_user)
        )

    if not merged:
        return run_response_bytes

    carousel_title = "住宿推薦" if wants_accommodation else "推薦活動"
    carousel_intro = (
        "以下是你可以直接查看的住宿選項"
        if wants_accommodation
        else "以下是你可以直接瀏覽的推薦展演"
    )
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
            body_bytes = _inject_reply_language_hint(await request.body())
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
                )
                if fallback_events:
                    transformed = json.dumps(
                        [
                            {
                                "content": {
                                    "parts": [
                                        {
                                            "text": "AI 目前無法回應，先用本地展演資料提供推薦。"
                                        }
                                    ]
                                },
                                "recommendation_carousel": {
                                    "title": "推薦活動",
                                    "introText": "AI 服務暫時不可用，以下是根據你的條件從本地資料篩出的展演",
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

        async def relay_stream():
            try:
                async for chunk in response.aiter_bytes():
                    yield chunk
            except httpx.ReadError as exc:
                logger.warning("Upstream read error while proxying /api/%s: %s", path, exc)
            finally:
                await response.aclose()

        return StreamingResponse(relay_stream(), status_code=response.status_code, headers=headers)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
