from __future__ import annotations

import argparse
import json
import math
import random
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

import numpy as np

try:
    from lightfm import LightFM
    from lightfm.data import Dataset
except ImportError as exc:  # pragma: no cover
    LightFM = None
    Dataset = None
    LIGHTFM_IMPORT_ERROR = exc
else:
    LIGHTFM_IMPORT_ERROR = None


ROOT_DIR = Path(__file__).resolve().parents[3]
DEFAULT_EXHIBITIONS_PATH = ROOT_DIR / "exhibitions.json"

CITY_KEYWORDS = [
    "台北市",
    "臺北市",
    "新北市",
    "基隆市",
    "桃園市",
    "新竹市",
    "新竹縣",
    "苗栗縣",
    "台中市",
    "臺中市",
    "彰化縣",
    "南投縣",
    "雲林縣",
    "嘉義市",
    "嘉義縣",
    "台南市",
    "臺南市",
    "高雄市",
    "屏東縣",
    "宜蘭縣",
    "花蓮縣",
    "台東縣",
    "臺東縣",
    "澎湖縣",
    "金門縣",
    "連江縣",
]

TAG_KEYWORDS = {
    "history": ["歷史", "考古", "文物", "遺址", "佛塔", "典藏", "百年"],
    "science": ["自然", "科學", "生命", "科技", "宇宙", "標本"],
    "music": ["音樂", "樂器", "演奏", "聲音"],
    "indigenous": ["原住民", "原民", "排灣", "族語"],
    "art": ["藝術", "美術", "典藏", "策展", "館藏", "裝置"],
    "family": ["親子", "互動", "遊戲", "桌遊", "孩子", "兒童"],
    "photogenic": ["攝影", "拍照", "視覺", "沉浸", "奇幻"],
    "women": ["女性", "女力", "性別"],
    "culture": ["文化", "故事", "地方", "博物館"],
}

VENUE_KEYWORDS = {
    "museum": ["博物館", "科博館", "史博", "故事館"],
    "art_museum": ["美術館", "藝廊", "藝術館"],
    "cultural_center": ["文化中心", "文化園區", "傳藝中心"],
}

POPULARITY_THRESHOLDS = {"high": 600, "medium": 120}


@dataclass(frozen=True)
class Persona:
    persona_id: str
    display_name: str
    preferred_cities: tuple[str, ...]
    preferred_tags: tuple[str, ...]
    wants_free: bool = False
    wants_popular: bool = False
    venue_focus: tuple[str, ...] = ()


@dataclass(frozen=True)
class Exhibition:
    uid: str
    title: str
    city: str
    location_name: str
    location: str
    start_date: date
    end_date: date
    hit_rate: int
    is_free: bool
    price_text: str
    tags: tuple[str, ...]
    venues: tuple[str, ...]
    features: tuple[str, ...]
    description: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ExhiBeat LightFM hybrid recommender demo")
    parser.add_argument("--exhibitions", default=str(DEFAULT_EXHIBITIONS_PATH))
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--date", default="", help="Reference date in YYYY-MM-DD or YYYY/MM/DD")
    parser.add_argument(
        "--backend",
        choices=("auto", "lightfm", "fallback"),
        default="auto",
        help="auto uses LightFM when available, otherwise a heuristic fallback",
    )
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--components", type=int, default=16)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--blend-alpha", type=float, default=0.65)
    parser.add_argument("--persona", default="", help="Only output one persona id")
    parser.add_argument("--cities", default="", help="Comma-separated preferred cities for an ad-hoc session persona")
    parser.add_argument("--tags", default="", help="Comma-separated preferred tags for an ad-hoc session persona")
    parser.add_argument("--venue-focus", default="", help="Comma-separated venue focus for an ad-hoc session persona")
    parser.add_argument("--free-only", action="store_true", help="Prefer free events for the ad-hoc session persona")
    parser.add_argument("--popular", action="store_true", help="Prefer popular events for the ad-hoc session persona")
    parser.add_argument("--persona-name", default="即時偏好使用者", help="Display name for the ad-hoc session persona")
    parser.add_argument("--output", default="", help="Write JSON results to a file")
    return parser.parse_args()


def normalize_city(raw: str) -> str:
    return raw.replace("臺", "台")


def clean_text(raw: str) -> str:
    no_html = re.sub(r"<[^>]+>", " ", raw or "")
    normalized = re.sub(r"\s+", " ", no_html)
    return normalized.strip()


