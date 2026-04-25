#!/usr/bin/env python3
"""
scripts/generate_embeddings.py
使用 Vertex AI text-multilingual-embedding-002 為所有展演 chunk 產生真正的語意 Embedding。
執行方式：
    GOOGLE_APPLICATION_CREDENTIALS=./adc.json \
    backend/adk_agent/.venv313/bin/python scripts/generate_embeddings.py
"""
import json
import os
import sys
import time
from pathlib import Path

# ── 路徑設定 ─────────────────────────────────────────────────────────────────
REPO_ROOT = Path(__file__).parent.parent.resolve()
CHUNKS_PATH = REPO_ROOT / "data" / "exhibitions_merged_chunks.json"
OUTPUT_PATH = REPO_ROOT / "data" / "exhibitions_merged_chunks.json"  # 原地更新
MERGED_PATH = REPO_ROOT / "data" / "exhibitions_merged.json"

PROJECT_ID = "adept-region-493401-t5"
LOCATION   = "us-central1"
EMBED_MODEL = "text-multilingual-embedding-002"  # 支援中文，768 維

BATCH_SIZE     = 5     # Vertex AI Embedding API 每次最多 5 個文本
SLEEP_BETWEEN  = 1.0  # 秒（避免 429）

# ── Google GenAI Client ───────────────────────────────────────────────────────
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "1")
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", PROJECT_ID)
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", LOCATION)

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError:
    print("ERROR: google-genai not installed. Run: pip install google-genai")
    sys.exit(1)

client = genai.Client()


def embed_batch(texts: list[str]) -> list[list[float]]:
    """對一批文字產生 Embedding，失敗時回傳空 list。"""
    try:
        response = client.models.embed_content(
            model=EMBED_MODEL,
            contents=texts,
        )
        return [e.values for e in response.embeddings]
    except Exception as e:
        print(f"  [WARN] embed_batch failed: {e}")
        return [[] for _ in texts]


def build_chunks_from_merged() -> list[dict]:
    """如果 chunks 檔不存在，從 exhibitions_merged.json 建立基本 chunk。"""
    print("Building chunks from exhibitions_merged.json ...")
    with open(MERGED_PATH, encoding="utf-8") as f:
        events = json.load(f)

    chunks = []
    for event in events:
        uid   = event.get("uid", "")
        title = event.get("title") or ""
        if isinstance(title, dict):
            title = title.get("Zh_tw") or title.get("zh_tw") or next(iter(title.values()), "")

        desc = event.get("descriptionFilterHtml") or event.get("descFilterHtml") or ""
        # 簡單去 HTML
        import re
        desc = re.sub(r"<[^>]+>", " ", str(desc)).strip()

        # 每個展演產生 1-2 個 chunk
        if title:
            chunks.append({
                "chunk_id": f"{uid}:0",
                "uid": uid,
                "chunk_index": 0,
                "chunk_text": f"{title}",
                "embedding": [],
                "metadata": {"title": title},
            })
        if desc:
            text = f"{title}：{desc}"[:800]
            chunks.append({
                "chunk_id": f"{uid}:1",
                "uid": uid,
                "chunk_index": 1,
                "chunk_text": text,
                "embedding": [],
                "metadata": {"title": title},
            })
    print(f"  Created {len(chunks)} chunks.")
    return chunks


def main():
    # 載入現有 chunks（或從頭建立）
    if CHUNKS_PATH.exists():
        payload = json.loads(CHUNKS_PATH.read_text(encoding="utf-8"))
        chunks  = payload.get("chunks", []) if isinstance(payload, dict) else payload
        print(f"Loaded {len(chunks)} existing chunks.")
    else:
        print("No existing chunks file.")
        if not MERGED_PATH.exists():
            print("ERROR: exhibitions_merged.json not found")
            sys.exit(1)
        chunks = build_chunks_from_merged()

    # 只處理 embedding 為空或維度不是 768 的（256 維的是假 hash embedding）
    to_update = [i for i, c in enumerate(chunks)
                 if not isinstance(c.get("embedding"), list) or len(c.get("embedding", [])) != 768]
    print(f"Chunks needing real embeddings: {len(to_update)} / {len(chunks)}")

    if not to_update:
        print("All chunks already have real embeddings. Done!")
        return

    # 批次處理
    total   = len(to_update)
    success = 0
    for batch_start in range(0, total, BATCH_SIZE):
        batch_indices = to_update[batch_start: batch_start + BATCH_SIZE]
        texts         = [chunks[i]["chunk_text"][:800] for i in batch_indices]
        
        p = batch_start + len(batch_indices)
        print(f"  [{p}/{total}] embedding batch of {len(texts)} ...", end="", flush=True)
        
        embeddings = embed_batch(texts)
        
        for idx, emb in zip(batch_indices, embeddings):
            if emb:
                chunks[idx]["embedding"] = emb
                success += 1
                print(".", end="", flush=True)
            else:
                print("x", end="", flush=True)
        
        print()
        if batch_start + BATCH_SIZE < total:
            time.sleep(SLEEP_BETWEEN)

    # 寫回
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    out = {"version": "gemini-embed", "model": EMBED_MODEL, "chunks": chunks}
    OUTPUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=None), encoding="utf-8")
    print(f"\n✅ Done! {success}/{total} chunks updated → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
