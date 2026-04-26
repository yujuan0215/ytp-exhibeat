import json
import re
from pathlib import Path

from deep_translator import GoogleTranslator


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = ROOT / "data" / "all_exhibitions.json"
TARGET_PATH = ROOT / "data" / "all_exhibitions_en.json"


def normalize_space(text: str) -> str:
    return " ".join(str(text or "").split()).strip()


def strip_html(text: str) -> str:
    return normalize_space(re.sub(r"<[^>]+>", " ", str(text or "")))


def needs_translation(text: str) -> bool:
    value = normalize_space(text)
    if not value:
        return False
    return any("\u4e00" <= ch <= "\u9fff" for ch in value)


def build_summary_source(event: dict) -> str:
    existing = normalize_space(str(event.get("aiSummary") or event.get("ai_summary") or event.get("summary") or ""))
    if existing:
        return existing
    description = strip_html(str(event.get("description") or event.get("descriptionFilterHtml") or ""))
    return description[:120]


def chunked(values: list[str], size: int):
    for i in range(0, len(values), size):
        yield values[i : i + size]


def translate_map(texts: set[str]) -> dict[str, str]:
    translator = GoogleTranslator(source="zh-TW", target="en")
    pending = sorted(texts)
    result: dict[str, str] = {}
    for idx, batch in enumerate(chunked(pending, 40), start=1):
        translated = translator.translate_batch(batch)
        if not isinstance(translated, list) or len(translated) != len(batch):
            translated = [translator.translate(item) for item in batch]
        for src, dst in zip(batch, translated):
            result[src] = normalize_space(dst) or src
        if idx % 5 == 0:
            print(f"translated_batches={idx}, done={min(idx*40, len(pending))}/{len(pending)}")
    return result


def main() -> None:
    rows = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    title_texts: set[str] = set()
    location_texts: set[str] = set()
    summary_texts: set[str] = set()

    for event in rows:
        if not isinstance(event, dict):
            continue
        title = normalize_space(str(event.get("title", "")))
        if needs_translation(title):
            title_texts.add(title)

        show_info = event.get("showInfo")
        if isinstance(show_info, list):
            for show in show_info:
                if not isinstance(show, dict):
                    continue
                loc_name = normalize_space(str(show.get("locationName", "")))
                loc = normalize_space(str(show.get("location", "")))
                if needs_translation(loc_name):
                    location_texts.add(loc_name)
                if needs_translation(loc):
                    location_texts.add(loc)

        summary = build_summary_source(event)
        if needs_translation(summary):
            summary_texts.add(summary)

    print(f"title_to_translate={len(title_texts)} location_to_translate={len(location_texts)} summary_to_translate={len(summary_texts)}")
    title_map = translate_map(title_texts)
    location_map = translate_map(location_texts)
    summary_map = translate_map(summary_texts)

    converted = []
    for event in rows:
        if not isinstance(event, dict):
            continue
        row = dict(event)
        title = normalize_space(str(row.get("title", "")))
        row["title"] = title_map.get(title, title)

        show_info = row.get("showInfo")
        if isinstance(show_info, list):
            new_show = []
            for show in show_info:
                if not isinstance(show, dict):
                    new_show.append(show)
                    continue
                s = dict(show)
                loc_name = normalize_space(str(s.get("locationName", "")))
                loc = normalize_space(str(s.get("location", "")))
                s["locationName"] = location_map.get(loc_name, loc_name)
                s["location"] = location_map.get(loc, loc)
                new_show.append(s)
            row["showInfo"] = new_show

        summary = build_summary_source(row)
        row["aiSummary"] = summary_map.get(summary, summary if summary else "")
        converted.append(row)

    TARGET_PATH.write_text(json.dumps(converted, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"written_rows={len(converted)} -> {TARGET_PATH.name}")


if __name__ == "__main__":
    main()
