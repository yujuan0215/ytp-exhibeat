from pathlib import Path

# 取得目前資料夾下的 system.md 路徑
_instruction_path = Path(__file__).parent / "system.md"

# 讀取指令內容
if _instruction_path.exists():
    system_instruction = _instruction_path.read_text(encoding="utf-8")
else:
    system_instruction = "You are a helpful assistant."
