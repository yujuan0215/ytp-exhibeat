"""
Run every listing/detail crawler in this repo's `crawler/` package and write JSON under `data/`.

Intended to be executed from the repository root (or any cwd: this script `chdir`s to root).

Playwright must be installed (`pip install playwright` and `playwright install chromium`).
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
CRAWLER_DIR = Path(__file__).resolve().parent


def run_step(label: str, argv: list[str]) -> int:
    print(f"\n=== {label} ===\n{' '.join(argv)}")
    proc = subprocess.run(argv, cwd=str(REPO_ROOT))
    if proc.returncode != 0:
        print(f"!! Step failed ({label}) exit={proc.returncode}", file=sys.stderr)
    return proc.returncode


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Run all crawler/*.py crawlers into data/.")
    p.add_argument(
        "--headed",
        action="store_true",
        help="Show browser windows (default: headless).",
    )
    p.add_argument(
        "--merge",
        action="store_true",
        help="After crawls, transform Artemperor JSON and merge OPENTIX + OPENTIX2 + Artemperor into data/exhibitions_merged.json.",
    )
    p.add_argument(
        "--skip-opentix-ntch",
        action="store_true",
    )
    p.add_argument(
        "--skip-opentix2-tpac",
        action="store_true",
    )
    p.add_argument(
        "--skip-artemperor",
        action="store_true",
    )
    p.add_argument(
        "--skip-accupass",
        action="store_true",
        help="Skip ACCUPASS 北區藝文 listing (本週主打推薦 + 熱門活動).",
    )
    p.add_argument(
        "--skip-iculture",
        action="store_true",
        help="Skip iCulture (cloud.culture.tw) full-category fetch.",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    py = sys.executable
    head_flag: list[str] = [] if args.headed else ["--headless"]

    codes: list[int] = []

    if not args.skip_opentix_ntch:
        codes.append(
            run_step(
                "OPENTIX NTCH → data/opentix_exhibitions.json",
                [py, str(CRAWLER_DIR / "crawl_opentix_ntch.py"), *head_flag],
            )
        )

    if not args.skip_opentix2_tpac:
        codes.append(
            run_step(
                "OPENTIX TPAC → data/opentix2_exhibitions.json",
                [py, str(CRAWLER_DIR / "crawl_opentix2_tpac.py"), *head_flag],
            )
        )

    if not args.skip_artemperor:
        codes.append(
            run_step(
                "Artemperor tidbits → data/artemperor_tidbits.json",
                [py, str(CRAWLER_DIR / "crawl_artemperor.py"), *head_flag],
            )
        )

    if not args.skip_accupass:
        codes.append(
            run_step(
                "ACCUPASS north 藝文 → data/accupass_north_taipei_listing.json + data/accupass_north_taipei_exhibitions.json",
                [py, str(CRAWLER_DIR / "crawl_accupass_north_channel2.py"), *head_flag],
            )
        )
    if not args.skip_iculture:
        codes.append(
            run_step(
                "iCulture full categories → data/iculture_exhibitions.json",
                ["node", str(REPO_ROOT / "fetch_exhibitions.js"), str(REPO_ROOT / "data" / "iculture_exhibitions.json")],
            )
        )

    if args.merge:
        tidbits = REPO_ROOT / "data" / "artemperor_tidbits.json"
        if not tidbits.is_file():
            print(f"!! Skip merge: missing {tidbits}", file=sys.stderr)
        else:
            codes.append(
                run_step(
                    "Transform Artemperor → data/artemperor_exhibitions.json",
                    [
                        py,
                        str(CRAWLER_DIR / "transform_artemperor_to_exhibitions.py"),
                        "--input",
                        str(tidbits),
                        "--output",
                        str(REPO_ROOT / "data" / "artemperor_exhibitions.json"),
                    ],
                )
            )
            op1 = REPO_ROOT / "data" / "opentix_exhibitions.json"
            op2 = REPO_ROOT / "data" / "opentix2_exhibitions.json"
            art = REPO_ROOT / "data" / "artemperor_exhibitions.json"
            acc = REPO_ROOT / "data" / "accupass_north_taipei_exhibitions.json"
            iculture = REPO_ROOT / "data" / "iculture_exhibitions.json"
            inputs = [p for p in (op1, op2, art, acc, iculture) if p.is_file()]
            if len(inputs) < 1:
                print("!! Skip merge: no input JSON files in data/", file=sys.stderr)
            else:
                codes.append(
                    run_step(
                        "Merge sources → data/exhibitions_merged.json",
                        [
                            py,
                            str(CRAWLER_DIR / "merge_exhibitions_sources.py"),
                            "--inputs",
                            *[str(p) for p in inputs],
                            "--output",
                            str(REPO_ROOT / "data" / "exhibitions_merged.json"),
                        ],
                    )
                )

    return 1 if any(c != 0 for c in codes) else 0


if __name__ == "__main__":
    raise SystemExit(main())