def infer_city(location: str) -> str:
    normalized = normalize_city(location or "")
    for city in CITY_KEYWORDS:
        city_normalized = normalize_city(city)
        if city_normalized in normalized:
            return city_normalized
    return "未知"


def parse_date(raw: str) -> date:
    return datetime.strptime(raw, "%Y/%m/%d").date()


def parse_reference_date(raw: str) -> date:
    if not raw:
        return datetime.now().date()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    raise SystemExit(f"Invalid --date value: {raw}")


def infer_tags(title: str, description: str) -> tuple[str, ...]:
    haystack = f"{title} {description}"
    tags = {
        tag
        for tag, keywords in TAG_KEYWORDS.items()
        if any(keyword in haystack for keyword in keywords)
    }
    if not tags:
        tags.add("general")
    return tuple(sorted(tags))


def infer_venues(location_name: str, title: str, description: str) -> tuple[str, ...]:
    haystack = f"{location_name} {title} {description}"
    venues = {
        venue
        for venue, keywords in VENUE_KEYWORDS.items()
        if any(keyword in haystack for keyword in keywords)
    }
    if not venues:
        venues.add("general")
    return tuple(sorted(venues))


def infer_price_bucket(price_text: str) -> tuple[bool, str]:
    cleaned = clean_text(price_text)
    if not cleaned:
        return True, "price:free"
    if any(keyword in cleaned for keyword in ("免費", "免票", "自由參觀", "免收")):
        return True, "price:free"
    return False, "price:paid"


def infer_popularity_feature(hit_rate: int) -> str:
    if hit_rate >= POPULARITY_THRESHOLDS["high"]:
        return "popularity:high"
    if hit_rate >= POPULARITY_THRESHOLDS["medium"]:
        return "popularity:medium"
    return "popularity:low"


def infer_duration_feature(start_date: date, end_date: date) -> str:
    duration_days = (end_date - start_date).days
    if duration_days >= 180:
        return "duration:long_running"
    if duration_days >= 60:
        return "duration:mid_term"
    return "duration:short_term"


def build_exhibition(record: dict) -> Exhibition:
    show_info = (record.get("showInfo") or [{}])[0]
    description = clean_text(record.get("descriptionFilterHtml", ""))
    price_text = show_info.get("price", "")
    is_free, price_feature = infer_price_bucket(price_text)
    title = clean_text(record.get("title", "未命名展覽"))
    location = clean_text(show_info.get("location", ""))
    location_name = clean_text(show_info.get("locationName", ""))
    city = infer_city(location)
    start_date = parse_date(record["startDate"])
    end_date = parse_date(record["endDate"])
    tags = infer_tags(title, description)
    venues = infer_venues(location_name, title, description)
    features = {
        f"city:{city}",
        price_feature,
        infer_popularity_feature(int(record.get("hitRate") or 0)),
        infer_duration_feature(start_date, end_date),
    }
    for tag in tags:
        features.add(f"tag:{tag}")
    for venue in venues:
        features.add(f"venue:{venue}")

    return Exhibition(
        uid=record["UID"],
        title=title,
        city=city,
        location_name=location_name,
        location=location,
        start_date=start_date,
        end_date=end_date,
        hit_rate=int(record.get("hitRate") or 0),
        is_free=is_free,
        price_text=price_text,
        tags=tags,
        venues=venues,
        features=tuple(sorted(features)),
        description=description,
    )


def load_exhibitions(path: Path, reference_date: date) -> list[Exhibition]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    exhibitions = [build_exhibition(record) for record in payload]
    return [event for event in exhibitions if event.end_date >= reference_date]


def build_personas() -> list[Persona]:
    return [
        Persona(
            persona_id="taipei_after_work",
            display_name="台北下班看展族",
            preferred_cities=("台北市", "新北市", "基隆市"),
            preferred_tags=("art", "photogenic", "culture"),
            wants_popular=True,
            venue_focus=("art_museum", "cultural_center"),
        ),
        Persona(
            persona_id="family_rainy_day",
            display_name="親子雨天備案族",
            preferred_cities=("台中市", "台北市", "新北市"),
            preferred_tags=("family", "science", "history"),
            wants_free=True,
            venue_focus=("museum",),
        ),
        Persona(
            persona_id="southern_art_weekend",
            display_name="南部美術館週末族",
            preferred_cities=("高雄市", "台南市", "屏東縣"),
            preferred_tags=("art", "women", "culture"),
            wants_popular=False,
            venue_focus=("art_museum",),
        ),
        Persona(
            persona_id="history_nerd",
            display_name="歷史文化深度探索族",
            preferred_cities=("台中市", "台南市", "高雄市", "基隆市"),
            preferred_tags=("history", "culture", "indigenous"),
            wants_free=False,
            venue_focus=("museum", "cultural_center"),
        ),
        Persona(
            persona_id="free_city_explorer",
            display_name="免費城市探索族",
            preferred_cities=("台北市", "新北市", "基隆市", "桃園市"),
            preferred_tags=("culture", "photogenic", "general"),
            wants_free=True,
            wants_popular=True,
            venue_focus=("museum", "cultural_center", "general"),
        ),
    ]


