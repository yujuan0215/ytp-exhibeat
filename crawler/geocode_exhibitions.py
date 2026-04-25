import argparse
import json
import time
from pathlib import Path

from geopy.extra.rate_limiter import RateLimiter
from geopy.geocoders import Nominatim


def clean(s: str) -> str:
    return " ".join((s or "").split()).strip()


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


def main() -> None:
    parser = argparse.ArgumentParser(description="Fill showInfo latitude/longitude with geopy.")
    parser.add_argument("--inputs", nargs="+", required=True, help="JSON array files to geocode in place.")
    parser.add_argument("--delay-sec", type=float, default=1.2, help="Delay between uncached geocoding calls.")
    args = parser.parse_args()

    geolocator = Nominatim(user_agent="ytp-exhibeat-geocoder", timeout=8)
    geocode = RateLimiter(
        geolocator.geocode,
        min_delay_seconds=max(0.8, args.delay_sec),
        max_retries=2,
        swallow_exceptions=True,
        return_value_on_exception=None,
    )

    cache: dict[str, tuple[float, float] | None] = {}

    for input_path in [Path(p) for p in args.inputs]:
        payload = json.loads(input_path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise ValueError(f"{input_path} must be a JSON array")

        total = len(payload)
        changed = 0
        looked_up = 0
        print(f"\n== {input_path} ({total} events) ==")
        start = time.time()

        for idx, event in enumerate(payload, start=1):
            if not isinstance(event, dict):
                continue
            show_info = event.get("showInfo")
            if not isinstance(show_info, list) or not show_info:
                continue
            show = show_info[0]
            if not isinstance(show, dict):
                continue

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

            if idx % 20 == 0 or idx == total:
                print(f"[{idx}/{total}] changed={changed} looked_up={looked_up} cache={len(cache)}")

        input_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        elapsed = time.time() - start
        print(f"saved {input_path} | changed={changed} looked_up={looked_up} elapsed={elapsed:.1f}s")


if __name__ == "__main__":
    main()
