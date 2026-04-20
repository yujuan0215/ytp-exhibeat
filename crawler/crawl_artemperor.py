import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = "https://artemperor.tw/tidbits"
TARGET_LOCATION = "台北市"
MAX_ITEMS = 5
OUTPUT_PATH = Path("artemperor_tidbits_taipei_top5.json")


@dataclass
class TidbitData:
    title: str
    date: str
    location: str
    author: str
    full_text: str
    image: List[str]
    related_link: List[str]


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def read_text_first(page, selectors: List[str]) -> str:
    for selector in selectors:
        node = page.locator(selector).first
        if node.count() == 0:
            continue
        if "meta[" in selector:
            value = clean_text(node.get_attribute("content") or "")
        else:
            value = clean_text(node.inner_text())
        if value:
            return value
    return ""


def click_read_more_if_exists(page) -> None:
    # Site wording can differ by language/theme, try common "expand" labels.
    read_more_selectors = [
        "text=Read More",
        "text=READ MORE",
        "text=閱讀更多",
        "text=更多",
        "button:has-text('Read More')",
        "a:has-text('Read More')",
    ]
    for selector in read_more_selectors:
        btn = page.locator(selector).first
        if btn.count() == 0:
            continue
        try:
            if btn.is_visible():
                btn.click(timeout=2000)
                page.wait_for_timeout(900)
                return
        except PlaywrightTimeoutError:
            continue
        except Exception:
            continue


def collect_image_urls(page) -> List[str]:
    urls: List[str] = []
    selectors = [
        "meta[property='og:image']",
        "article img[src]",
        "section img[src]",
        "img[src]",
    ]
    for selector in selectors:
        nodes = page.locator(selector)
        count = min(nodes.count(), 80)
        for idx in range(count):
            if selector.startswith("meta"):
                src = (nodes.nth(idx).get_attribute("content") or "").strip()
            else:
                src = (nodes.nth(idx).get_attribute("src") or "").strip()
            if not src or src.startswith("data:"):
                continue
            if src.startswith("//"):
                src = f"https:{src}"
            if src.startswith("/"):
                src = f"https://artemperor.tw{src}"
            if src not in urls:
                urls.append(src)
    return urls


def parse_labeled_fields_from_text(raw_text: str) -> Dict[str, str]:
    fields: Dict[str, str] = {}
    patterns = {
        "date_time": r"(?:日期|展期|時間)\s*[:：]?\s*([^\n|]+)",
        "location": r"(?:地點|位置|展覽地點)\s*[:：]?\s*([^\n|]+)",
        "author": r"(?:作者|策展人|參展藝術家)\s*[:：]?\s*([^\n|]+)",
    }
    for key, pattern in patterns.items():
        m = re.search(pattern, raw_text, flags=re.IGNORECASE)
        if m:
            fields[key] = clean_text(m.group(1))
    return fields


def parse_extra_info_list(page) -> Dict[str, str]:
    info: Dict[str, str] = {}
    items = page.locator("ul.exb_info > li")
    count = items.count()
    for idx in range(count):
        li = items.nth(idx)
        label = clean_text(li.locator("h5").first.inner_text()) if li.locator("h5").count() else ""
        value = clean_text(li.inner_text())
        if not value:
            continue
        if label:
            value = clean_text(value.replace(label, "", 1))
            info[label] = value
    return info


def parse_box_date_and_location(raw_line: str) -> Dict[str, str]:
    # Example:
    # 日期:2026-04-18 ~ 2026-06-28 |台灣,台北市
    line = clean_text(raw_line)
    if "|" in line:
        left, right = line.split("|", 1)
    else:
        left, right = line, ""
    date_value = clean_text(re.sub(r"^(?:日期|展期|時間)\s*[:：]\s*", "", left))
    # Box line sometimes appends location-like tokens; keep date segment only.
    date_value = re.split(r"\s*\|\s*|台灣|臺灣|台北市|臺北市", date_value, maxsplit=1)[0].strip(" ,，")
    location_value = clean_text(right)
    return {"date": date_value, "location": location_value}


def parse_box_meta_from_card(card) -> Dict[str, str]:
    p_nodes = card.locator("p")
    p_count = p_nodes.count()
    p_texts: List[str] = []
    for i in range(p_count):
        txt = clean_text(p_nodes.nth(i).inner_text())
        if txt:
            p_texts.append(txt)

    # Prefer a line that looks like date/location metadata.
    candidate = ""
    for txt in p_texts:
        if ("日期" in txt or "展期" in txt or "時間" in txt) and ("台" in txt):
            candidate = txt
            break
    if not candidate and p_texts:
        candidate = p_texts[0]

    parsed = parse_box_date_and_location(candidate)
    card_text = clean_text(card.inner_text())
    if not parsed["location"]:
        m = re.search(r"(台灣[，,\s]*台北市|台北市[^\s]*)", card_text)
        if m:
            parsed["location"] = clean_text(m.group(1))
    return parsed


