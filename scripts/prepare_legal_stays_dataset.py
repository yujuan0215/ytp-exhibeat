from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT_DIR / "data" / "raw" / "hotel-json" / "HotelList.json"
DEFAULT_OUTPUT_DIR = ROOT_DIR / "data" / "legal_stays"

CLASS_LABELS = {
    1: "國際觀光旅館",
    2: "觀光旅館",
    3: "旅館",
    4: "民宿",
}

SERVICE_STATUS_LABELS = {
    1: "營業中",
    2: "暫停營業",
    3: "歇業",
}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def first_text(items: list[Any], key: str) -> str:
    for item in items:
        if isinstance(item, dict) and item.get(key):
            return str(item[key]).strip()
    return ""


def compact_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def normalize_url_list(value: Any) -> list[str]:
    urls: list[str] = []
    for item in as_list(value):
        if isinstance(item, str) and item.strip():
            urls.append(item.strip())
        elif isinstance(item, dict):
            raw = item.get("URL") or item.get("Url") or item.get("url")
            if raw:
                urls.append(str(raw).strip())
    return urls


def normalize_hotel(raw: dict[str, Any]) -> dict[str, Any] | None:
    lat = raw.get("PositionLat")
    lng = raw.get("PositionLon")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return None

    address = raw.get("PostalAddress") if isinstance(raw.get("PostalAddress"), dict) else {}
    class_codes = [int(code) for code in as_list(raw.get("HotelClasses")) if isinstance(code, int)]
    alternate_names = [compact_text(name) for name in as_list(raw.get("AlternateNames")) if compact_text(name)]
    organization_name = first_text(as_list(raw.get("Organizations")), "Name")
    phones = [compact_text(item.get("Tel")) for item in as_list(raw.get("Telephones")) if isinstance(item, dict) and item.get("Tel")]
    facilities = [
        compact_text(item.get("Name") if isinstance(item, dict) else item)
        for item in as_list(raw.get("Facilities"))
        if compact_text(item.get("Name") if isinstance(item, dict) else item)
    ]
    payment_methods = [
        compact_text(item.get("Name") if isinstance(item, dict) else item)
        for item in as_list(raw.get("PaymentMethods"))
        if compact_text(item.get("Name") if isinstance(item, dict) else item)
    ]

    name = compact_text(raw.get("HotelName"))
    street_address = compact_text(address.get("StreetAddress"))
    city = compact_text(address.get("City"))
    town = compact_text(address.get("Town"))
    license_number = compact_text(raw.get("HotelLicenseNumber"))
    service_status = raw.get("ServiceStatus")

    search_parts = [
        name,
        *alternate_names,
        organization_name,
        license_number,
        city,
        town,
        street_address,
        compact_text(raw.get("Description")),
    ]

    return {
        "id": compact_text(raw.get("HotelID")),
        "licenseNumber": license_number,
        "name": name,
        "alternateNames": alternate_names,
        "description": compact_text(raw.get("Description")),
        "operatorName": organization_name,
        "address": {
            "city": city,
            "cityCode": compact_text(address.get("CityCode")),
            "town": town,
            "townCode": compact_text(address.get("TownCode")),
            "zipCode": compact_text(address.get("ZipCode")),
            "street": street_address,
            "full": street_address,
        },
        "location": {"lat": float(lat), "lng": float(lng)},
        "classCodes": class_codes,
        "classLabels": [CLASS_LABELS.get(code, f"類別{code}") for code in class_codes],
        "starRating": raw.get("HotelStars") or 0,
        "taiwanHost": raw.get("TaiwanHost") or 0,
        "serviceStatus": service_status,
        "serviceStatusLabel": SERVICE_STATUS_LABELS.get(service_status, "未知"),
        "phones": phones,
        "urls": {
            "website": compact_text(raw.get("WebsiteURL")),
            "reservation": normalize_url_list(raw.get("ReservationURLs")),
            "map": normalize_url_list(raw.get("MapURLs")),
            "sameAs": normalize_url_list(raw.get("SameAsURLs")),
            "socialMedia": normalize_url_list(raw.get("SocialMediaURLs")),
        },
        "facilities": facilities,
        "paymentMethods": payment_methods,
        "parkingInfo": compact_text(raw.get("ParkingInfo")),
        "roomInfo": compact_text(raw.get("RoomInfo")),
        "serviceInfo": compact_text(raw.get("ServiceInfo")),
        "totalRooms": raw.get("TotalRooms") or 0,
        "totalCapacity": raw.get("TotalCapacity") or 0,
        "priceRange": {
            "lowest": raw.get("LowestPrice") or 0,
            "ceiling": raw.get("CeilingPrice") or 0,
        },
        "accessibility": {
            "accessibleRooms": raw.get("AccessibleRooms") or 0,
            "toilets": raw.get("Toilets") or 0,
            "liftingEquipments": raw.get("LiftingEquipments") or 0,
            "parkingSpaces": raw.get("ParkingSpaces") or 0,
        },
        "remarks": compact_text(raw.get("Remarks")),
        "updateTime": compact_text(raw.get("UpdateTime")),
        "source": "交通部觀光署旅宿網 / data.gov.tw dataset 7780",
        "searchText": " ".join(part for part in search_parts if part),
    }


def build_geojson(stays: list[dict[str, Any]], metadata: dict[str, Any]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "metadata": metadata,
        "features": [
            {
                "type": "Feature",
                "id": stay["id"],
                "geometry": {
                    "type": "Point",
                    "coordinates": [stay["location"]["lng"], stay["location"]["lat"]],
                },
                "properties": {
                    "id": stay["id"],
                    "licenseNumber": stay["licenseNumber"],
                    "name": stay["name"],
                    "classLabels": stay["classLabels"],
                    "serviceStatus": stay["serviceStatus"],
                    "serviceStatusLabel": stay["serviceStatusLabel"],
                    "city": stay["address"]["city"],
                    "town": stay["address"]["town"],
                    "address": stay["address"]["full"],
                    "lowestPrice": stay["priceRange"]["lowest"],
                    "ceilingPrice": stay["priceRange"]["ceiling"],
                    "totalRooms": stay["totalRooms"],
                    "website": stay["urls"]["website"],
                    "updateTime": stay["updateTime"],
                },
            }
            for stay in stays
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize Taiwan legal accommodation open data.")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Path to HotelList.json")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directory for generated datasets")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    payload = json.loads(input_path.read_text(encoding="utf-8-sig"))
    raw_hotels = as_list(payload.get("Hotels"))
    stays = [stay for stay in (normalize_hotel(raw) for raw in raw_hotels if isinstance(raw, dict)) if stay]
    stays.sort(key=lambda item: (item["address"]["city"], item["address"]["town"], item["name"], item["id"]))

    metadata = {
        "source": "交通部觀光署旅宿網 / data.gov.tw dataset 7780",
        "sourceFile": str(input_path.relative_to(ROOT_DIR)) if input_path.is_relative_to(ROOT_DIR) else str(input_path),
        "sourceUpdateTime": payload.get("UpdateTime"),
        "sourceUpdateInterval": payload.get("UpdateInterval"),
        "language": payload.get("Language"),
        "providerId": payload.get("ProviderID"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalSourceRecords": len(raw_hotels),
        "totalGeocodedRecords": len(stays),
    }

    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "legal_stays.json").write_text(
        json.dumps({"metadata": metadata, "stays": stays}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_dir / "legal_stays.geojson").write_text(
        json.dumps(build_geojson(stays, metadata), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"Wrote {len(stays)} legal stays to {output_dir}")


if __name__ == "__main__":
    main()
