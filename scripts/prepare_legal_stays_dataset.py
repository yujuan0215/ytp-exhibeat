from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_INPUT_EN = ROOT_DIR / "data" / "raw" / "hotel-json" / "HotelList.json"
DEFAULT_INPUT_ZH = ROOT_DIR / "data" / "raw" / "hotel-json-zh-tw" / "HotelList.json"
DEFAULT_OUTPUT_DIR = ROOT_DIR / "data" / "legal_stays"

CLASS_LABELS = {
    1: "國際觀光旅館",
    2: "觀光旅館",
    3: "旅館",
    4: "民宿",
}

CLASS_LABELS_EN = {
    1: "International Tourist Hotel",
    2: "Tourist Hotel",
    3: "Hotel",
    4: "B&B",
}

SERVICE_STATUS_LABELS = {
    1: "營業中",
    2: "暫停營業",
    3: "歇業",
}

SERVICE_STATUS_LABELS_EN = {
    1: "Open",
    2: "Temporarily Closed",
    3: "Closed",
}

CITY_NAME_EN = {
    "臺北市": "Taipei City",
    "台北市": "Taipei City",
    "新北市": "New Taipei City",
    "基隆市": "Keelung City",
    "桃園市": "Taoyuan City",
    "新竹市": "Hsinchu City",
    "新竹縣": "Hsinchu County",
    "苗栗縣": "Miaoli County",
    "臺中市": "Taichung City",
    "台中市": "Taichung City",
    "彰化縣": "Changhua County",
    "南投縣": "Nantou County",
    "雲林縣": "Yunlin County",
    "嘉義市": "Chiayi City",
    "嘉義縣": "Chiayi County",
    "臺南市": "Tainan City",
    "台南市": "Tainan City",
    "高雄市": "Kaohsiung City",
    "屏東縣": "Pingtung County",
    "宜蘭縣": "Yilan County",
    "花蓮縣": "Hualien County",
    "臺東縣": "Taitung County",
    "台東縣": "Taitung County",
    "澎湖縣": "Penghu County",
    "金門縣": "Kinmen County",
    "連江縣": "Lienchiang County",
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


def contains_cjk(text: str) -> bool:
    return any(("\u4e00" <= ch <= "\u9fff") or ("\u3400" <= ch <= "\u4dbf") for ch in text)


def pick_english_name(name: str, alternate_names: list[str], operator_name: str) -> str:
    candidates = [*alternate_names, name, operator_name]
    for candidate in candidates:
        text = compact_text(candidate)
        if text and not contains_cjk(text):
            return text
    return compact_text(name)


def to_english_city(city: str) -> str:
    normalized = compact_text(city).replace("台", "臺")
    return CITY_NAME_EN.get(normalized, compact_text(city))


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


def _safe_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if text.isdigit():
            return int(text)
    return None


def normalize_images(value: Any) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in as_list(value):
        if not isinstance(item, dict):
            continue
        url = compact_text(item.get("URL") or item.get("Url") or item.get("url"))
        if not url:
            continue
        normalized.append(
            {
                "url": url,
                "name": compact_text(item.get("Name")),
                "description": compact_text(item.get("Description")),
                "width": _safe_int(item.get("Width")),
                "height": _safe_int(item.get("Height")),
                "keywords": [compact_text(keyword) for keyword in as_list(item.get("Keywords")) if compact_text(keyword)],
                "source": "official_tourism_dataset",
                "sourceLabel": "交通部觀光署旅宿網 / data.gov.tw dataset 7780",
                "license": "政府資料開放授權條款-第1版",
                "attribution": "交通部觀光署",
            }
        )
    return normalized


def normalize_hotel(raw: dict[str, Any], raw_en: dict[str, Any] | None = None) -> dict[str, Any] | None:
    lat = raw.get("PositionLat")
    lng = raw.get("PositionLon")
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return None

    address = raw.get("PostalAddress") if isinstance(raw.get("PostalAddress"), dict) else {}
    address_en = raw_en.get("PostalAddress") if raw_en and isinstance(raw_en.get("PostalAddress"), dict) else {}
    class_codes = [int(code) for code in as_list(raw.get("HotelClasses")) if isinstance(code, int)]
    alternate_names = [compact_text(name) for name in as_list(raw.get("AlternateNames")) if compact_text(name)]
    alternate_names_en = [
        compact_text(name)
        for name in as_list(raw_en.get("AlternateNames") if raw_en else None)
        if compact_text(name)
    ]
    organization_name = first_text(as_list(raw.get("Organizations")), "Name")
    organization_name_en = first_text(as_list(raw_en.get("Organizations") if raw_en else None), "Name")
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
    name_en_source = compact_text(raw_en.get("HotelName") if raw_en else "")
    name_en = pick_english_name(name_en_source or name, alternate_names_en or alternate_names, organization_name_en or organization_name)
    city_en = compact_text(address_en.get("City")) or to_english_city(city)
    town_en = compact_text(address_en.get("Town")) or compact_text(town)
    street_en = compact_text(address_en.get("StreetAddress")) or compact_text(street_address)
    description_en = compact_text(raw_en.get("Description") if raw_en else "") or compact_text(raw.get("Description"))
    images = normalize_images(raw.get("Images")) or normalize_images(raw_en.get("Images") if raw_en else None)
    media_detail_url = f"https://media.taiwan.net.tw/zh-tw/portal/travel/details/{compact_text(raw.get('HotelID')).lower()}"

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
        "nameEn": name_en,
        "alternateNames": alternate_names,
        "description": compact_text(raw.get("Description")),
        "descriptionEn": description_en,
        "operatorName": organization_name,
        "address": {
            "city": city,
            "cityEn": city_en,
            "cityCode": compact_text(address.get("CityCode")),
            "town": town,
            "townEn": town_en,
            "townCode": compact_text(address.get("TownCode")),
            "zipCode": compact_text(address.get("ZipCode")),
            "street": street_address,
            "streetEn": street_en,
            "full": street_address,
            "fullEn": " ".join(part for part in [street_en, town_en, city_en] if part),
        },
        "location": {"lat": float(lat), "lng": float(lng)},
        "classCodes": class_codes,
        "classLabels": [CLASS_LABELS.get(code, f"類別{code}") for code in class_codes],
        "classLabelsEn": [CLASS_LABELS_EN.get(code, f"Class {code}") for code in class_codes],
        "starRating": raw.get("HotelStars") or 0,
        "taiwanHost": raw.get("TaiwanHost") or 0,
        "serviceStatus": service_status,
        "serviceStatusLabel": SERVICE_STATUS_LABELS.get(service_status, "未知"),
        "serviceStatusLabelEn": SERVICE_STATUS_LABELS_EN.get(service_status, "Unknown"),
        "phones": phones,
        "urls": {
            "website": compact_text(raw.get("WebsiteURL")),
            "reservation": normalize_url_list(raw.get("ReservationURLs")),
            "map": normalize_url_list(raw.get("MapURLs")),
            "sameAs": normalize_url_list(raw.get("SameAsURLs")),
            "socialMedia": normalize_url_list(raw.get("SocialMediaURLs")),
        },
        "images": images,
        "primaryImageUrl": images[0]["url"] if images else "",
        "mediaDetailUrl": media_detail_url,
        "imageSourcePolicy": {
            "source": "official_only",
            "license": "政府資料開放授權條款-第1版",
            "attribution": "交通部觀光署",
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
    parser.add_argument("--input", default="", help="Legacy path to the primary HotelList.json; overrides --input-zh")
    parser.add_argument("--input-zh", default=str(DEFAULT_INPUT_ZH), help="Path to Traditional Chinese HotelList.json")
    parser.add_argument("--input-en", default=str(DEFAULT_INPUT_EN), help="Path to English HotelList.json")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directory for generated datasets")
    args = parser.parse_args()

    input_path = Path(args.input) if args.input else Path(args.input_zh)
    input_en_path = Path(args.input_en)
    output_dir = Path(args.output_dir)
    payload = json.loads(input_path.read_text(encoding="utf-8-sig"))
    payload_en = json.loads(input_en_path.read_text(encoding="utf-8-sig")) if input_en_path.exists() else {}
    raw_hotels = as_list(payload.get("Hotels"))
    raw_hotels_en = as_list(payload_en.get("Hotels"))
    english_by_id = {
        compact_text(raw.get("HotelID")): raw
        for raw in raw_hotels_en
        if isinstance(raw, dict) and compact_text(raw.get("HotelID"))
    }
    seen_ids: set[str] = set()
    stays = []
    for raw in raw_hotels:
        if not isinstance(raw, dict):
            continue
        hotel_id = compact_text(raw.get("HotelID"))
        seen_ids.add(hotel_id)
        stay = normalize_hotel(raw, english_by_id.get(hotel_id))
        if stay:
            stays.append(stay)
    for hotel_id, raw in english_by_id.items():
        if hotel_id in seen_ids:
            continue
        stay = normalize_hotel(raw, raw)
        if stay:
            stays.append(stay)
    stays.sort(key=lambda item: (item["address"]["city"], item["address"]["town"], item["name"], item["id"]))

    metadata = {
        "source": "交通部觀光署旅宿網 / data.gov.tw dataset 7780",
        "sourceFile": str(input_path.relative_to(ROOT_DIR)) if input_path.is_relative_to(ROOT_DIR) else str(input_path),
        "sourceFileZh": str(input_path.relative_to(ROOT_DIR)) if input_path.is_relative_to(ROOT_DIR) else str(input_path),
        "sourceFileEn": str(input_en_path.relative_to(ROOT_DIR)) if input_en_path.is_relative_to(ROOT_DIR) else str(input_en_path),
        "sourceUpdateTime": payload.get("UpdateTime"),
        "sourceUpdateTimeEn": payload_en.get("UpdateTime"),
        "sourceUpdateInterval": payload.get("UpdateInterval"),
        "language": payload.get("Language"),
        "languageEn": payload_en.get("Language"),
        "providerId": payload.get("ProviderID"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "totalSourceRecords": len(raw_hotels),
        "totalSourceRecordsEn": len(raw_hotels_en),
        "totalGeocodedRecords": len(stays),
        "totalEnglishFallbackRecords": sum(1 for stay in stays if stay["id"] not in seen_ids),
        "imageCoverage": {
            "recordsWithOfficialImages": sum(1 for stay in stays if stay.get("images")),
            "recordsWithoutOfficialImages": sum(1 for stay in stays if not stay.get("images")),
        },
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
