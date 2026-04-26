#!/usr/bin/env python3
"""Pre-generate and persist AI summaries with Gemini."""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.adk_agent import api_proxy_server as proxy  # noqa: E402


def _event_uid_and_content(event: dict) -> tuple[str, str, str]:
    uid = str(event.get("UID", "")).strip()
    title = str(event.get("title", "")).strip() or "未命名展演"
    description = str(event.get("descriptionFilterHtml", "")).strip()
    if not uid:
        uid = hashlib.md5(title.encode("utf-8")).hexdigest()
    return uid, title, description


def run(limit: int | None) -> None:
    events = proxy.load_exhibitions_dataset()
    total = len(events) if limit is None else min(limit, len(events))
    print(f"Loaded {len(events)} events, processing {total} summaries...")

    processed = 0
    for index, event in enumerate(events):
        if limit is not None and index >= limit:
            break
        uid, title, description = _event_uid_and_content(event)
        proxy._gemini_summarize(uid, title, description)
        processed += 1
        if processed % 50 == 0:
            print(f"Processed {processed}/{total}")

    print(f"Done. Processed {processed} summaries.")
    print(f"Summary DB: {proxy.AI_SUMMARY_DB_PATH}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-generate Gemini AI summaries")
    parser.add_argument("--limit", type=int, default=None, help="Only process first N events")
    args = parser.parse_args()
    run(args.limit)


if __name__ == "__main__":
    main()
