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


def _force_regenerate(uid: str, title: str, description: str, locale: str) -> str:
    source_hash = proxy._summary_source_hash(title, description)  # noqa: SLF001
    summary, model_name = proxy._generate_gemini_summary(title, description, locale)  # noqa: SLF001
    proxy._save_summary_to_db(uid, locale, source_hash, summary, model_name)  # noqa: SLF001
    return summary


def _looks_truncated(summary: str) -> bool:
    text = (summary or "").strip()
    return text.endswith("…") or text.endswith("...")


def run(limit: int | None, force: bool, only_truncated: bool, locale: str) -> None:
    events = proxy.load_exhibitions_dataset()
    normalized_locale = proxy._normalize_locale(locale)  # noqa: SLF001
    env = proxy._summary_generation_environment()  # noqa: SLF001
    total = len(events) if limit is None else min(limit, len(events))
    print(
        f"Loaded {len(events)} events, processing {total} summaries..."
        f" locale={normalized_locale}"
    )
    print(f"Summary generation env: {env}")

    processed = 0
    regenerated = 0
    failed = 0
    for index, event in enumerate(events):
        if limit is not None and index >= limit:
            break
        uid, title, description = _event_uid_and_content(event)
        try:
            if force:
                _force_regenerate(uid, title, description, normalized_locale)
                regenerated += 1
            elif only_truncated:
                existing = proxy._load_latest_summary(uid, normalized_locale) or ""  # noqa: SLF001
                if _looks_truncated(existing):
                    _force_regenerate(uid, title, description, normalized_locale)
                    regenerated += 1
                else:
                    proxy._gemini_summarize(uid, title, description, normalized_locale)  # noqa: SLF001
            else:
                proxy._gemini_summarize(uid, title, description, normalized_locale)  # noqa: SLF001
        except Exception:
            failed += 1
        processed += 1
        if processed % 50 == 0:
            print(f"Processed {processed}/{total}")

    print(f"Done. Processed {processed} summaries.")
    print(f"Regenerated: {regenerated}")
    print(f"Failed: {failed}")
    print(f"Summary DB: {proxy.AI_SUMMARY_DB_PATH}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-generate Gemini AI summaries")
    parser.add_argument("--limit", type=int, default=None, help="Only process first N events")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Force regenerate and overwrite summaries instead of reusing cache.",
    )
    parser.add_argument(
        "--only-truncated",
        action="store_true",
        help="Only force-regenerate rows whose current summary ends with ellipsis.",
    )
    parser.add_argument(
        "--locale",
        type=str,
        default="zh-TW",
        help="Summary locale to generate, e.g. zh-TW or en.",
    )
    args = parser.parse_args()
    run(args.limit, force=args.force, only_truncated=args.only_truncated, locale=args.locale)


if __name__ == "__main__":
    main()
