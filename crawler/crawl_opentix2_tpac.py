import argparse
import hashlib
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = "https://www.opentix.life/o/tpac?tab=All_Events"
DEFAULT_OUTPUT = Path("data/opentix2_exhibitions.json")
DEFAULT_MAX_ITEMS = 0
DEFAULT_MAX_SCROLL_ROUNDS = 120
DEFAULT_STAGNANT_ROUNDS = 12
SOURCE_LABEL = "OPENTIX2"


def now_ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def log(message: str) -> None:
    text = str(message)
    try:
        print(text)
    except UnicodeEncodeError:
        safe = text.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(
            sys.stdout.encoding or "utf-8", errors="replace"
        )
        print(safe)


def clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def unique_keep_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            out.append(value)
    return out


def normalize_href(href: str) -> str:
    if href.startswith("//"):
        return f"https:{href}"
    if href.startswith("/"):
        return urljoin("https://www.opentix.life", href)
    return href


def parse_date_candidates(text: str) -> list[str]:
    patterns = [
        r"(20\d{2})[./-](\d{1,2})[./-](\d{1,2})",
        r"(20\d{2})年(\d{1,2})月(\d{1,2})日",
    ]
    matches: list[str] = []
    for pattern in patterns:
        for y, m, d in re.findall(pattern, text):
            matches.append(f"{int(y):04d}/{int(m):02d}/{int(d):02d}")
    return unique_keep_order(matches)


def first_non_empty(page, selectors: list[str]) -> str:
    for selector in selectors:
        node = page.locator(selector).first
        if node.count() == 0:
            continue
        try:
            if selector.startswith("meta["):
                text = clean_text(node.get_attribute("content"))
            else:
                text = clean_text(node.inner_text())
            if text:
                return text
        except Exception:
            continue
    return ""


def collect_images(page) -> list[str]:
    urls: list[str] = []
    for selector in ["meta[property='og:image']", "img[src]"]:
        nodes = page.locator(selector)
        count = min(nodes.count(), 120)
        for i in range(count):
            try:
                if selector.startswith("meta["):
                    src = clean_text(nodes.nth(i).get_attribute("content"))
                else:
                    src = clean_text(nodes.nth(i).get_attribute("src"))
                if not src or src.startswith("data:"):
                    continue
                src = normalize_href(src)
                urls.append(src)
            except Exception:
                continue
    return unique_keep_order(urls)


def guess_location(text: str) -> str:
    m = re.search(
        r"((?:台北|臺北|新北|桃園|台中|臺中|台南|臺南|高雄|基隆|新竹|嘉義|宜蘭|花蓮|台東|臺東|屏東)[^\n]{0,40})",
        text,
    )
    return clean_text(m.group(1)) if m else ""


def _trim_by_markers(text: str, markers: list[str]) -> str:
    out = text
    for marker in markers:
        idx = out.find(marker)
        if idx != -1:
            out = out[:idx]
    return clean_text(out)


def extract_location_fields(text: str) -> tuple[str, str]:
    location_name = ""
    location = ""

    venue_match = re.search(r"選擇場館\s*([^\n]{1,40}?)\s*場館地址[:：]", text)
    if venue_match:
        location_name = clean_text(venue_match.group(1))

    addr_match = re.search(r"場館地址[:：]\s*([^\n]{1,140})", text)
    if addr_match:
        raw_addr = clean_text(addr_match.group(1))
        location = _trim_by_markers(
            raw_addr,
            [" 地圖", "選擇場次", "選擇日期", "提供電子票", "剩：", "票價：", "節目介紹"],
        )

    if not location:
        location = guess_location(text)
        location = _trim_by_markers(location, [" 地圖", "選擇場次", "選擇日期", "票價："])

    if not location_name:
        loc_name_match = re.search(r"(國家[^\s，。]{1,20}|臺北表演藝術中心[^\s，。]{0,12})(?:\s*場館地址|提供電子票|剩：)", text)
        if loc_name_match:
            location_name = clean_text(loc_name_match.group(1))

    if not location_name:
        location_name = location

    return (location, location_name)


def extract_price(text: str) -> str:
    m = re.search(r"票價[:：]\s*([^\n]{1,120})", text)
    if not m:
        return ""

    candidate = clean_text(m.group(1))
    candidate = _trim_by_markers(
        candidate,
        [
            "電腦配位",
            "自行選位",
            "節目介紹",
            "折扣方案",
            "重要須知",
            "提供電子票",
            "剩：",
        ],
    )
    numeric_tokens = re.findall(r"(?:NT\$?\s*)?\d[\d,]*(?:\s*元)?", candidate)
    if numeric_tokens:
        return "、".join(unique_keep_order([clean_text(t) for t in numeric_tokens]))
    return candidate


def build_uid(url: str, title: str) -> str:
    seed = f"opentix2|{url}|{title}"
    return hashlib.sha1(seed.encode("utf-8")).hexdigest()[:24]


def click_show_more_if_exists(page) -> bool:
    selectors = [
        "button:has-text('顯示更多')",
        "button:has-text('顯示全部')",
        "button:has-text('更多')",
        "button:has-text('Show more')",
        "button:has-text('Load more')",
        "a:has-text('顯示更多')",
        "a:has-text('Show more')",
    ]
    for selector in selectors:
        btn = page.locator(selector).first
        if btn.count() == 0:
            continue
        try:
            if btn.is_visible():
                btn.click(timeout=2500)
                page.wait_for_timeout(1200)
                return True
        except Exception:
            continue
    return False


