import json
import os
import time
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

POLICY = json.loads(Path(__file__).with_name("ai-policy.json").read_text(encoding="utf-8"))

_RESERVE = text("""
    INSERT INTO ai_usage (bucket, window_start, calls) VALUES (:bucket, :start, 1)
    ON CONFLICT (bucket) DO UPDATE SET window_start = excluded.window_start,
      calls = CASE WHEN ai_usage.window_start = excluded.window_start THEN ai_usage.calls + 1 ELSE 1 END
    WHERE ai_usage.window_start < excluded.window_start
      OR (ai_usage.window_start = excluded.window_start AND ai_usage.calls < :limit)
    RETURNING calls
""")


class UsageLimitReached(Exception):
    pass


def provider_key() -> str:
    variable = "GEMINI_API_KEY" if os.getenv("PARALLEL_LIFE_AI_PROVIDER") == "gemini" else "OPENAI_API_KEY"
    return os.getenv(variable, "").strip()


def model_enabled() -> bool:
    return bool(provider_key()) and os.environ.get("PARALLEL_LIFE_AI_ENABLED", "1") != "0"


def reserve_ai(db: Session, guest: str) -> str | None:
    if not model_enabled():
        return "disabled"
    now = int(time.time())
    minute, day = now // 60 * 60, now // 86400 * 86400
    limits = POLICY["limits"]
    try:
        # Commit the reservation separately, before network I/O or a possible gameplay conflict.
        with db.get_bind().begin() as connection:
            for bucket, start, limit in (
                (f"guest:{guest}", minute, limits["guest_minute"]),
                ("global:minute", minute, limits["global_minute"]),
                ("global:day", day, limits["global_day"]),
            ):
                calls = connection.execute(_RESERVE, {"bucket": bucket, "start": start, "limit": limit}).scalar()
                if calls is None:
                    raise UsageLimitReached
                if bucket == "global:day" and calls == 1:
                    connection.execute(text("DELETE FROM ai_usage WHERE window_start < :old"), {"old": day - 86400})
    except UsageLimitReached:
        return "rate_limited"
    except SQLAlchemyError:
        return "unavailable"
    return None
