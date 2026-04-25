import argparse
import hashlib
import json
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from geopy.extra.rate_limiter import RateLimiter
from geopy.geocoders import Nominatim


DEFAULT_ACCUPASS_EXHIBITIONS = Path("data/accupass_north_taipei_exhibitions.json")
DEFAULT_ACCUPASS_LISTING = Path("data/accupass_north_taipei_listing.json")
DEFAULT_OPENTIX_NTCH = Path("data/opentix_exhibitions.json")
DEFAULT_OPENTIX_TPAC = Path("data/opentix2_exhibitions.json")
DEFAULT_ARTEMPEROR_TIDBITS = Path("data/artemperor_tidbits.json")
DEFAULT_OUTPUT = Path("data/exhibitions_merged.json")


def clean(s: str) -> str:
    return " ".join((s or "").split()).strip()


def to_date_slash(raw: str, fallback: str = "") -> str:
    text = clean(raw)
    if not text:
        return fallback
    m = re.search(r"(20\d{2})[./-](\d{1,2})[./-](\d{1,2})", text)
    if not m:
        return fallback
    y, mo, d = m.groups()
    return f"{int(y):04d}/{int(mo):02d}/{int(d):02d}"


def build_queries(show: dict) -> list[str]:
    location = clean(str(show.get("location", "")))
    location_name = clean(str(show.get("locationName", "")))
    location = location.replace("，", " ").replace("、", " ")
    location_name = location_name.replace("，", " ").replace("、", " ")
    queries: list[str] = []
    if location_name and location_name not in location:
        queries.append(f"{location_name}, {location}, Taiwan")
        queries.append(f"{location_name}, Taiwan")
    if location:
        queries.append(f"{location}, Taiwan")
    return [q for q in queries if q]


def ensure_show_info_shape(event: dict[str, Any]) -> dict[str, Any]:
    show_info = event.get("showInfo")
    if not isinstance(show_info, list) or not show_info or not isinstance(show_info[0], dict):
        event["showInfo"] = [{
            "time": "",
            "location": "",
            "locationName": "",
            "onSales": "",
            "price": "",
            "latitude": None,
            "longitude": None,
            "endTime": "",
        }]
    show = event["showInfo"][0]
    show.setdefault("time", "")
    show.setdefault("location", "")
    show.setdefault("locationName", "")
    show.setdefault("onSales", "")
    show.setdefault("price", "")
    show.setdefault("latitude", None)
    show.setdefault("longitude", None)
    show.setdefault("endTime", "")
    return event


def convert_accupass_listing(listing_path: Path) -> list[dict[str, Any]]:
    payload = json.loads(listing_path.read_text(encoding="utf-8"))
    items = payload.get("items", []) if isinstance(payload, dict) else []
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = clean(item.get("title", ""))
        if not title:
            continue
        source_url = clean(item.get("url", ""))
        uid_src = source_url or title
        uid = hashlib.md5(uid_src.encode("utf-8")).hexdigest()
        date_text = clean(item.get("date_time", ""))
        start = to_date_slash(date_text, "2026/01/01")
        end = start
        m_end = re.search(r"-\s*(\d{2})\.(\d{2})", date_text)
        if m_end and start:
            y = start.split("/")[0]
            end = f"{y}/{m_end.group(1)}/{m_end.group(2)}"
        location = clean(item.get("location", "")) or "台北市"
        out.append(ensure_show_info_shape({
            "version": "1.4",
            "UID": uid,
            "title": title,
            "category": "6",
            "showInfo": [{
                "time": f"{start} 00:00:00",
                "location": location,
                "locationName": location,
                "onSales": "Y",
                "price": "",
                "latitude": None,
                "longitude": None,
                "endTime": f"{end} 23:59:59",
            }],
            "showUnit": "ACCUPASS",
            "discountInfo": "",
            "descriptionFilterHtml": clean(item.get("raw_text", "")),
            "imageUrl": clean(item.get("image", "")),
            "masterUnit": ["ACCUPASS"],
            "subUnit": [],
            "supportUnit": [],
            "otherUnit": [],
            "webSales": source_url,
            "sourceWebPromote": source_url,
            "comment": "",
            "editModifyDate": "",
            "sourceWebName": "ACCUPASS",
            "startDate": start,
            "endDate": end,
            "hitRate": 0,
        }))
    return out


def convert_artemperor_tidbits(tidbits_path: Path) -> list[dict[str, Any]]:
    payload = json.loads(tidbits_path.read_text(encoding="utf-8"))
    items = payload.get("items", []) if isinstance(payload, dict) else []
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        title = clean(item.get("title", ""))
        if not title:
            continue
        uid = hashlib.md5(title.encode("utf-8")).hexdigest()
        date_text = clean(item.get("date", ""))
        date_matches = re.findall(r"(20\d{2})-(\d{2})-(\d{2})", date_text)
        if date_matches:
            start = f"{date_matches[0][0]}/{date_matches[0][1]}/{date_matches[0][2]}"
            end = f"{date_matches[-1][0]}/{date_matches[-1][1]}/{date_matches[-1][2]}"
        else:
            start = "2026/01/01"
            end = start
        location = clean(item.get("location", ""))
        links = item.get("related_link", []) if isinstance(item.get("related_link"), list) else []
        images = item.get("image", []) if isinstance(item.get("image"), list) else []
        out.append(ensure_show_info_shape({
            "version": "1.4",
            "UID": uid,
            "title": title,
            "category": "6",
            "showInfo": [{
                "time": f"{start} 00:00:00",
                "location": location,
                "locationName": location,
                "onSales": "",
                "price": "",
                "latitude": None,
                "longitude": None,
                "endTime": f"{end} 23:59:59",
            }],
            "showUnit": clean(item.get("author", "")),
            "discountInfo": "",
            "descriptionFilterHtml": clean(item.get("full_text", "")),
            "imageUrl": images[0] if images else "",
            "masterUnit": [clean(item.get("author", ""))] if clean(item.get("author", "")) else [],
            "subUnit": [],
            "supportUnit": [],
            "otherUnit": [],
            "webSales": "",
            "sourceWebPromote": links[0] if links else "",
            "comment": "",
            "editModifyDate": "",
            "sourceWebName": "Artemperor",
            "startDate": start,
            "endDate": end,
            "hitRate": 0,
            "artemperorMeta": {"allImages": images, "relatedLinks": links, "rawDate": date_text},
        }))
    return out


