import datetime
import json
import re
from pathlib import Path

from deep_translator import GoogleTranslator


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ALL_PATH = DATA_DIR / "all_exhibitions.json"
JA_TRANSLATION_PATH = DATA_DIR / "exhibition_translations" / "exhibition_translations.ja.json"


def normalize_locale_text(text: str) -> str:
    return " ".join(str(text or "").split()).strip()


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


def needs_translation(text: str) -> bool:
    value = normalize_locale_text(text)
    return bool(value and re.search(r"[\u4e00-\u9fff]", value))


def chunked(values: list[str], size: int):
    for i in range(0, len(values), size):
        yield values[i : i + size]


def translate_map(texts: set[str]) -> dict[str, str]:
    if not texts:
        return {}
    translator = GoogleTranslator(source="zh-TW", target="ja")
    pending = sorted(normalize_locale_text(t) for t in texts if normalize_locale_text(t))
    result: dict[str, str] = {}
    for idx, batch in enumerate(chunked(pending, 40), start=1):
        try:
            translated = translator.translate_batch(batch)
        except Exception:
            translated = None
        if not isinstance(translated, list) or len(translated) != len(batch):
            translated = []
            for item in batch:
                try:
                    translated.append(translator.translate(item))
                except Exception:
                    translated.append(item)
        for src, dst in zip(batch, translated):
            normalized = normalize_locale_text(str(dst or ""))
            result[src] = normalized if normalized else src
        if idx % 10 == 0:
            print(f"translated_batches={idx}, done={min(idx*40, len(pending))}/{len(pending)}")
    return result


def main() -> None:
    all_events = json.loads(ALL_PATH.read_text(encoding="utf-8"))
    ja_payload = json.loads(JA_TRANSLATION_PATH.read_text(encoding="utf-8"))
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    entries = [row for row in ja_payload.get("entries", []) if isinstance(row, dict)]
    entries_index: dict[tuple[str, str], dict] = {}
    for row in entries:
        event_id = normalize_locale_text(str(row.get("event_id", "")))
        field = normalize_locale_text(str(row.get("field", "")))
        if event_id and field:
            entries_index[(event_id, field)] = row

    title_candidates: set[str] = set()
    location_candidates: set[str] = set()
    category_candidates: set[str] = set()

    for event in all_events:
        if not isinstance(event, dict):
            continue
        event_id = normalize_locale_text(str(event.get("UID", "")))
        if not event_id:
            continue

        title = normalize_locale_text(str(event.get("title", "")))
        location_name = event_location_name(event)
        category = normalize_locale_text(str(event.get("category", "")))

        ensure_entry(entries_index, event_id, "title", title, now)
        ensure_entry(entries_index, event_id, "locationName", location_name, now)
        ensure_entry(entries_index, event_id, "categoryLabel", category, now)

        if needs_translation(title):
            title_candidates.add(title)
        if needs_translation(location_name):
            location_candidates.add(location_name)
        if needs_translation(category):
            category_candidates.add(category)

    title_map = translate_map(title_candidates)
    location_map = translate_map(location_candidates)
    category_map = translate_map(category_candidates)

    updated_count = 0
    for row in entries_index.values():
        source = normalize_locale_text(str(row.get("source", "")))
        field = normalize_locale_text(str(row.get("field", "")))
        if not source:
            row["text"] = ""
            row["status"] = "pending"
        elif field == "title":
            row["text"] = title_map.get(source, source)
            row["status"] = "translated"
        elif field == "locationName":
            row["text"] = location_map.get(source, source)
            row["status"] = "translated"
        elif field == "categoryLabel":
            row["text"] = category_map.get(source, source)
            row["status"] = "translated"
        else:
            row["text"] = source
            row["status"] = "translated"
        row["provider"] = "manual-curated-batch"
        row["updated_at"] = now
        updated_count += 1

    ja_payload["generated_at"] = now
    ja_payload["entries"] = sorted(
        entries_index.values(),
        key=lambda r: (str(r.get("event_id", "")), str(r.get("field", ""))),
    )
    JA_TRANSLATION_PATH.write_text(json.dumps(ja_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"updated_rows={updated_count}, total_entries={len(ja_payload['entries'])}, "
        f"title_map={len(title_map)}, location_map={len(location_map)}, category_map={len(category_map)}"
    )


if __name__ == "__main__":
    main()
