import argparse
import hashlib
import os
import re as _re
import sys
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
import httpx
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

EXHIBITIONS_PATH = PROJECT_ROOT / "exhibitions.json"
logger.info(f"Project Root: {PROJECT_ROOT}")
logger.info(f"Exhibitions Path: {EXHIBITIONS_PATH}")

if not EXHIBITIONS_PATH.exists():
    logger.error(f"CRITICAL: {EXHIBITIONS_PATH} not found!")
    sys.exit(1)

app = FastAPI(title="ExhiBeat Recommender & Proxy API")

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
