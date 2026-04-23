import argparse
import hashlib
import json
import os
import re as _re
import sys
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import StreamingResponse
import httpx
from sqlalchemy import func
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
    create_access_token,
    ensure_database_ready,
    get_current_user,
    get_db,
    hash_password,
    normalize_email,
    normalize_display_name,
    sanitize_preference_tags,
    verify_password,
)

EXHIBITIONS_PATH = PROJECT_ROOT / "exhibitions.json"
logger.info(f"Project Root: {PROJECT_ROOT}")
logger.info(f"Exhibitions Path: {EXHIBITIONS_PATH}")

if not EXHIBITIONS_PATH.exists():
    logger.error(f"CRITICAL: {EXHIBITIONS_PATH} not found!")
    sys.exit(1)

app = FastAPI(title="ExhiBeat Recommender & Proxy API")
ensure_database_ready()

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
    if raw_url and raw_url.startswith("http"):
        return raw_url
    h = int(hashlib.md5(uid.encode()).hexdigest(), 16)
    return PLACEHOLDER_IMAGES[h % len(PLACEHOLDER_IMAGES)]

def _format_price(price_text: str, is_free: bool) -> str:
    if is_free:
        return "FREE"
    if not price_text:
        return "—"
    clean = " ".join(price_text.split())
    return clean[:30] + ("…" if len(clean) > 30 else "")

def map_event_to_frontend_exhibition(rec: dict) -> dict:
    uid   = rec["uid"]
    title = rec["title"]
    image_url  = _pick_image(uid, rec.get("image_url", ""))
    ai_summary = _gemini_summarize(uid, title, rec.get("description", ""))

    date_range    = rec.get("date_range", "")
    end_date_str  = date_range.split(" -> ")[-1] if " -> " in date_range else ""
    edit_date_str = rec.get("edit_modify_date", "")  # "YYYY/MM/DD HH:MM:SS"

    return {
        "id":         uid,
        "title":      title,
        "price":      _format_price(rec.get("price_text", ""), rec.get("is_free", False)),
        "dateStr":    date_range,
        "location":   f"{rec['location_name']} • {rec['city']}",
        "aiSummary":  ai_summary,
        "tags":       rec.get("reasons", ["推薦活動"])[:2],
        "imageUrl":   image_url,
        "isFavorite": False,
        "_meta": {
            "isFree":          rec.get("is_free", False),
            "endDate":         end_date_str,
            "editModifyDate":  edit_date_str,
            "score":           rec.get("score", 0),
            "latitude":        rec.get("latitude"),
            "longitude":       rec.get("longitude"),
        },
    }

# ─── Recommender ─────────────────────────────────────────────────────────────
def get_recommendations_for_persona(persona_id: str, top_k: int = 6) -> list[dict]:
    persona_map = {
        "taipei_after_work":  {"cities": "台北市,新北市,基隆市",         "tags": "art,photogenic,culture"},
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

# ─── API Endpoints ────────────────────────────────────────────────────────────
@app.get("/api/recommendations/home")
async def get_home_recommendations():
    exhibitions = get_recommendations_for_persona("taipei_after_work", 18)
    return {"exhibitions": exhibitions}

@app.get("/api/recommendations/collection/more")
async def get_more_collection_recommendations():
    sidebar = get_recommendations_for_persona("free_city_explorer", 9)
    return {"recommendations": [
        {"id": s["id"], "title": s["title"], "tag": s["tags"][0] if s["tags"] else "熱門活動",
         "location": s["location"], "imageUrl": s["imageUrl"]}
        for s in sidebar
    ]}

@app.get("/api/recommendations/collection")
async def get_collection_recommendations():
    exhibitions = get_recommendations_for_persona("history_nerd", 4)
    sidebar = get_recommendations_for_persona("free_city_explorer", 3)
    return {
        "collectionExhibitions": exhibitions,
        "recommendations": [
            {"id": s["id"], "title": s["title"], "tag": s["tags"][0] if s["tags"] else "熱門活動",
             "location": s["location"], "imageUrl": s["imageUrl"]}
            for s in sidebar
        ],
    }


@app.get("/api/auth/preference-options", response_model=list[PreferenceOption])
async def preference_options():
    return [PreferenceOption(**opt) for opt in PREFERENCE_OPTIONS]


@app.post("/api/auth/register", response_model=TokenResponse)
async def register(payload: RegisterRequest, db=Depends(get_db)):
    normalized_email = normalize_email(payload.email)
    normalized_display_name = normalize_display_name(payload.display_name)
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )
    existing_display_name = (
        db.query(User)
        .filter(func.lower(User.display_name) == normalized_display_name.lower())
        .first()
    )
    if existing_display_name:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken",
        )

    sanitized_tags = sanitize_preference_tags(payload.preference_tags)
    user = User(
        id=str(uuid.uuid4()),
        email=normalized_email,
        password_hash=hash_password(payload.password),
        display_name=normalized_display_name,
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

@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy_adk(request: Request, path: str):
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
    timeout = httpx.Timeout(connect=10.0, read=120.0, write=120.0, pool=120.0)
    client = httpx.AsyncClient(timeout=timeout)

    async def body_stream():
        async for chunk in request.stream():
            yield chunk

    req = client.build_request(
        request.method,
        url,
        headers={k: v for k, v in request.headers.items() if k.lower() != "host"},
        content=body_stream() if request.method in ("POST", "PUT", "PATCH") else None,
    )
    response = await client.send(req, stream=True)
    headers = {k: v for k, v in response.headers.items()
               if k.lower() not in ("transfer-encoding", "content-length", "content-encoding")}
    return StreamingResponse(response.aiter_bytes(), status_code=response.status_code, headers=headers)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
