"""
Crawl ACCUPASS 北區藝文: https://www.accupass.com/?area=north&channel=2

Sections: 「本週主打推薦」「熱門活動」only (skips「每天一點新鮮事」). Scroll +「更多活動」
when it increases /event/ links in #__next.

By default keeps only listing cards whose primary city is 台北市 (臺北市 on site normalizes to 台北市).

Writes:
  - data/accupass_north_taipei_listing.json — snapshot { items: [...] } for 台北市 rows
  - data/accupass_north_taipei_exhibitions.json — top-level JSON array, same shape as exhibitions.json
    (version 1.4, showInfo, …; 活動簡介-only descriptionFilterHtml from detail pages)

Use --skip-exhibitions for listing only. Progress: python -u crawler/crawl_accupass_north_channel2.py --headless
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from playwright.sync_api import sync_playwright


TARGET_URL = "https://www.accupass.com/?area=north&channel=2"
TARGET_SECTION_TITLES = ["本週主打推薦", "熱門活動"]
DEFAULT_LISTING_OUTPUT = Path("data/accupass_north_taipei_listing.json")
DEFAULT_EXHIBITIONS_OUTPUT = Path("data/accupass_north_taipei_exhibitions.json")
DEFAULT_MAX_ROUNDS = 45
DEFAULT_STAGNANT_ROUNDS = 6
DEFAULT_MAX_ITEMS = 0  # 0 = all 台北市 matches; use e.g. --max-items 100 to cap


def load_detail_module() -> Any:
    root = Path(__file__).resolve().parent.parent
    path = root / "test" / "crawl_accupass_items_to_exhibitions.py"
    spec = importlib.util.spec_from_file_location("_accupass_detail_helpers", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load detail helpers from {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def listing_primary_city(text: str) -> str:
    """Primary city on listing card; 臺北市/台北市 => 台北市 for filtering."""
    blob = text or ""
    if "臺北市" in blob or "台北市" in blob:
        return "台北市"
    for city in ["新北市", "桃園市", "基隆市", "新竹市", "新竹縣", "宜蘭縣", "線上活動"]:
        if city in blob:
            return city
    return ""


def now_ts() -> str:
    return datetime.now().strftime("%H:%M:%S")


def log(message: str) -> None:
    text = str(message)
    try:
        print(text, flush=True)
    except UnicodeEncodeError:
        enc = sys.stdout.encoding or "utf-8"
        print(text.encode(enc, errors="replace").decode(enc, errors="replace"), flush=True)


def clean_text(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def extract_exact_address(page, fallback: str = "") -> str:
    """Prefer exact street address from ACCUPASS location block / Google Maps query."""
    # 1) Most reliable: google maps search query string.
    map_selectors = [
        "a[href*='google.com/maps/search']",
        "a[href*='maps.google']",
        "a[href*='google.com/maps']",
    ]
    for sel in map_selectors:
        try:
            link = page.locator(sel).first
            if link.count() == 0:
                continue
            href = clean_text(link.get_attribute("href"))
            if href:
                parsed = urlparse(href)
                qs = parse_qs(parsed.query)
                for key in ("query", "q"):
                    if key in qs and qs[key]:
                        addr = clean_text(unquote(str(qs[key][0])))
                        if addr:
                            return addr.replace("臺北市", "台北市")
            text_addr = clean_text(link.inner_text())
            if text_addr:
                return text_addr.replace("臺北市", "台北市")
        except Exception:
            continue

    # 2) Fallback to subtitle/address-like blocks on detail page.
    for sel in [
        "div[class*='event-subtitle-content']",
        ".event-detail-address-remark",
        "[class*='location'] [class*='content']",
    ]:
        try:
            node = page.locator(sel).first
            if node.count() == 0:
                continue
            txt = clean_text(node.inner_text())
            if txt and ("路" in txt or "街" in txt or "段" in txt or "號" in txt):
                return txt.replace("臺北市", "台北市")
        except Exception:
            continue

    return clean_text(fallback).replace("臺北市", "台北市")


def extract_date_range(text: str) -> str:
    match = re.search(
        r"(20\d{2}[./-]\d{1,2}[./-]\d{1,2}\s*\([^)]+\)\s*\d{1,2}:\d{2}\s*-\s*(?:20\d{2}[./-]\d{1,2}[./-]\d{1,2}\s*\([^)]+\)\s*)?\d{1,2}:\d{2})",
        text,
    )
    return clean_text(match.group(1)) if match else ""


def collect_items(page) -> list[dict[str, Any]]:
    """Assign each /event/ link to the most recent matching section heading in document order."""
    raw_items: list[dict[str, Any]] = page.evaluate(
        """
        ({ sectionTitles, clearMarkers }) => {
          const main =
            document.querySelector("main") ||
            document.querySelector("#__next") ||
            document.body;
          const all = main.querySelectorAll("*");
          let current = "";
          const items = [];
          const seen = new Set();

          const isSectionHeading = (el) => {
            const tag = el.tagName && el.tagName.toUpperCase();
            if (tag && /^H[1-6]$/.test(tag)) return true;
            if (el.getAttribute && el.getAttribute("role") === "heading") return true;
            return false;
          };

          for (const el of all) {
            if (!isSectionHeading(el)) {
              // skip
            } else {
              const t = (el.innerText || "").trim().replace(/\\s+/g, " ");
              if (clearMarkers.some((m) => t.includes(m))) {
                current = "";
                continue;
              }
              const hit = sectionTitles.find((s) => t.includes(s));
              if (hit) {
                current = hit;
                continue;
              }
            }
            if (!current) continue;
            if (!el.matches || !el.matches("a[href*='/event/']")) continue;
            let href = (el.getAttribute("href") || "").trim();
            if (!href) continue;
            const url = href.startsWith("http") ? href : `https://www.accupass.com${href}`;
            const u = url.split("?")[0];
            if (seen.has(u)) continue;
            seen.add(u);

            const cardRoot =
              el.closest("article, li, [class*='card'], [class*='item'], section, div") || el;
            const text = (cardRoot.innerText || "").trim().replace(/\\s+/g, " ");
            const titleNode =
              cardRoot.querySelector("h1,h2,h3,h4,[class*='title'], [class*='name']") || el;
            const title = (titleNode.innerText || "").trim().replace(/\\s+/g, " ");
            const imgEl = cardRoot.querySelector("img");
            const img = (imgEl && imgEl.getAttribute("src")) || "";

            items.push({
              section: current,
              url: u,
              title,
              text,
              image: img,
            });
          }
          return items;
        }
        """,
        {"sectionTitles": TARGET_SECTION_TITLES, "clearMarkers": ["每天一點新鮮事"]},
    )

    out: list[dict[str, Any]] = []
    for item in raw_items:
        url = clean_text(str(item.get("url", "")))
        if not url:
            continue
        text_blob = clean_text(str(item.get("text", "")))
        title = clean_text(str(item.get("title", "")))
        out.append(
            {
                "section": clean_text(str(item.get("section", ""))),
                "title": title or text_blob[:100],
                "url": url,
                "date_time": extract_date_range(text_blob),
                "location": listing_primary_city(text_blob),
                "image": clean_text(str(item.get("image", ""))),
                "raw_text": text_blob,
            }
        )
    return out


def section_counts(bucket: dict[str, dict[str, Any]]) -> tuple[int, int]:
    featured = hot = 0
    for row in bucket.values():
        sec = str(row.get("section", ""))
        if "本週" in sec:
            featured += 1
        elif "熱門" in sec:
            hot += 1
    return featured, hot


def merge_by_url(
    rows: list[dict[str, Any]],
    bucket: dict[str, dict[str, Any]],
    *,
    taipei_only: bool,
    max_bucket: int = 0,
) -> int:
    """Insert rows keyed by URL. taipei_only => 台北市 cards only. max_bucket stops at N items (0 = unlimited)."""
    new_n = 0
    for row in rows:
        if max_bucket and len(bucket) >= max_bucket:
            break
        u = clean_text(str(row.get("url", "")))
        if not u:
            continue
        if taipei_only:
            blob = clean_text(str(row.get("raw_text", "")))
            if listing_primary_city(blob) != "台北市":
                continue
        if u not in bucket:
            bucket[u] = row
            new_n += 1
    return new_n


def click_visible_more_events(page) -> int:
    """Click「更多活動」until no new /event/ links appear in #__next (max 8 tries per outer round)."""
    clicks = 0
    for _ in range(8):
        count_before = page.evaluate(
            """() => document.querySelectorAll("#__next a[href*='/event/']").length"""
        )
        clicked = page.evaluate(
            """
            () => {
              const root = document.querySelector("#__next") || document.body;
              const footer = root.querySelector("footer");
              const footTop = footer ? footer.getBoundingClientRect().top : 1e9;
              const vh = window.innerHeight || 900;
              const nodes = Array.from(
                root.querySelectorAll("a, button, [role='button'], [role='link']")
              );
              for (const el of nodes) {
                const t = (el.innerText || "").trim();
                if (!t.includes("更多活動")) continue;
                if (t.length > 32) continue;
                const r = el.getBoundingClientRect();
                if (r.width < 2 || r.height < 2) continue;
                if (r.bottom < 80 || r.top > vh + 400) continue;
                if (r.top > footTop - 12) continue;
                try {
                  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
                  return true;
                } catch (e) {
                  try {
                    el.click();
                    return true;
                  } catch (e2) {
                    continue;
                  }
                }
              }
              return false;
            }
            """
        )
        page.wait_for_timeout(1600)
        count_after = page.evaluate(
            """() => document.querySelectorAll("#__next a[href*='/event/']").length"""
        )
        if not clicked:
            break
        if count_after <= count_before:
            break
        clicks += 1
    return clicks


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Crawl ACCUPASS north 藝文 (featured+hot), 台北市 listing only, exhibitions.json array."
    )
    p.add_argument("--output", type=Path, default=DEFAULT_LISTING_OUTPUT, help="台北市 listing snapshot JSON.")
    p.add_argument(
        "--exhibitions-output",
        type=Path,
        default=DEFAULT_EXHIBITIONS_OUTPUT,
        help="Top-level JSON array (exhibitions.json shape).",
    )
    p.add_argument("--skip-exhibitions", action="store_true", help="Only write listing snapshot; no detail pages.")
    p.add_argument("--headless", action="store_true")
    p.add_argument(
        "--max-rounds",
        type=int,
        default=DEFAULT_MAX_ROUNDS,
        help="Max scroll/click cycles (safety cap).",
    )
    p.add_argument(
        "--stagnant-rounds",
        type=int,
        default=DEFAULT_STAGNANT_ROUNDS,
        help="Stop after this many rounds with no new URLs in the target sections.",
    )
    p.add_argument(
        "--max-items",
        type=int,
        default=DEFAULT_MAX_ITEMS,
        help="Max unique 台北市 events after listing (0 = no cap).",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    max_rounds = max(1, args.max_rounds)
    stagnant_limit = max(1, args.stagnant_rounds)
    max_items = max(0, args.max_items)
    cap_label = f"cap={max_items}" if max_items else "no cap"

    bucket: dict[str, dict[str, Any]] = {}
    stagnant = 0
    t_run0 = time.perf_counter()

    log(
        f"[{now_ts()}] ACCUPASS north culture | "
        f"sections=featured+hot | location=台北市 only | {cap_label}"
    )
    log(f"[{now_ts()}] starting browser")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=args.headless)
        context = browser.new_context(
            locale="zh-TW",
            viewport={"width": 1440, "height": 2400},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
            ),
            extra_http_headers={"Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"},
        )
        page = context.new_page()
        log(f"[{now_ts()}] opening {TARGET_URL}")
        page.goto(TARGET_URL, wait_until="domcontentloaded", timeout=60000)
        log(f"[{now_ts()}] page loaded, initial scroll...")
        page.wait_for_timeout(4000)
        for si in range(10):
            page.keyboard.press("End")
            page.wait_for_timeout(450)
            if (si + 1) % 5 == 0:
                log(f"[{now_ts()}]   warm-up scroll {si + 1}/10")

        for r in range(1, max_rounds + 1):
            t0 = time.perf_counter()
            before = len(bucket)

            page.keyboard.press("End")
            page.wait_for_timeout(400)
            cap = max_items if max_items else 0
            n1 = merge_by_url(collect_items(page), bucket, taipei_only=True, max_bucket=cap)
            page.mouse.wheel(0, 4200)
            page.wait_for_timeout(900)
            n2 = merge_by_url(collect_items(page), bucket, taipei_only=True, max_bucket=cap)

            clicked = click_visible_more_events(page)
            n3 = merge_by_url(collect_items(page), bucket, taipei_only=True, max_bucket=cap)

            after = len(bucket)
            grew = after > before
            feat1, hot1 = section_counts(bucket)
            elapsed = time.perf_counter() - t0
            cap_prog = f" [{after}/{max_items}]" if max_items else ""
            log(
                f"[{now_ts()}] round {r}/{max_rounds}{cap_prog} "
                f"total={after} (+{after - before}) "
                f"featured={feat1} hot={hot1} "
                f"| merge_pass +{n1}/+{n2}/+{n3} more_clicks={clicked} "
                f"| {elapsed:.1f}s | wall {time.perf_counter() - t_run0:.0f}s"
            )

            if max_items and after >= max_items:
                log(f"[{now_ts()}] stop: reached --max-items {max_items}")
                break

            if grew:
                stagnant = 0
            else:
                stagnant += 1
                if stagnant >= stagnant_limit:
                    log(f"[{now_ts()}] stop: {stagnant_limit} stagnant rounds (no new URLs)")
                    break

        items_list = list(bucket.values())
        if max_items and len(items_list) > max_items:
            items_list = items_list[:max_items]

        payload = {
            "source": TARGET_URL,
            "sections": TARGET_SECTION_TITLES,
            "location_filter": "台北市",
            "requested_max_items": max_items,
            "collected_items": len(items_list),
            "items": items_list,
            "crawled_at": datetime.now().isoformat(),
        }

        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        total_s = time.perf_counter() - t_run0
        f_done, h_done = section_counts({str(i.get("url", "")): i for i in items_list})
        log(
            f"[{now_ts()}] listing done: {len(items_list)} taipei items in {total_s:.1f}s "
            f"(featured={f_done}, hot={h_done})"
        )
        log(f"[{now_ts()}] saved listing -> {args.output.resolve()}")

        if not args.skip_exhibitions and items_list:
            log(f"[{now_ts()}] detail phase: {len(items_list)} pages (exhibitions.json shape)")
            m = load_detail_module()
            exhibitions: list[dict[str, Any]] = []
            failures: list[dict[str, str]] = []
            for idx, item in enumerate(items_list, start=1):
                url = m.clean_text(str((item or {}).get("url", "")))
                if not url:
                    continue
                section = m.clean_text(str((item or {}).get("section", "")))
                list_title = m.clean_text(str((item or {}).get("title", "")))
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=90000)
                    page.wait_for_timeout(1800)
                    title = m.first_non_empty(page, ["h1", "meta[property='og:title']", "title"]) or list_title or url
                    full_text = m.first_non_empty(page, ["main", "article", "body"])
                    raw_body = m.first_inner_text_raw(page, ["main", "article", "body"])
                    intro_text = m.extract_activity_intro_text(raw_body)
                    images = m.extract_all_images(page, url)
                    dates = m.parse_dates(full_text)
                    start_date = dates[0] if dates else ""
                    end_date = dates[1] if len(dates) > 1 else start_date
                    coarse_location = m.extract_location(full_text) or m.clean_text(str((item or {}).get("location", "")))
                    location = extract_exact_address(page, coarse_location)
                    price = m.extract_price(full_text)
                    uid = m.build_uid(url, title)
                    now_str = datetime.now().strftime("%Y/%m/%d %H:%M:%S")
                    exhibitions.append(
                        {
                            "version": "1.4",
                            "UID": uid,
                            "title": title,
                            "category": "6",
                            "showInfo": [
                                {
                                    "time": f"{start_date} 00:00:00" if start_date else "",
                                    "location": location,
                                    "locationName": location,
                                    "onSales": "Y",
                                    "price": price,
                                    "latitude": None,
                                    "longitude": None,
                                    "endTime": f"{end_date} 23:59:59" if end_date else "",
                                }
                            ],
                            "showUnit": "ACCUPASS",
                            "discountInfo": "",
                            "descriptionFilterHtml": intro_text,
                            "imageUrl": images[0] if images else "",
                            "masterUnit": ["ACCUPASS"],
                            "subUnit": [],
                            "supportUnit": [],
                            "otherUnit": [],
                            "webSales": url,
                            "sourceWebPromote": url,
                            "comment": section,
                            "editModifyDate": now_str,
                            "sourceWebName": "ACCUPASS",
                            "startDate": start_date,
                            "endDate": end_date,
                            "hitRate": 0,
                        }
                    )
                    log(f"[{now_ts()}] detail [{idx}/{len(items_list)}] ok {title[:60]!r}")
                except Exception as exc:
                    failures.append({"url": url, "reason": str(exc)})
                    log(f"[{now_ts()}] detail [{idx}/{len(items_list)}] FAIL {url} ({exc})")

            args.exhibitions_output.parent.mkdir(parents=True, exist_ok=True)
            args.exhibitions_output.write_text(
                json.dumps(exhibitions, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            log(f"[{now_ts()}] saved exhibitions -> {args.exhibitions_output.resolve()} ({len(exhibitions)} records)")
            if failures:
                fail_path = args.exhibitions_output.with_suffix(".failures.json")
                fail_path.write_text(json.dumps(failures, ensure_ascii=False, indent=2), encoding="utf-8")
                log(f"[{now_ts()}] saved failures -> {fail_path.resolve()}")

        page.close()
        context.close()
        browser.close()


if __name__ == "__main__":
    main()