def collect_event_links(page, max_items: int, max_rounds: int, stagnant_rounds: int) -> list[str]:
    links: list[str] = []
    seen: set[str] = set()
    no_growth = 0

    log(f"[{now_ts()}] collecting event links from listing page")
    for round_index in range(max_rounds):
        clicked_more = click_show_more_if_exists(page)
        if clicked_more:
            log(f"[{now_ts()}] clicked 'show more' before scan")

        before_count = len(links)
        hrefs: list[str] = page.eval_on_selector_all(
            "a[href]",
            "els => els.map(el => el.getAttribute('href') || '')",
        )
        for raw_href in hrefs:
            href = normalize_href(raw_href.strip())
            if not href.startswith("https://www.opentix.life"):
                continue
            if "/event/" not in urlparse(href).path.lower():
                continue
            href = href.split("?", 1)[0]
            if href in seen:
                continue
            seen.add(href)
            links.append(href)
            if max_items > 0 and len(links) >= max_items:
                log(f"[{now_ts()}] reached target link count={len(links)}")
                return links

        if len(links) == before_count:
            no_growth += 1
        else:
            no_growth = 0

        log(
            f"[{now_ts()}] scan round {round_index + 1}/{max_rounds}, "
            f"candidate links={len(links)}, no-growth-rounds={no_growth}"
        )
        if no_growth >= stagnant_rounds:
            log(f"[{now_ts()}] stop scrolling due to stagnation: {stagnant_rounds} rounds with no new links")
            break

        page.mouse.wheel(0, 2800)
        page.wait_for_timeout(1300)

    return links


def extract_event(page, url: str) -> dict[str, Any]:
    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(1800)

    title = first_non_empty(page, ["h1", "meta[property='og:title']", "title"])
    full_text = first_non_empty(page, ["main", "body"])
    images = collect_images(page)
    dates = parse_date_candidates(full_text)
    start_date = dates[0] if dates else ""
    end_date = dates[1] if len(dates) > 1 else start_date
    location, location_name = extract_location_fields(full_text)
    price = extract_price(full_text)
    uid = build_uid(url, title or url)
    now_str = datetime.now().strftime("%Y/%m/%d %H:%M:%S")

    return {
        "version": "1.4",
        "UID": uid,
        "title": title or url,
        "category": "6",
        "showInfo": [
            {
                "time": f"{start_date} 00:00:00" if start_date else "",
                "location": location,
                "locationName": location_name,
                "onSales": "Y",
                "price": price,
                "latitude": None,
                "longitude": None,
                "endTime": f"{end_date} 23:59:59" if end_date else "",
            }
        ],
        "showUnit": SOURCE_LABEL,
        "discountInfo": "",
        "descriptionFilterHtml": full_text,
        "imageUrl": images[0] if images else "",
        "masterUnit": [SOURCE_LABEL],
        "subUnit": [],
        "supportUnit": [],
        "otherUnit": [],
        "webSales": url,
        "sourceWebPromote": url,
        "comment": "",
        "editModifyDate": now_str,
        "sourceWebName": SOURCE_LABEL,
        "startDate": start_date,
        "endDate": end_date,
        "hitRate": 0,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Crawl OPENTIX TPAC events as opentix2.")
    parser.add_argument("--max-items", type=int, default=DEFAULT_MAX_ITEMS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--max-scroll-rounds", type=int, default=DEFAULT_MAX_SCROLL_ROUNDS)
    parser.add_argument("--stagnant-rounds", type=int, default=DEFAULT_STAGNANT_ROUNDS)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    max_items = args.max_items if args.max_items >= 0 else 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless)
        context = browser.new_context(
            locale="zh-TW",
            viewport={"width": 1400, "height": 2000},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            ),
            extra_http_headers={"Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"},
        )
        page = context.new_page()
        log(f"[{now_ts()}] opening {BASE_URL}")
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(2200)

        for selector in ["button:has-text('同意')", "button:has-text('接受')", "button:has-text('Accept')", "button:has-text('我知道了')"]:
            try:
                btn = page.locator(selector).first
                if btn.count() and btn.is_visible():
                    btn.click(timeout=1500)
                    page.wait_for_timeout(500)
                    break
            except PlaywrightTimeoutError:
                pass
            except Exception:
                pass

        links = collect_event_links(page, max_items, max(1, args.max_scroll_rounds), max(1, args.stagnant_rounds))
        log(f"[{now_ts()}] total collected links={len(links)}")

        events: list[dict[str, Any]] = []
        failures: list[dict[str, str]] = []
        for idx, link in enumerate(links, start=1):
            detail = context.new_page()
            try:
                event = extract_event(detail, link)
                events.append(event)
                log(f"[{now_ts()}] [{idx}/{len(links)}] extracted {event['title']}")
            except Exception as exc:
                failures.append({"url": link, "reason": str(exc)})
                log(f"[{now_ts()}] [{idx}/{len(links)}] failed {link} ({exc})")
            finally:
                detail.close()

        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
        log(f"[{now_ts()}] saved exhibitions-like output -> {args.output.resolve()}")
        if failures:
            fail_path = args.output.with_suffix(".failures.json")
            fail_path.write_text(json.dumps(failures, ensure_ascii=False, indent=2), encoding="utf-8")
            log(f"[{now_ts()}] failures logged -> {fail_path.resolve()}")

        page.close()
        context.close()
        browser.close()


if __name__ == "__main__":
    main()