def parse_csv_values(raw: str) -> tuple[str, ...]:
    return tuple(value.strip() for value in raw.split(",") if value.strip())


def build_runtime_persona(args: argparse.Namespace) -> Persona | None:
    preferred_cities = parse_csv_values(args.cities)
    preferred_tags = parse_csv_values(args.tags)
    venue_focus = parse_csv_values(args.venue_focus)
    if not preferred_cities and not preferred_tags and not venue_focus and not args.free_only and not args.popular:
        return None
    return Persona(
        persona_id="session_profile",
        display_name=args.persona_name,
        preferred_cities=preferred_cities or ("台北市",),
        preferred_tags=preferred_tags or ("general",),
        wants_free=args.free_only,
        wants_popular=args.popular,
        venue_focus=venue_focus or ("general",),
    )


def candidate_events_for_persona(persona: Persona, exhibitions: list[Exhibition]) -> list[Exhibition]:
    if persona.preferred_cities:
        matched = [event for event in exhibitions if event.city in persona.preferred_cities]
        if matched:
            return matched
    return exhibitions


def heuristic_score(persona: Persona, event: Exhibition, reference_date: date) -> float:
    score = 0.1
    if event.city in persona.preferred_cities:
        score += 2.5
    elif persona.preferred_cities:
        score -= 1.8
    score += len(set(persona.preferred_tags) & set(event.tags)) * 1.8
    score += len(set(persona.venue_focus) & set(event.venues)) * 0.9
    if persona.wants_free:
        score += 1.3 if event.is_free else -0.8
    if persona.wants_popular:
        score += min(math.log1p(event.hit_rate) / 3.0, 1.8)
    else:
        score += 0.4 if event.hit_rate < POPULARITY_THRESHOLDS["high"] else -0.2
    if event.start_date <= reference_date <= event.end_date:
        score += 0.5
    if (event.end_date - reference_date).days <= 30:
        score += 0.4
    return score


def build_user_feature_tokens(persona: Persona) -> tuple[str, ...]:
    features = {f"user_city:{city}" for city in persona.preferred_cities}
    features.update(f"user_tag:{tag}" for tag in persona.preferred_tags)
    features.update(f"user_venue:{venue}" for venue in persona.venue_focus)
    features.add("user_budget:free" if persona.wants_free else "user_budget:flexible")
    features.add("user_popularity:high" if persona.wants_popular else "user_popularity:balanced")
    return tuple(sorted(features))


def synthesize_interactions(
    personas: list[Persona], exhibitions: list[Exhibition], reference_date: date, seed: int
) -> dict[tuple[str, str], float]:
    rng = random.Random(seed)
    interactions: dict[tuple[str, str], float] = {}

    for persona in personas:
        persona_events = candidate_events_for_persona(persona, exhibitions)
        ranked = sorted(
            ((event, heuristic_score(persona, event, reference_date)) for event in persona_events),
            key=lambda entry: entry[1],
            reverse=True,
        )
        top_slice = ranked[: min(40, len(ranked))]
        for event, score in top_slice:
            click_threshold = 2.7 + rng.uniform(-0.25, 0.25)
            save_threshold = 4.2 + rng.uniform(-0.3, 0.3)
            if score >= click_threshold:
                interactions[(persona.persona_id, event.uid)] = 1.0
            if score >= save_threshold and rng.random() > 0.35:
                interactions[(persona.persona_id, event.uid)] = 3.0

    return interactions


def scale_scores(values: np.ndarray) -> np.ndarray:
    if values.size == 0:
        return values
    min_value = values.min()
    max_value = values.max()
    if math.isclose(float(min_value), float(max_value)):
        return np.ones_like(values)
    return (values - min_value) / (max_value - min_value)


