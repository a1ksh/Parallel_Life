import json
from pathlib import Path

CATALOG = json.loads(Path(__file__).with_name("catalog.json").read_text(encoding="utf-8"))
SCENARIOS = {scenario["id"]: scenario for scenario in CATALOG}
MENTOR_OPPORTUNITIES = json.loads(Path(__file__).with_name("opportunities.json").read_text(encoding="utf-8"))
AFTERMATHS = json.loads(Path(__file__).with_name("aftermaths.json").read_text(encoding="utf-8"))
DECISION_LAB = json.loads(Path(__file__).with_name("decision-lab.json").read_text(encoding="utf-8"))

for scenario in CATALOG:
    scenario.update(DECISION_LAB[scenario["id"]])
    for path in scenario["paths"]:
        path["beats"].append({"when": "Year 3", **AFTERMATHS[scenario["id"]][path["id"]]})
