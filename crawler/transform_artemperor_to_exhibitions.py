import argparse
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def parse_date_range(raw: str) -> tuple[str, str]:
    text = clean_text(raw).replace("～", "~").replace("至", "~")
    matches = re.findall(r"\d{4}[-/]\d{1,2}[-/]\d{1,2}", text)
    if not matches:
        today = datetime.now().strftime("%Y/%m/%d")
        return today, today
    start = matches[0].replace("-", "/")
    end = matches[-1].replace("-", "/")
    return start, end


def to_culture_like_record(item: dict[str, Any], idx: int) -> dict[str, Any]:
    title = clean_text(item.get("title", ""))
    date_text = clean_text(item.get("date", ""))
    location = clean_text(item.get("location", ""))
    author = clean_text(item.get("author", ""))
    full_text = clean_text(item.get("full_text", ""))
    images = item.get("image", []) if isinstance(item.get("image", []), list) else []
    related_links = item.get("related_link", []) if isinstance(item.get("related_link", []), list) else []

    start_date, end_date = parse_date_range(date_text)
    uid_seed = f"{title}|{start_date}|{location}|{idx}"
    uid = hashlib.md5(uid_seed.encode("utf-8")).hexdigest()
    promote_url = related_links[0] if related_links else ""
    image_url = images[0] if images else ""

    return {
        "version": "artemperor-1.0",
        "UID": uid,
        "title": title or f"Artemperor Exhibition {idx + 1}",
        "category": "6",
        "showInfo": [
            {
                "time": f"{start_date} 00:00:00",
                "location": location,
                "locationName": location,
                "onSales": "",
                "price": "",
                "latitude": None,
                "longitude": None,
                "endTime": f"{end_date} 23:59:59",
            }
        ],
        "showUnit": author,
        "discountInfo": "",
        "descriptionFilterHtml": full_text,
        "imageUrl": image_url,
        "masterUnit": [author] if author else [],
        "subUnit": [],
        "supportUnit": [],
        "otherUnit": [],
        "webSales": "",
        "sourceWebPromote": promote_url,
        "comment": "",
        "editModifyDate": "",
        "sourceWebName": "Artemperor",
        "startDate": start_date,
        "endDate": end_date,
        "hitRate": 0,
        "artemperorMeta": {
            "allImages": images,
            "relatedLinks": related_links,
            "rawDate": date_text,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Transform Artemperor crawl JSON into exhibitions.json-like format.")
    parser.add_argument("--input", type=Path, required=True, help="Path to crawler output JSON.")
    parser.add_argument("--output", type=Path, required=True, help="Output JSON path.")
    args = parser.parse_args()

    payload = json.loads(args.input.read_text(encoding="utf-8"))
    items = payload.get("items", []) if isinstance(payload, dict) else []
    if not isinstance(items, list):
        items = []

    transformed = [to_culture_like_record(item, idx) for idx, item in enumerate(items) if isinstance(item, dict)]
    args.output.write_text(json.dumps(transformed, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Input items: {len(items)}")
    print(f"Transformed: {len(transformed)}")
    print(f"Output: {args.output.resolve()}")


if __name__ == "__main__":
    main()
