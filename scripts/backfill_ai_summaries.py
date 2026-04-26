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

# Locales with prompts in api_proxy_server._summary_prompt_for_locale (keep in sync).
DEFAULT_BACKFILL_LOCALES = ("zh-TW", "zh-CN", "en", "fr", "ja", "es", "pt", "ar", "hi")


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


def run(
    limit: int | None,
    force: bool,
    only_truncated: bool,
    locales: list[str],
) -> None:
    # Always use zh-TW canonical file for UID / title / description so all locales
    # share one source text and hashes stay aligned with the online API.
    events = proxy.load_exhibitions_dataset("zh-TW")
    env = proxy._summary_generation_environment()  # noqa: SLF001
    normalized_locales = [proxy._normalize_locale(loc) for loc in locales]  # noqa: SLF001
    per_locale = len(events) if limit is None else min(limit, len(events))
    total_jobs = per_locale * len(normalized_locales)
    print(
        f"Loaded {len(events)} events from zh-TW dataset; "
        f"{per_locale} events x {len(normalized_locales)} locales = {total_jobs} jobs.",
        flush=True,
    )
    print(f"Locales: {', '.join(normalized_locales)}", flush=True)
    print(f"Summary generation env: {env}", flush=True)

    processed = 0
    regenerated = 0
    failed = 0
    for normalized_locale in normalized_locales:
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
                print(f"Processed {processed}/{total_jobs}", flush=True)

    print(f"Done. Processed {processed} summary jobs.", flush=True)
    print(f"Regenerated (force path): {regenerated}", flush=True)
    print(f"Failed: {failed}", flush=True)
    print(f"Summary DB: {proxy.AI_SUMMARY_DB_PATH}", flush=True)


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
        help="Single summary locale (ignored if --all-locales or --locales is set).",
    )
    parser.add_argument(
        "--all-locales",
        action="store_true",
        help=f"Generate for all supported locales: {', '.join(DEFAULT_BACKFILL_LOCALES)}",
    )
    parser.add_argument(
        "--locales",
        type=str,
        default="",
        help="Comma-separated locales, e.g. zh-TW,en,fr (overrides --locale).",
    )
    args = parser.parse_args()
    if args.locales.strip():
        locales = [x.strip() for x in args.locales.split(",") if x.strip()]
    elif args.all_locales:
        locales = list(DEFAULT_BACKFILL_LOCALES)
    else:
        locales = [args.locale]
    run(args.limit, force=args.force, only_truncated=args.only_truncated, locales=locales)


if __name__ == "__main__":
    main()
