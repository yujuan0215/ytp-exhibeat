import sys
from pathlib import Path
import json

# Force absolute path for reliability
ROOT_DIR = Path("/mnt/c/Programming/Project/ytp-exhibeat")
sys.path.insert(0, str(ROOT_DIR))

try:
    from backend.app.recommender.exhibeat_lightfm_demo import load_exhibitions, Persona, candidate_events_for_persona
    from datetime import date
    
    ref = date(2026, 4, 19)
    exs = load_exhibitions(ROOT_DIR / "exhibitions.json", ref)
    print(f"Total active exhibitions: {len(exs)}")
    
    cities = set(e.city for e in exs)
    print(f"Sample cities in data: {list(cities)[:20]}")
    
    p = Persona(
        persona_id="debug", 
        display_name="Debug", 
        preferred_cities=("台北市", "新北市", "基隆市"), 
        preferred_tags=("art",)
    )
    cands = candidate_events_for_persona(p, exs)
    print(f"Candidates for Taipei persona: {len(cands)}")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
