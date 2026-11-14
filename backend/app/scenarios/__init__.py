import json
from pathlib import Path

CATALOG = json.loads(Path(__file__).with_name("catalog.json").read_text(encoding="utf-8"))
SCENARIOS = {scenario["id"]: scenario for scenario in CATALOG}
MENTOR_OPPORTUNITIES = json.loads(Path(__file__).with_name("opportunities.json").read_text(encoding="utf-8"))
