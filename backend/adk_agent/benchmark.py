#!/usr/bin/env python3
"""ExhiBeat Agent Benchmark — 10 組代表性 Prompt 測試"""

import time
import json
import requests

BASE_URL = "http://localhost:8001"
APP_NAME = "gemini_agent"
USER_ID  = "benchmark_user"

PROMPTS = [
    # 基礎查詢
    ("P01 區域展覽查詢",   "信義區有什麼展覽？"),
    ("P02 場館查詢",        "華山有什麼活動？"),
    ("P03 中文關鍵字搜尋", "有沒有青銅器相關的展覽"),
    ("P04 英文關鍵字搜尋", "any exhibitions about wool or textile?"),
    # 進階查詢
    ("P05 免費活動",        "推薦幾個免費的藝文活動"),
    ("P06 音樂活動",        "最近有什麼音樂會或表演"),
    ("P07 住宿推薦",        "我想看《超現實主義: 對話中的世界》，附近有合法住宿推薦嗎？"),
    ("P08 行政區住宿",      "中山區有哪些展覽，附近有住宿嗎"),
    # 複合查詢
    ("P09 行程規劃",        "我明天想去台北看展覽，幫我規劃一日行程"),
    ("P10 收藏與行程整合",  "幫我把信義區的設計展加入收藏，然後生成行程"),
]

def create_session() -> str:
    r = requests.post(f"{BASE_URL}/apps/{APP_NAME}/users/{USER_ID}/sessions",
                      headers={"Content-Type": "application/json"}, json={}, timeout=10)
    r.raise_for_status()
    return r.json()["id"]

def run_prompt(session_id: str, text: str) -> tuple[str, float]:
    payload = {
        "app_name": APP_NAME,
        "user_id": USER_ID,
        "session_id": session_id,
        "new_message": {"role": "user", "parts": [{"text": text}]},
    }
    t0 = time.time()
    r = requests.post(f"{BASE_URL}/run",
                      headers={"Content-Type": "application/json"},
                      json=payload, timeout=60)
    elapsed = time.time() - t0

    if r.status_code != 200:
        return f"[ERROR {r.status_code}] {r.text[:200]}", elapsed

    events = r.json()
    for item in reversed(events):
        if not isinstance(item, dict): continue
        content = item.get("content", {})
        if not isinstance(content, dict): continue
        for part in content.get("parts", []):
            if isinstance(part, dict) and part.get("text"):
                return part["text"], elapsed
    return "[No text]", elapsed

def main():
    print("=" * 70)
    print("ExhiBeat Agent Benchmark")
    print("=" * 70)

    results = []
    session_id = create_session()
    print(f"Session: {session_id}\n")

    for name, prompt in PROMPTS:
        print(f"▶ {name}")
        print(f"  Q: {prompt}")
        try:
            answer, elapsed = run_prompt(session_id, prompt)
            short_ans = answer.replace("\n", " ")[:200]
            status = "✅" if "[ERROR" not in answer and "[No text]" not in answer else "❌"
            print(f"  {status} ({elapsed:.1f}s) A: {short_ans}")
            results.append({"name": name, "prompt": prompt, "answer": answer,
                            "elapsed": elapsed, "ok": status == "✅"})
        except Exception as e:
            print(f"  ❌ Exception: {e}")
            results.append({"name": name, "prompt": prompt, "answer": str(e),
                            "elapsed": 0, "ok": False})
        print()

    # 統計摘要
    ok_count  = sum(1 for r in results if r["ok"])
    avg_time  = sum(r["elapsed"] for r in results) / len(results)
    slow_ones = [r for r in results if r["elapsed"] > 10]

    print("=" * 70)
    print(f"總結：{ok_count}/{len(results)} 成功  |  平均回應時間：{avg_time:.1f}s")
    if slow_ones:
        print(f"慢查詢 (>10s)：{', '.join(r['name'] for r in slow_ones)}")
    print("=" * 70)

    # 寫出結果
    out_path = "/tmp/exhibeat_benchmark.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n完整結果已存至：{out_path}")

if __name__ == "__main__":
    main()
