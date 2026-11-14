import json
from pathlib import Path

LOCALES = json.loads(Path(__file__).with_name("locale-policy.json").read_text(encoding="utf-8"))
STORY_TEXT = {
    locale: json.loads((Path(__file__).parents[1] / "scenarios" / f"{locale}.json").read_text(encoding="utf-8"))
    for locale in ("kk", "ru")
}


def authored(locale: str, text: str) -> str:
    return STORY_TEXT.get(locale, {}).get(text, text)


def narration_variants(saved: dict) -> dict:
    if "title" in saved:
        return {"en": saved}
    return saved