def collect_related_links(page) -> List[str]:
    links: List[str] = []
    info_items = page.locator("ul.exb_info > li")
    count = info_items.count()
    for idx in range(count):
        li = info_items.nth(idx)
        label = clean_text(li.locator("h5").first.inner_text()) if li.locator("h5").count() else ""
        if "相關連結" not in label:
            continue
        anchors = li.locator("a[href]")
        a_count = anchors.count()
        for j in range(a_count):
            href = (anchors.nth(j).get_attribute("href") or "").strip()
            if not href:
                continue
            if href.startswith("//"):
                href = f"https:{href}"
            if href.startswith("/"):
                href = f"https://artemperor.tw{href}"
            if href not in links:
                links.append(href)
    return links


def extract_detail(page, box_item: Dict[str, str]) -> TidbitData:
    link = box_item["link"]
    page.goto(link, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(1500)
    click_read_more_if_exists(page)

    main_text = read_text_first(
        page,
        [
            ".col_right .content",
            ".content",
            "article",
            ".PRINT",
            "main",
            "body",
        ],
    )
    exb_info = parse_extra_info_list(page)
    author = ""
    date_time = ""
    location = ""

    # Strict label mapping from detail page:
    # date -> 展期, location -> 地點, author -> 參展藝術家.
    for k, v in exb_info.items():
        label = clean_text(k)
        if not date_time and "展期" in label:
            date_time = clean_text(v)
        if not location and "地點" in label:
            location = clean_text(v)
        if not author and "參展藝術家" in label:
            author = clean_text(v)

    # Minimal fallbacks only when strict labels are missing.
    for k, v in exb_info.items():
        label = clean_text(k)
        if not date_time and ("日期" in label or "時間" in label):
            date_time = clean_text(v)
        if not location and "位置" in label:
            location = clean_text(v)
        if not author and ("作者" in label or "策展人" in label):
            author = clean_text(v)

    # Fallback only when info-list does not provide values.
    if not author:
        parsed_fields = parse_labeled_fields_from_text(main_text)
        author = parsed_fields.get("author", "")

    return TidbitData(
        title=box_item["title"],
        date=date_time or box_item["date"],
        location=location or box_item["location"],
        author=author,
        full_text=main_text,
        image=collect_image_urls(page),
        related_link=collect_related_links(page),
    )


def collect_taipei_items_from_boxes(page, max_items: int) -> List[Dict[str, str]]:
    items: List[Dict[str, str]] = []
    seen = set()
    for _ in range(10):
        cards = page.locator("div.list_box")
        count = cards.count()
        for idx in range(count):
            card = cards.nth(idx)
            title = clean_text(card.locator("h2").first.inner_text()) if card.locator("h2").count() else ""
            parsed = parse_box_meta_from_card(card)
            if TARGET_LOCATION not in parsed["location"]:
                continue
            anchor = card.locator("a[href*='/tidbits/']").first
            if anchor.count() == 0:
                continue
            href = (anchor.get_attribute("href") or "").strip()
            if not href:
                continue
            if href.startswith("/"):
                href = f"https://artemperor.tw{href}"
            href = href.split("?", 1)[0]
            if href in seen:
                continue
            seen.add(href)
            items.append(
                {
                    "title": title,
                    "date": parsed["date"],
                    "location": parsed["location"],
                    "link": href,
                }
            )
            if len(items) >= max_items:
                return items
        page.mouse.wheel(0, 2600)
        page.wait_for_timeout(1100)
    return items


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1440, "height": 2100},
            locale="zh-TW",
        )
        page = context.new_page()

        print(f"Opening {BASE_URL}")
        page.goto(BASE_URL, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2200)

        box_items = collect_taipei_items_from_boxes(page, MAX_ITEMS)
        print(f"Found {len(box_items)} tidbits with location containing '{TARGET_LOCATION}'.")

        results: List[TidbitData] = []
        failures = []
        for i, box_item in enumerate(box_items, start=1):
            try:
                item = extract_detail(page, box_item)
                results.append(item)
                print(f"[{i}/{len(box_items)}] Extracted: {item.title or box_item['link']}")
            except Exception as e:
                failures.append({"link": box_item["link"], "reason": str(e)})
                print(f"[{i}/{len(box_items)}] Failed: {box_item['link']} ({e})")

        payload = {
            "source": BASE_URL,
            "location_filter": TARGET_LOCATION,
            "requested_items": MAX_ITEMS,
            "extracted_items": len(results),
            "items": [asdict(x) for x in results],
            "failures": failures,
        }

        OUTPUT_PATH.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"Saved JSON -> {OUTPUT_PATH.resolve()}")

        context.close()
        browser.close()


if __name__ == "__main__":
    main()
