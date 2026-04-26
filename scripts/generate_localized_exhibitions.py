import copy
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
BASE_PATH = DATA_DIR / "all_exhibitions.json"
TRANSLATION_DIR = DATA_DIR / "exhibition_translations"


def load_translation_table(path: Path) -> dict[tuple[str, str], str]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    table: dict[tuple[str, str], str] = {}
    for row in payload.get("entries", []):
        event_id = str(row.get("event_id", "")).strip()
        field = str(row.get("field", "")).strip()
        if not event_id or not field:
            continue
        text = str(row.get("text", ""))
        source = str(row.get("source", ""))
        # Fallback to source text when translation is pending/blank.
        table[(event_id, field)] = text if text.strip() else source
    return table


def localize_dataset(base_rows: list[dict], table: dict[tuple[str, str], str]) -> list[dict]:
    localized: list[dict] = []
    for row in base_rows:
        event_id = str(row.get("UID", "")).strip()
        cloned = copy.deepcopy(row)
        if event_id:
            translated_title = table.get((event_id, "title"), "")
            if translated_title.strip():
                cloned["title"] = translated_title
            translated_location = table.get((event_id, "locationName"), "")
            if translated_location.strip():
                show_info = cloned.get("showInfo")
                if isinstance(show_info, list):
                    for item in show_info:
                        if isinstance(item, dict) and isinstance(item.get("locationName"), str):
                            item["locationName"] = translated_location
        localized.append(cloned)
    return localized


def main() -> None:
    base_rows = json.loads(BASE_PATH.read_text(encoding="utf-8"))
    generated = []
    for translation_file in sorted(TRANSLATION_DIR.glob("exhibition_translations.*.json")):
        locale = translation_file.stem.split("exhibition_translations.", 1)[-1]
        table = load_translation_table(translation_file)
        localized = localize_dataset(base_rows, table)
        out_path = DATA_DIR / f"all_exhibitions_{locale}.json"
        out_path.write_text(json.dumps(localized, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        generated.append(out_path.name)
    print("generated_files=", ",".join(generated))


if __name__ == "__main__":
    main()