def build_reasons(persona: Persona, event: Exhibition, reference_date: date) -> list[str]:
    reasons = []
    matched_tags = sorted(set(persona.preferred_tags) & set(event.tags))
    if event.city in persona.preferred_cities:
        reasons.append(f"符合偏好區域：{event.city}")
    if matched_tags:
        reasons.append(f"符合主題偏好：{', '.join(matched_tags)}")
    matched_venues = sorted(set(persona.venue_focus) & set(event.venues))
    if matched_venues:
        reasons.append(f"場館型態符合：{', '.join(matched_venues)}")
    if persona.wants_free and event.is_free:
        reasons.append("符合免費偏好")
    if persona.wants_popular and event.hit_rate >= POPULARITY_THRESHOLDS["high"]:
        reasons.append("近期熱門展覽")
    if 0 <= (event.end_date - reference_date).days <= 30:
        reasons.append("即將結束，值得優先安排")
    if not reasons:
        reasons.append("綜合內容與互動特徵排序靠前")
    return reasons[:3]


def resolve_backend(preferred_backend: str) -> str:
    if preferred_backend == "fallback":
        return "fallback"
    if LightFM is not None and Dataset is not None:
        return "lightfm"
    if preferred_backend == "lightfm":
        raise SystemExit(
            "LightFM backend requested, but LightFM is not installed.\n"
            "Recommended: Python 3.11/3.12 virtualenv + `pip install -r backend/app/recommender/requirements.txt`\n"
            f"Original import error: {LIGHTFM_IMPORT_ERROR}"
        )
    return "fallback"


def build_payload(backend_name: str, personas: list[Persona], exhibitions: list[Exhibition], interactions: dict[tuple[str, str], float], persona_results: list[dict], reference_date: date, args: argparse.Namespace) -> dict:
    return {
        "meta": {
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "today_assumption": reference_date.isoformat(),
            "backend": backend_name,
            "persona_count": len(personas),
            "event_count": len(exhibitions),
            "synthetic_interaction_count": len(interactions),
            "blend_alpha": args.blend_alpha,
        },
        "results": persona_results,
    }


def run_fallback_demo(
    personas: list[Persona],
    exhibitions: list[Exhibition],
    interactions: dict[tuple[str, str], float],
    reference_date: date,
    args: argparse.Namespace,
) -> dict:
    interaction_counts: dict[str, int] = {persona.persona_id: 0 for persona in personas}
    for persona_id, _ in interactions:
        interaction_counts[persona_id] += 1

    persona_results = []
    for persona in personas:
        seen_event_ids = {
            event_uid for (persona_id, event_uid), _weight in interactions.items() if persona_id == persona.persona_id
        }
        persona_events = candidate_events_for_persona(persona, exhibitions)
        ranked_events = sorted(
            [event for event in persona_events if event.uid not in seen_event_ids],
            key=lambda event: heuristic_score(persona, event, reference_date),
            reverse=True,
        )[: args.top_k]
        recommendations = [
            {
                "uid": event.uid,
                "title": event.title,
                "city": event.city,
                "location_name": event.location_name,
                "date_range": f"{event.start_date.isoformat()} -> {event.end_date.isoformat()}",
                "score": round(float(heuristic_score(persona, event, reference_date)), 4),
                "reasons": build_reasons(persona, event, reference_date),
            }
            for event in ranked_events
        ]
        persona_results.append(
            {
                "persona_id": persona.persona_id,
                "display_name": persona.display_name,
                "synthetic_positive_interactions": interaction_counts.get(persona.persona_id, 0),
                "recommendations": recommendations,
            }
        )

    return build_payload("fallback", personas, exhibitions, interactions, persona_results, reference_date, args)


