import argparse
import json
import re
from pathlib import Path
from typing import Any
from datetime import datetime


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
            event["tag"] = build_default_tags(event)
            merged.append(event)
    return merged


ADMIN_DISTRICT_PATTERN = re.compile(
    r"(中正區|大同區|中山區|松山區|大安區|萬華區|信義區|士林區|北投區|內湖區|南港區|文山區|"
    r"板橋區|三重區|中和區|永和區|新莊區|新店區|土城區|蘆洲區|汐止區|樹林區|鶯歌區|三峽區|淡水區|瑞芳區|"
    r"五股區|泰山區|林口區|深坑區|石碇區|坪林區|三芝區|石門區|八里區|平溪區|雙溪區|貢寮區|金山區|萬里區|烏來區|"
    r"[^\s,，、]{1,6}(?:區|鎮|鄉|市))"
)

INVALID_ADMIN_TAGS = {
    "台北市",
    "臺北市",
    "新北市",
    "桃園市",
    "台中市",
    "臺中市",
    "台南市",
    "臺南市",
    "高雄市",
    "展區",
    "園區",
    "校區",
    "館區",
    "特區",
    "地區",
}

CITY_PREFIXES = [
    "台北市",
    "臺北市",
    "新北市",
    "桃園市",
    "新竹市",
    "台中市",
    "臺中市",
    "台南市",
    "臺南市",
    "高雄市",
    "基隆市",
    "嘉義市",
]


def strip_city_prefix(value: str) -> str:
    cleaned = value.strip().lstrip("（(【[").rstrip("）)】],，。;；")
    for prefix in CITY_PREFIXES:
        if cleaned.startswith(prefix):
            return cleaned[len(prefix) :].strip()
    return cleaned


def pick_area_tag(event: dict[str, Any]) -> str | None:
    show = first_show_info(event)
    fields = [
        str(show.get("locationName", "")),
        str(show.get("location", "")),
        str(event.get("title", "")),
        str(event.get("descriptionFilterHtml", "")),
    ]
    text = " ".join(fields)
    for m in ADMIN_DISTRICT_PATTERN.finditer(text):
        district = strip_city_prefix(m.group(1))
        if not district or district in INVALID_ADMIN_TAGS:
            continue
        if district.endswith("市") and district not in {"竹北市", "竹南市", "頭份市", "太保市", "朴子市"}:
            continue
        return f"#{district}"
    return None


def pick_indoor_outdoor_tag(event: dict[str, Any]) -> str | None:
    text = normalize_text(
        " ".join(
            [
                str(event.get("title", "")),
                str(event.get("descriptionFilterHtml", "")),
                str(first_show_info(event).get("locationName", "")),
            ]
        )
    )
    outdoor_keywords = ["戶外", "露天", "公園", "廣場", "步道", "野外", "海邊", "沙灘", "草地"]
    indoor_keywords = ["室內", "展館", "美術館", "博物館", "劇場", "影廳", "音樂廳", "展演廳", "藝文中心"]
    if any(k in text for k in outdoor_keywords):
        return "#室外"
    if any(k in text for k in indoor_keywords):
        return "#室內"
    return None


def _extract_numeric_values(text: str) -> list[int]:
    return [int(n) for n in re.findall(r"\d+", text or "")]


def _extract_price_values_from_text(text: str) -> list[int]:
    if not text:
        return []
    values: list[int] = []
    patterns = [
        r"(?:nt\$|ntd|twd|新台幣|台幣|票價|全票|優惠票|入場費|費用)\s*[:：]?\s*(\d{1,5})",
        r"(\d{1,5})\s*(?:元|塊)",
    ]
    for pattern in patterns:
        values.extend(int(m) for m in re.findall(pattern, text, flags=re.IGNORECASE))
    return values


def pick_price_tag(event: dict[str, Any]) -> str | None:
    show = first_show_info(event)
    show_price = str(show.get("price", "")).strip()
    raw_price = " ".join(
        [
            show_price,
            str(event.get("descriptionFilterHtml", "")),
            str(event.get("title", "")),
        ]
    )
    values = _extract_numeric_values(show_price) if show_price else []
    if not values:
        normalized = normalize_text(raw_price)
        if any(k in normalized for k in ["免費", "免票", "free", "無須購票"]):
            return "#低價位"
        values = _extract_price_values_from_text(raw_price)
    if not values:
        return None
    price = max(values)
    if price < 400:
        return "#低價位"
    if price < 900:
        return "#中價位"
    return "#高價位"


def pick_time_tag(event: dict[str, Any]) -> str | None:
    show = first_show_info(event)
    time_value = str(show.get("time", "")).strip()
    hour: int | None = None
    minute: int | None = None
    if time_value:
        try:
            dt = datetime.strptime(time_value, "%Y/%m/%d %H:%M:%S")
            hour = dt.hour
            minute = dt.minute
        except ValueError:
            m = re.search(r"(\d{1,2}):(\d{2})", time_value)
            if m:
                hour = int(m.group(1))
                minute = int(m.group(2))
    # A lot of feeds use 00:00:00 as a date-only placeholder.
    if hour is None or (hour == 0 and (minute or 0) == 0):
        desc = str(event.get("descriptionFilterHtml", ""))
        m = re.search(r"(\d{1,2}):(\d{2})", desc)
        if m:
            hour = int(m.group(1))
    if hour is None:
        return None
    if hour < 12:
        return "#早上"
    if hour < 18:
        return "#中午"
    return "#晚上"


def build_default_tags(event: dict[str, Any]) -> list[str]:
    # Fixed categories requested: area, indoor/outdoor, price, visit time.
    candidates = [
        pick_area_tag(event),
        pick_indoor_outdoor_tag(event),
        pick_price_tag(event),
        pick_time_tag(event),
    ]
    result: list[str] = []
    seen: set[str] = set()
    for tag in candidates:
        if not tag or tag in seen:
            continue
        seen.add(tag)
        result.append(tag)
    return result


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
