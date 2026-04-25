#!/usr/bin/env python3
"""Build an offline translation cache for exhibition text fields.

The output is intentionally data-oriented:
- event_id keeps translations attached to the source exhibition.
- source_hash prevents re-translating unchanged text.
- field limits translation to high-value fields instead of the whole record.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


DEFAULT_LOCALES = ["en", "zh-CN", "es", "hi", "ar", "fr", "pt", "ja"]
DEFAULT_FIELDS = ["title", "descriptionFilterHtml", "locationName", "categoryLabel"]

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = PROJECT_ROOT / "data" / "exhibitions_merged.json"
DEFAULT_OUTPUT = PROJECT_ROOT / "data" / "exhibition_translations.json"

MANUAL_SEEDS: dict[str, dict[str, str]] = {
    "香港藝術家 b.wing 全新個展《我們都是，快樂王子》": {
        "en": 'Hong Kong artist b.wing\'s new solo exhibition "We Are All, The Happy Prince"',
        "fr": 'Nouvelle exposition personnelle de l’artiste hongkongais b.wing, "Nous sommes tous le prince heureux"',
        "es": 'Nueva exposición individual del artista hongkonés b.wing, "Todos somos el príncipe feliz"',
        "de": 'Neue Einzelausstellung des Hongkonger Künstlers b.wing, "Wir sind alle der glückliche Prinz"',
        "ja": "香港のアーティスト b.wing 新作個展『私たちはみんな、幸せな王子』",
        "zh-CN": "香港艺术家 b.wing 全新个展《我们都是，快乐王子》",
    },
    "「仁愛區庶民記憶採集計畫」一店一時代成果展": {
        "en": '"Ren’ai District Everyday Memory Collection Project" One Store, One Era Exhibition',
        "fr": 'Exposition "Un commerce, une époque" du projet de collecte des mémoires populaires du district de Ren’ai',
        "es": 'Exposición "Una tienda, una época" del proyecto de recopilación de memorias populares del distrito de Ren’ai',
        "de": 'Ausstellung "Ein Geschäft, eine Epoche" des Projekts zur Sammlung alltäglicher Erinnerungen im Bezirk Ren’ai',
        "ja": "「仁愛区庶民記憶採集計画」一店一時代成果展",
        "zh-CN": "「仁爱区庶民记忆采集计划」一店一时代成果展",
    },
    "【FUTURE VISION LAB 2026】": {
        "en": "FUTURE VISION LAB 2026",
        "fr": "FUTURE VISION LAB 2026",
        "es": "FUTURE VISION LAB 2026",
        "de": "FUTURE VISION LAB 2026",
        "ja": "FUTURE VISION LAB 2026",
        "zh-CN": "【FUTURE VISION LAB 2026】",
    },
}


def normalize_text(value: object) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"<[^>]+>", " ", text)
    return " ".join(text.split()).strip()


def source_hash(text: str) -> str:
    return hashlib.sha256(normalize_text(text).encode("utf-8")).hexdigest()


def load_existing(path: Path) -> dict:
    if not path.exists():
        return {
            "version": 1,
            "generated_at": "",
            "source_locale": "zh-TW",
            "locales": [],
            "fields": [],
            "entries": [],
        }
    return json.loads(path.read_text(encoding="utf-8"))


def existing_index(payload: dict) -> dict[tuple[str, str, str], dict]:
    index = {}
    for entry in payload.get("entries", []):
        key = (entry.get("event_id", ""), entry.get("field", ""), entry.get("source_hash", ""))
        if all(key):
            index[key] = entry
    return index


def event_field_value(record: dict, field: str) -> str:
    if field == "locationName":
        show_info = record.get("showInfo", [])
        if isinstance(show_info, list) and show_info:
            return normalize_text(show_info[0].get("locationName", ""))
    return normalize_text(record.get(field, ""))


def translate_manual_seed(text: str, locale: str) -> tuple[str, str]:
    translated = MANUAL_SEEDS.get(text, {}).get(locale, "")
    if translated:
        return translated, "translated"
    return "", "pending"


def translate_google_gtx(text: str, locale: str) -> tuple[str, str]:
    if locale == "zh-TW":
        return text, "translated"
    query = urllib.parse.quote(text, safe="")
    url = f"https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-TW&tl={locale}&dt=t&q={query}"
    with urllib.request.urlopen(url, timeout=15) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    chunks = payload[0] if isinstance(payload, list) and payload else []
    translated = "".join(part[0] for part in chunks if isinstance(part, list) and part and part[0])
    return translated.strip(), "translated" if translated.strip() else "pending"


def translate_gemini(text: str, locale: str) -> tuple[str, str]:
    import google.generativeai as genai

    api_key = os.environ.get("GOOGLE_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is required for --provider gemini")
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"))
    response = model.generate_content(
        "Translate the following Traditional Chinese exhibition text into the target locale. "
        "Preserve names, dates, prices, URLs, and IDs. Output translation only.\n"
        f"Target locale: {locale}\n"
        f"Text: {text}"
    )
    translated = response.text.strip()
    return translated, "translated" if translated else "pending"


def provider_fn(name: str) -> Callable[[str, str], tuple[str, str]]:
    if name == "manual-seed":
        return translate_manual_seed
    if name == "google-gtx":
        return translate_google_gtx
    if name == "gemini":
        return translate_gemini
    raise ValueError(f"Unknown provider: {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill offline translations for exhibition data.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--fields", default=",".join(DEFAULT_FIELDS))
    parser.add_argument("--locales", default=",".join(DEFAULT_LOCALES))
    parser.add_argument("--provider", choices=["manual-seed", "google-gtx", "gemini"], default="manual-seed")
    parser.add_argument("--limit", type=int, default=0, help="Limit number of source records processed.")
    parser.add_argument("--only-id", action="append", default=[], help="Only process a specific UID. Repeatable.")
    parser.add_argument("--sleep", type=float, default=0.0, help="Seconds to sleep between provider calls.")
    args = parser.parse_args()

    fields = [field.strip() for field in args.fields.split(",") if field.strip()]
    locales = [locale.strip() for locale in args.locales.split(",") if locale.strip()]
    translate = provider_fn(args.provider)

    records = json.loads(args.input.read_text(encoding="utf-8"))
    if args.only_id:
        wanted = set(args.only_id)
        records = [record for record in records if record.get("UID") in wanted]
    if args.limit:
        records = records[: args.limit]

    payload = load_existing(args.output)
    by_key = existing_index(payload)

    translated_count = 0
    pending_count = 0
    skipped_count = 0

    for record in records:
        event_id = str(record.get("UID", "")).strip()
        if not event_id:
            continue
        for field in fields:
            source = event_field_value(record, field)
            if not source:
                continue
            h = source_hash(source)
            key = (event_id, field, h)
            entry = by_key.get(key)
            if not entry:
                entry = {
                    "event_id": event_id,
                    "field": field,
                    "source": source,
                    "source_hash": h,
                    "translations": {},
                }
                payload["entries"].append(entry)
                by_key[key] = entry

            for locale in locales:
                current = entry["translations"].get(locale, {})
                if isinstance(current, dict) and current.get("status") == "translated":
                    skipped_count += 1
                    continue
                text, status = translate(source, locale)
                entry["translations"][locale] = {
                    "text": text,
                    "status": status,
                    "provider": args.provider,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                if status == "translated":
                    translated_count += 1
                else:
                    pending_count += 1
                if args.sleep:
                    time.sleep(args.sleep)

    payload["generated_at"] = datetime.now(timezone.utc).isoformat()
    payload["locales"] = sorted(set(payload.get("locales", []) + locales))
    payload["fields"] = sorted(set(payload.get("fields", []) + fields))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(
        f"Wrote {args.output} | translated={translated_count} pending={pending_count} skipped={skipped_count}"
    )


if __name__ == "__main__":
    main()