def run_lightfm_demo(
    personas: list[Persona],
    exhibitions: list[Exhibition],
    interactions: dict[tuple[str, str], float],
    reference_date: date,
    args: argparse.Namespace,
) -> dict:
    dataset = Dataset(user_identity_features=True, item_identity_features=True)
    user_feature_names = sorted(
        {feature for persona in personas for feature in build_user_feature_tokens(persona)}
    )
    item_feature_names = sorted(
        {feature for exhibition in exhibitions for feature in exhibition.features}
    )
    dataset.fit(
        users=[persona.persona_id for persona in personas],
        items=[event.uid for event in exhibitions],
        user_features=user_feature_names,
        item_features=item_feature_names,
    )

    interaction_rows = [
        (persona_id, event_uid, weight)
        for (persona_id, event_uid), weight in sorted(interactions.items())
    ]
    interaction_matrix, interaction_weights = dataset.build_interactions(interaction_rows)
    user_features = dataset.build_user_features(
        (
            persona.persona_id,
            {feature: 1.0 for feature in build_user_feature_tokens(persona)},
        )
        for persona in personas
    )
    item_features = dataset.build_item_features(
        (event.uid, {feature: 1.0 for feature in event.features}) for event in exhibitions
    )

    model = LightFM(
        loss="warp",
        no_components=args.components,
        random_state=np.random.RandomState(args.seed),
    )
    model.fit(
        interaction_matrix,
        sample_weight=interaction_weights,
        user_features=user_features,
        item_features=item_features,
        epochs=args.epochs,
        num_threads=args.threads,
    )

    user_id_map, _, item_id_map, _ = dataset.mapping()
    item_index_to_uid = {index: uid for uid, index in item_id_map.items()}
    event_by_uid = {event.uid: event for event in exhibitions}

    persona_results = []
    interaction_csr = interaction_matrix.tocsr()

    for persona in personas:
        user_index = user_id_map[persona.persona_id]
        known_items = set(interaction_csr[user_index].indices.tolist())
        allowed_uids = {event.uid for event in candidate_events_for_persona(persona, exhibitions)}
        candidate_indices = [
            idx
            for idx in range(len(item_id_map))
            if idx not in known_items and item_index_to_uid[idx] in allowed_uids
        ]
        if not candidate_indices:
            persona_results.append(
                {
                    "persona_id": persona.persona_id,
                    "display_name": persona.display_name,
                    "synthetic_positive_interactions": int(interaction_csr[user_index].count_nonzero()),
                    "recommendations": [],
                }
            )
            continue
        candidate_events = [event_by_uid[item_index_to_uid[idx]] for idx in candidate_indices]

        lightfm_scores = model.predict(
            user_ids=user_index,
            item_ids=np.array(candidate_indices),
            user_features=user_features,
            item_features=item_features,
            num_threads=args.threads,
        )
        heuristic_scores = np.array([heuristic_score(persona, event, reference_date) for event in candidate_events])
        blended_scores = (
            scale_scores(lightfm_scores) * args.blend_alpha
            + scale_scores(heuristic_scores) * (1.0 - args.blend_alpha)
        )
        top_positions = np.argsort(-blended_scores)[: args.top_k]

        recommendations = []
        for position in top_positions:
            event = candidate_events[int(position)]
            recommendations.append(
                {
                    "uid": event.uid,
                    "title": event.title,
                    "city": event.city,
                    "location_name": event.location_name,
                    "date_range": f"{event.start_date.isoformat()} -> {event.end_date.isoformat()}",
                    "score": round(float(blended_scores[int(position)]), 4),
                    "reasons": build_reasons(persona, event, reference_date),
                }
            )

        persona_results.append(
            {
                "persona_id": persona.persona_id,
                "display_name": persona.display_name,
                "synthetic_positive_interactions": int(interaction_csr[user_index].count_nonzero()),
                "recommendations": recommendations,
            }
        )

    return build_payload("lightfm", personas, exhibitions, interactions, persona_results, reference_date, args)


def run_demo(args: argparse.Namespace) -> dict:
    reference_date = parse_reference_date(args.date)
    exhibitions = load_exhibitions(Path(args.exhibitions), reference_date)
    runtime_persona = build_runtime_persona(args)
    personas = [runtime_persona] if runtime_persona else build_personas()
    if args.persona and not runtime_persona:
        personas = [persona for persona in personas if persona.persona_id == args.persona]
        if not personas:
            raise SystemExit(f"Unknown persona: {args.persona}")

    if runtime_persona:
        interactions: dict[tuple[str, str], float] = {}
    else:
        interactions = synthesize_interactions(personas, exhibitions, reference_date, seed=args.seed)
    backend_name = resolve_backend(args.backend)
    if runtime_persona and not interactions and backend_name == "lightfm":
        backend_name = "fallback"
    if backend_name == "lightfm":
        return run_lightfm_demo(personas, exhibitions, interactions, reference_date, args)
    return run_fallback_demo(personas, exhibitions, interactions, reference_date, args)


def main() -> None:
    args = parse_args()
    payload = run_demo(args)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2)
    print(serialized)
    if args.output:
        Path(args.output).write_text(serialized + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