def load_events(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"{path} must be a JSON array")
    return [ensure_show_info_shape(ev) for ev in payload if isinstance(ev, dict)]


def geocode_events(events: list[dict[str, Any]], delay_sec: float) -> tuple[int, int]:
    geolocator = Nominatim(user_agent="ytp-exhibeat-geocoder", timeout=8)
    geocode = RateLimiter(
        geolocator.geocode,
        min_delay_seconds=max(0.8, delay_sec),
        max_retries=2,
        swallow_exceptions=True,
        return_value_on_exception=None,
    )
    cache: dict[str, tuple[float, float] | None] = {}
    changed = 0
    looked_up = 0
    total = len(events)

    for idx, event in enumerate(events, start=1):
        show = event["showInfo"][0]
        lat = show.get("latitude")
        lon = show.get("longitude")
        if lat is not None and lon is not None:
            continue
        queries = build_queries(show)
        if not queries:
            continue
        result = None
        for query in queries:
            if query in cache:
                result = cache[query]
            else:
                looked_up += 1
                loc = geocode(query, language="zh-TW", country_codes="tw")
                result = (float(loc.latitude), float(loc.longitude)) if loc else None
                cache[query] = result
            if result:
                break
        if result:
            show["latitude"] = result[0]
            show["longitude"] = result[1]
            changed += 1
        if idx % 50 == 0 or idx == total:
            print(f"[geocode {idx}/{total}] changed={changed} looked_up={looked_up} cache={len(cache)}")
    return changed, looked_up


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Merge four crawler results, geocode locations, and write unified exhibitions JSON."
    )
    parser.add_argument("--accupass-exhibitions", type=Path, default=DEFAULT_ACCUPASS_EXHIBITIONS)
    parser.add_argument("--accupass-listing", type=Path, default=DEFAULT_ACCUPASS_LISTING)
    parser.add_argument("--opentix-ntch", type=Path, default=DEFAULT_OPENTIX_NTCH)
    parser.add_argument("--opentix-tpac", type=Path, default=DEFAULT_OPENTIX_TPAC)
    parser.add_argument("--artemperor-tidbits", type=Path, default=DEFAULT_ARTEMPEROR_TIDBITS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--delay-sec", type=float, default=1.2)
    args = parser.parse_args()

    merged: list[dict[str, Any]] = []

    # ACCUPASS: prefer exhibitions output; fallback to listing conversion.
    if args.accupass_exhibitions.exists():
        accupass_events = load_events(args.accupass_exhibitions)
        print(f"loaded ACCUPASS exhibitions: {len(accupass_events)}")
    elif args.accupass_listing.exists():
        accupass_events = convert_accupass_listing(args.accupass_listing)
        print(f"converted ACCUPASS listing: {len(accupass_events)}")
    else:
        accupass_events = []
        print("skip ACCUPASS: no exhibitions/listing file found")
    merged.extend(accupass_events)

    if args.opentix_ntch.exists():
        ntch = load_events(args.opentix_ntch)
        merged.extend(ntch)
        print(f"loaded OPENTIX NTCH: {len(ntch)}")
    else:
        print("skip OPENTIX NTCH: file not found")

    if args.opentix_tpac.exists():
        tpac = load_events(args.opentix_tpac)
        merged.extend(tpac)
        print(f"loaded OPENTIX TPAC: {len(tpac)}")
    else:
        print("skip OPENTIX TPAC: file not found")

    if args.artemperor_tidbits.exists():
        artemperor_events = convert_artemperor_tidbits(args.artemperor_tidbits)
        merged.extend(artemperor_events)
        print(f"converted Artemperor tidbits: {len(artemperor_events)}")
    else:
        print("skip Artemperor tidbits: file not found")

    # Dedupe by UID (keep first occurrence by source priority above).
    deduped: list[dict[str, Any]] = []
    seen_uid: set[str] = set()
    for event in merged:
        uid = clean(str(event.get("UID", "")))
        if not uid or uid in seen_uid:
            continue
        seen_uid.add(uid)
        deduped.append(event)

    print(f"merged total={len(merged)} deduped={len(deduped)}")
    start = time.time()
    changed, looked_up = geocode_events(deduped, args.delay_sec)
    elapsed = time.time() - start

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(deduped, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"saved {args.output} | events={len(deduped)} changed={changed} looked_up={looked_up} elapsed={elapsed:.1f}s"
    )


if __name__ == "__main__":
    main()
