import os
from time import time_ns
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, StringConstraints, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.routes import DB, Owner, record_for
from app.models.database import PersonalConversationTurn, PersonalStoryRecord
from app.services.ai_limits import reserve_ai
from app.services.story import generate

router = APIRouter(prefix="/api/personal")
Short = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=350)]


class Brief(BaseModel):
    first: Short
    second: Short
    constraint: Short
    goal: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""
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
        generated, _ = await generate("personal", brief.model_dump(exclude_defaults=True), None, brief.locale)
        if not generated or generated["first_scene"].casefold() == generated["second_scene"].casefold():
            raise HTTPException(503)
        row = PersonalStoryRecord(id=oid, owner=guest, brief=brief.model_dump(exclude_defaults=True), story=generated)
        db.add(row)
        try:
            db.commit()
            return display(row)
        except IntegrityError:
            db.rollback()
    existing = record_for(db, PersonalStoryRecord, oid, guest)
    if existing.brief != brief.model_dump(exclude_defaults=True):
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


class PersonalQuestion(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]
    request_id: UUID
    locale: Literal["ru", "kk", "en"]


def thread(db, oid, branch, choice):
    return select(PersonalConversationTurn).where(
        PersonalConversationTurn.story_id == oid, PersonalConversationTurn.branch == branch,
        PersonalConversationTurn.choice == choice).order_by(PersonalConversationTurn.created)


@router.get("/{story_id}/chat/{branch}/{choice}")
def conversation(story_id: UUID, branch: Literal["first","second"], choice: Literal["a","b"], db: DB, guest: Owner):
    row = record_for(db, PersonalStoryRecord, str(story_id), guest)
    if row.picks.get(branch) != choice:
        raise HTTPException(409)
    return [turn.data for turn in db.scalars(thread(db, row.id, branch, choice))]


@router.post("/{story_id}/chat/{branch}/{choice}")
async def ask(story_id: UUID, branch: Literal["first","second"], choice: Literal["a","b"],
              payload: PersonalQuestion, db: DB, guest: Owner):
    row = record_for(db, PersonalStoryRecord, str(story_id), guest)
    if row.picks.get(branch) != choice:
        raise HTTPException(409)
    turns = list(db.scalars(thread(db, row.id, branch, choice)))
    if any(turn.id == str(payload.request_id) and turn.data["question"] == payload.question for turn in turns):
        return [turn.data for turn in turns]
    context = {"path": row.brief[branch], "constraint": row.brief["constraint"], "goal": row.brief.get("goal"),
               "situation": row.story[branch + "_scene"], "selected": row.story[branch + "_" + choice],
               "ending": row.story[branch + "_" + choice + "_end"], "history": [turn.data for turn in turns[-4:]],
               "question": payload.question}
    blocked = reserve_ai(db, guest)
    if blocked or os.getenv("PARALLEL_LIFE_AI_PROVIDER") != "gemini":
        raise HTTPException(429 if blocked == "rate_limited" else 503)
    result, _ = await generate("other_self", context, None, payload.locale)
    if not result:
        raise HTTPException(503)
    db.refresh(row)
    if row.picks.get(branch) != choice:
        raise HTTPException(409)
    data = {"question": payload.question, "reply": result["reply"], "locale": payload.locale}
    db.add(PersonalConversationTurn(id=str(payload.request_id), story_id=row.id, branch=branch, choice=choice,
                                    created=time_ns(), data=data))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.get(PersonalConversationTurn, str(payload.request_id))
        if not existing or (existing.story_id, existing.branch, existing.choice, existing.data["question"]) != (
                row.id, branch, choice, payload.question):
            raise HTTPException(409)
    return [turn.data for turn in db.scalars(thread(db, row.id, branch, choice))]
