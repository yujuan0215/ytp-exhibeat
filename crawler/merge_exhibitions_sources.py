import argparse
import json
import re
from pathlib import Path
from typing import Any


def normalize_text(value: str) -> str:
    text = (value or "").strip().lower()
    text = text.replace("臺", "台")
    return re.sub(r"\s+", " ", text)


def first_show_info(event: dict[str, Any]) -> dict[str, Any]:
    show_info = event.get("showInfo")
    if isinstance(show_info, list) and show_info and isinstance(show_info[0], dict):
        return show_info[0]
    return {}


def event_key(event: dict[str, Any]) -> str:
    uid = normalize_text(str(event.get("UID", "")))
    if uid:
        return f"uid:{uid}"

    show = first_show_info(event)
    title = normalize_text(str(event.get("title", "")))
    start_date = normalize_text(str(event.get("startDate", "")))
    venue = normalize_text(str(show.get("locationName", "") or show.get("location", "")))
    return f"fallback:{title}|{start_date}|{venue}"


def merge_events(files: list[Path]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for file_path in files:
        data = json.loads(file_path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            continue
        for event in data:
            if not isinstance(event, dict):
                continue
            key = event_key(event)
            if key in seen:
                continue
            seen.add(key)
            merged.append(event)
    return merged


def main() -> None:
    parser = argparse.ArgumentParser(description="Merge multiple exhibitions-like JSON arrays with dedup.")
    parser.add_argument("--inputs", nargs="+", required=True, help="Input exhibitions JSON files")
    parser.add_argument("--output", type=Path, required=True, help="Output merged JSON file")
    args = parser.parse_args()

    input_files = [Path(p) for p in args.inputs]
    merged = merge_events(input_files)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Input files: {len(input_files)}")
    print(f"Merged events: {len(merged)}")
    print(f"Output: {args.output.resolve()}")


if __name__ == "__main__":
    main()
