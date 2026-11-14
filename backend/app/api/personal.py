import os
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, StringConstraints, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.routes import DB, Owner, record_for
from app.models.database import PersonalStoryRecord
from app.services.ai_limits import reserve_ai
from app.services.story import generate

router = APIRouter(prefix="/api/personal")
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=350)]


class Brief(BaseModel):
    first: Short
    second: Short
    constraint: Short
    locale: Literal["en", "ru", "kk"]

    @model_validator(mode="after")
    def different_options(self):
        if self.first.casefold() == self.second.casefold():
            raise ValueError("Choose two different options.")
        return self


def display(row):
    return {"id": row.id, "brief": row.brief, "story": row.story, "picks": row.picks}


@router.get("")
def library(db: DB, guest: Owner):
    rows = db.scalars(select(PersonalStoryRecord).where(PersonalStoryRecord.owner == guest))
    return [display(row) for row in rows]


@router.post("/{story_id}")
async def create(story_id: UUID, brief: Brief, db: DB, guest: Owner):
    oid = str(story_id)
    existing = db.get(PersonalStoryRecord, oid)
    if existing is None:
        if os.getenv("PARALLEL_LIFE_AI_PROVIDER") != "gemini":
            raise HTTPException(503)
        block = reserve_ai(db, guest)
        if block:
            raise HTTPException(429 if block == "rate_limited" else 503)
        generated, _ = await generate("personal", brief.model_dump(), None, brief.locale)
        if not generated or generated["first_scene"].casefold() == generated["second_scene"].casefold():
            raise HTTPException(503)
        row = PersonalStoryRecord(id=oid, owner=guest, brief=brief.model_dump(), story=generated)
        db.add(row)
        try:
            db.commit()
            return display(row)
        except IntegrityError:
            db.rollback()
    existing = record_for(db, PersonalStoryRecord, oid, guest)
    if existing.brief != brief.model_dump():
        raise HTTPException(409)
    return display(existing)


@router.put("/{story_id}/pick/{branch}/{choice}")
def pick(story_id: UUID, branch: Literal["first", "second"], choice: Literal["a", "b"], db: DB, guest: Owner):
    row = db.scalar(select(PersonalStoryRecord).where(PersonalStoryRecord.id == str(story_id),
                                                      PersonalStoryRecord.owner == guest).with_for_update())
    if not row:
        raise HTTPException(404)
    row.picks = {**row.picks, branch: choice}
    db.commit()
    return display(row)
