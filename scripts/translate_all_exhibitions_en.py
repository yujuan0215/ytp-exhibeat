import datetime
import json
import re
import time
from pathlib import Path

from deep_translator import GoogleTranslator


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ALL_PATH = DATA_DIR / "all_exhibitions.json"
EN_TRANSLATION_PATH = DATA_DIR / "exhibition_translations" / "exhibition_translations.en.json"


def normalize_locale_text(text: str) -> str:
    return " ".join(str(text or "").split()).strip()


def strip_html(text: str) -> str:
    plain = re.sub(r"<[^>]+>", " ", str(text or ""))
    return normalize_locale_text(plain)


def build_summary_source(event: dict) -> str:
    existing = normalize_locale_text(
        str(
            event.get("aiSummary")
            or event.get("ai_summary")
            or event.get("summary")
            or ""
        )
    )
    if existing:
        return existing[:120]
    description = strip_html(str(event.get("description") or event.get("descriptionFilterHtml") or ""))
    return description[:120]


def event_location_name(event: dict) -> str:
    show_info = event.get("showInfo", [])
    if isinstance(show_info, list) and show_info and isinstance(show_info[0], dict):
        show = show_info[0]
        location_name = normalize_locale_text(str(show.get("locationName", "")))
        if location_name:
            return location_name
        return normalize_locale_text(str(show.get("location", "")))
    return ""


def ensure_entry(entries_index: dict[tuple[str, str], dict], event_id: str, field: str, source: str, now: str) -> dict:
    key = (event_id, field)
    row = entries_index.get(key)
    if row is None:
        row = {
            "event_id": event_id,
            "field": field,
            "source": source,
            "source_hash": "",
            "text": "",
            "status": "pending",
            "provider": "manual-seed",
            "updated_at": now,
        }
        entries_index[key] = row
    else:
        row["source"] = source
    return row


def translate_text(translator: GoogleTranslator, cache: dict[str, str], text: str) -> str:
    source = normalize_locale_text(text)
    if not source:
        return ""
    if source in cache:
        return cache[source]
    # Keep mostly English text as-is.
    non_ascii_ratio = sum(1 for c in source if ord(c) > 127) / max(len(source), 1)
    if non_ascii_ratio < 0.1:
        cache[source] = source
        return source
    last_error = None
    for _ in range(3):
        try:
            translated = normalize_locale_text(translator.translate(source))
            if translated:
                cache[source] = translated
                return translated
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(0.8)
    # Fallback to source text when translation service fails.
    if last_error:
        print(f"[warn] fallback source text due to translation error: {source[:40]}...")
    cache[source] = source
    return source


def main() -> None:
    all_events = json.loads(ALL_PATH.read_text(encoding="utf-8"))
    en_payload = json.loads(EN_TRANSLATION_PATH.read_text(encoding="utf-8"))
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    entries = [row for row in en_payload.get("entries", []) if isinstance(row, dict)]
    entries_index: dict[tuple[str, str], dict] = {}
    for row in entries:
        event_id = normalize_locale_text(str(row.get("event_id", "")))
        field = normalize_locale_text(str(row.get("field", "")))
        if event_id and field:
            entries_index[(event_id, field)] = row

    translator = GoogleTranslator(source="zh-TW", target="en")
    cache: dict[str, str] = {}
    updated_count = 0

    for event in all_events:
        if not isinstance(event, dict):
            continue
        event_id = normalize_locale_text(str(event.get("UID", "")))
        if not event_id:
            continue

        title = normalize_locale_text(str(event.get("title", "")))
        location_name = event_location_name(event)
        category = normalize_locale_text(str(event.get("category", "")))
        summary_source = build_summary_source(event)

        field_sources = {
            "title": title,
            "locationName": location_name,
            "categoryLabel": category,
            "aiSummary": summary_source,
        }

        for field, source in field_sources.items():
            row = ensure_entry(entries_index, event_id, field, source, now)
            translated = translate_text(translator, cache, source)
            row["text"] = translated
            row["status"] = "translated" if translated else "pending"
            row["provider"] = "manual-curated-batch"
            row["updated_at"] = now
            updated_count += 1

    en_payload["generated_at"] = now
    en_payload["entries"] = sorted(
        entries_index.values(),
        key=lambda r: (str(r.get("event_id", "")), str(r.get("field", ""))),
    )
    EN_TRANSLATION_PATH.write_text(json.dumps(en_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"updated_rows={updated_count}, total_entries={len(en_payload['entries'])}, cache_size={len(cache)}")


if __name__ == "__main__":
    main()
