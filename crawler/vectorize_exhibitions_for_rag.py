import argparse
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def deterministic_embed(text: str, dimensions: int = 256) -> list[float]:
    values: list[float] = []
    text = text or ""
    for i in range(dimensions):
        seed = f"{i}|{text}".encode("utf-8")
        digest = hashlib.sha256(seed).digest()
        num = int.from_bytes(digest[:4], byteorder="big", signed=False)
        values.append((num / 2**31) - 1.0)
    return values


def chunk_text(text: str, chunk_size: int, chunk_overlap: int) -> list[str]:
    text = clean_text(text)
    if not text:
        return []
    if len(text) <= chunk_size:
        return [text]
    out: list[str] = []
    start = 0
    step = max(1, chunk_size - chunk_overlap)
    while start < len(text):
        part = text[start : start + chunk_size].strip()
        if part:
            out.append(part)
        if start + chunk_size >= len(text):
            break
        start += step
    return out


def build_chunks(events: list[dict[str, Any]], chunk_size: int, chunk_overlap: int) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for event in events:
        uid = str(event.get("UID") or "").strip()
        if not uid:
            continue
        title = clean_text(str(event.get("title") or ""))
        description = clean_text(str(event.get("descriptionFilterHtml") or ""))
        if not description:
            continue
        parts = chunk_text(description, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        for idx, part in enumerate(parts):
            chunk_id = f"{uid}_{idx}"
            chunks.append(
                {
                    "chunk_id": chunk_id,
                    "uid": uid,
                    "chunk_index": idx,
                    "chunk_text": part,
                    "embedding": deterministic_embed(part),
                    "metadata": {
                        "title": title,
                        "startDate": event.get("startDate", ""),
                        "endDate": event.get("endDate", ""),
                        "imageUrl": event.get("imageUrl", ""),
                        "sourceWebPromote": event.get("sourceWebPromote", ""),
                    },
                }
            )
    return chunks


def main() -> None:
    parser = argparse.ArgumentParser(description="Vectorize merged exhibitions for RAG retrieval.")
    parser.add_argument("--input", type=Path, default=Path("data/exhibitions_merged.json"))
    parser.add_argument("--output", type=Path, default=Path("data/exhibitions_merged_chunks.json"))
    parser.add_argument("--chunk-size", type=int, default=900)
    parser.add_argument("--chunk-overlap", type=int, default=120)
    args = parser.parse_args()

    events = json.loads(args.input.read_text(encoding="utf-8"))
    if not isinstance(events, list):
        raise SystemExit("Input must be a JSON array")

    chunks = build_chunks(events, chunk_size=args.chunk_size, chunk_overlap=args.chunk_overlap)
    payload = {
        "source_file": str(args.input),
        "embedding_backend": "deterministic-hash-256",
        "chunk_strategy": {
            "chunk_size": args.chunk_size,
            "chunk_overlap": args.chunk_overlap,
        },
        "event_count": len(events),
        "chunk_count": len(chunks),
        "chunks": chunks,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Event count: {len(events)}")
    print(f"Chunk count: {len(chunks)}")
    print(f"Output: {args.output.resolve()}")


if __name__ == "__main__":
    main()
