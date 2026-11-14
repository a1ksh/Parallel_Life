from collections.abc import Callable
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.game_engine import GameError, add_branch, choose, comparisons, current_scene, path_for
from app.models.database import ProfileRecord, SessionRecord, owner_hash
from app.models.schemas import (
    ActionExperiment, ChatInput, ConversationMessage, DecisionPassport, GameSession,
    NPCMemory, PlayerChoice, PlayerProfile, StartBranch, StartSession,
)
from app.scenarios import CATALOG, SCENARIOS
from app.services.story import model_enabled, npc_reply, personalize_scene

router = APIRouter(prefix="/api")


def database(request: Request):
    with request.app.state.database() as db:
        yield db


def owner(x_guest_token: Annotated[str, Header(min_length=36, max_length=90)]) -> str:
    return owner_hash(x_guest_token)


DB = Annotated[Session, Depends(database)]
Owner = Annotated[str, Depends(owner)]


def record_for(db: Session, model, record_id: str, guest: str):
    record = db.get(model, record_id)
    if record is None or record.owner != guest:
        raise HTTPException(404, "This saved item could not be found.")
    return record


def load_game(db: Session, session_id: str, guest: str):
    record = record_for(db, SessionRecord, session_id, guest)
    return record, GameSession.model_validate(record.data)


def commit(db: Session, record: SessionRecord, game: GameSession):
    record.data = game.model_dump(mode="json")
    try:
        db.commit()
    except StaleDataError as error:
        db.rollback()
        raise HTTPException(409, "The universe changed in another request. Reload and try again.") from error
    return view(game)


def mutate(operation: Callable, *args):
    try:
        return operation(*args)
    except GameError as error:
        raise HTTPException(409, str(error)) from error


def get_branch(game: GameSession, branch_id: str):
    branch = game.branches.get(branch_id)
    if branch is None:
        raise HTTPException(404, "This timeline could not be found.")
    return branch


def scene_view(game: GameSession, branch):
    scene = current_scene(game, branch)
    if scene is None:
        return None
    index = scene["index"]
    narration = branch.narration.get(str(index), {})
    return {**{key: scene[key] for key in ("index", "when", "location", "npcs", "last_event")},
            "count": len(path_for(game, branch)["beats"]),
            "title": narration.get("title", scene["title"]), "body": narration.get("narrative", scene["body"]),
            "dialogue": narration.get("dialogue"), "personalized": bool(narration),
            "choices": [{"id": str(i), "label": option[0], "focus": list(option[1])}
                        for i, option in enumerate(scene["choices"])]}


def view(game: GameSession):
    data = game.model_dump(exclude={"branches"})
    data["branches"] = []
    for branch in game.branches.values():
        summary = branch.model_dump(exclude={"checkpoints", "narration", "npcs"})
        summary["checkpoints"] = len(branch.checkpoints)
        if branch.id == game.active_id:
            summary["npcs"] = {key: state.model_dump() for key, state in branch.npcs.items()}
            summary["scene"] = scene_view(game, branch)
        data["branches"].append(summary)
    data["endings"] = comparisons(game)
    return data


@router.get("/status")
def status():
    return {"ai": model_enabled()}


@router.get("/scenarios")
def scenarios():
    return [{**{key: value for key, value in scenario.items() if key != "paths"},
             "paths": [{key: path[key] for key in ("id", "title", "short", "description")}
                       for path in scenario["paths"]]} for scenario in CATALOG]


@router.post("/profiles", status_code=201)
def create_profile(profile: PlayerProfile, db: DB, guest: Owner):
    profile = profile.model_copy(update={"id": str(uuid4())})
    db.add(ProfileRecord(id=profile.id, owner=guest, data=profile.model_dump()))
    db.commit()
    return profile


@router.get("/profiles")
def profiles(db: DB, guest: Owner):
    return [row.data for row in db.scalars(select(ProfileRecord).where(ProfileRecord.owner == guest))]


@router.post("/sessions", status_code=201)
def create_session(payload: StartSession, db: DB, guest: Owner):
    profile = record_for(db, ProfileRecord, payload.profile_id, guest)
    game = GameSession(id=str(uuid4()), profile=PlayerProfile.model_validate(profile.data),
                       scenario_id=payload.scenario_id)
    db.add(SessionRecord(id=game.id, owner=guest, data=game.model_dump()))
    db.commit()
    return view(game)


@router.get("/sessions")
def sessions(db: DB, guest: Owner):
    return [{"id": row.id, "scenario_id": row.data["scenario_id"], "profile": row.data["profile"],
             "branches": len(row.data["branches"]),
             "completed": sum(branch["ending"] is not None for branch in row.data["branches"].values())}
            for row in db.scalars(select(SessionRecord).where(SessionRecord.owner == guest))]


@router.get("/sessions/{session_id}")
def session(session_id: str, db: DB, guest: Owner):
    return view(load_game(db, session_id, guest)[1])


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: str, db: DB, guest: Owner):
    record = record_for(db, SessionRecord, session_id, guest)
    profile_id = record.data["profile"]["id"]
    db.delete(record)
    db.flush()
    # Keep a shared avatar until its last universe has been deleted.
    remaining = db.scalars(select(SessionRecord).where(SessionRecord.owner == guest))
    if not any(row.data["profile"]["id"] == profile_id for row in remaining):
        profile = db.get(ProfileRecord, profile_id)
        if profile and profile.owner == guest:
            db.delete(profile)
    db.commit()
    return Response(status_code=204)


@router.post("/sessions/{session_id}/branches")
def branch_create(session_id: str, payload: StartBranch, db: DB, guest: Owner):
    record, game = load_game(db, session_id, guest)
    mutate(add_branch, game, payload.path_id, payload.parent_id, payload.checkpoint)
    return commit(db, record, game)


@router.put("/sessions/{session_id}/branches/{branch_id}/active")
def branch_activate(session_id: str, branch_id: str, db: DB, guest: Owner):
    record, game = load_game(db, session_id, guest)
    game.active_id = get_branch(game, branch_id).id
    return commit(db, record, game)


@router.get("/sessions/{session_id}/branches/{branch_id}/scene")
def branch_scene(session_id: str, branch_id: str, db: DB, guest: Owner):
    _, game = load_game(db, session_id, guest)
    return scene_view(game, get_branch(game, branch_id))


@router.post("/sessions/{session_id}/branches/{branch_id}/choices")
def branch_choose(session_id: str, branch_id: str, payload: PlayerChoice, db: DB, guest: Owner):
    record, game = load_game(db, session_id, guest)
    branch = get_branch(game, branch_id)
    mutate(choose, game, branch, payload.scene_index, payload.choice_id)
    return commit(db, record, game)


@router.post("/sessions/{session_id}/branches/{branch_id}/scene")
async def branch_narrate(session_id: str, branch_id: str, db: DB, guest: Owner):
    record, game = load_game(db, session_id, guest)
    branch = get_branch(game, branch_id)
    scene = current_scene(game, branch)
    if scene is None or str(scene["index"]) in branch.narration or not model_enabled():
        return view(game)
    npc_context = [npc for npc in SCENARIOS[game.scenario_id]["npcs"] if npc["id"] in scene["npcs"]]
    generated = await personalize_scene(scene, game.profile.model_dump(exclude={"id"}),
                                        branch.world.model_dump(), npc_context)
    if generated is None:
        return view(game)
    branch.narration[str(scene["index"])] = generated
    return commit(db, record, game)


@router.post("/sessions/{session_id}/branches/{branch_id}/npcs/{npc_id}/messages")
async def branch_chat(session_id: str, branch_id: str, npc_id: str, payload: ChatInput, db: DB, guest: Owner):
    record, game = load_game(db, session_id, guest)
    branch = get_branch(game, branch_id)
    scene = current_scene(game, branch)
    if scene is None or scene["index"] != payload.scene_index or npc_id not in scene["npcs"]:
        raise HTTPException(409, "That character is unavailable in this scene.")
    npc = next(npc for npc in SCENARIOS[game.scenario_id]["npcs"] if npc["id"] == npc_id)
    state = branch.npcs[npc_id]
    if len(state.messages) >= 32:
        raise HTTPException(409, "This character has reached the conversation limit for this timeline.")
    beats = path_for(game, branch)["beats"]
    events = [event.outcome for index, event in enumerate(branch.events) if npc_id in beats[index]["npcs"]]
    reply, mode = await npc_reply(npc, state, scene, events, payload.text)
    state.messages.extend([ConversationMessage(role="player", text=payload.text),
                           ConversationMessage(role="npc", text=reply, mode=mode)])
    # Preserve compact notes as older turns leave the context window.
    if len(state.messages) > 6:
        older = state.messages[-8]
        state.memories = [*state.memories[-3:], NPCMemory(note=f"You and the player discussed: {older.text[:110]}")]
    if sum(message.role == "player" for message in state.messages) <= 6:
        state.trust = min(100, state.trust + 1)
    # Trust can unlock an extra choice, invalidating narration generated for the earlier option set.
    if len(current_scene(game, branch)["choices"]) != len(scene["choices"]):
        branch.narration.pop(str(scene["index"]), None)
    return commit(db, record, game)


@router.get("/sessions/{session_id}/comparison")
def compare(session_id: str, db: DB, guest: Owner):
    return comparisons(load_game(db, session_id, guest)[1])


@router.put("/sessions/{session_id}/reflection")
def reflect(session_id: str, payload: DecisionPassport, db: DB, guest: Owner):
    record, game = load_game(db, session_id, guest)
    results = comparisons(game)
    if not results:
        raise HTTPException(409, "Finish a timeline to open the Decision Lab.")
    scenario = SCENARIOS[game.scenario_id]
    if any(priority not in scenario["priorities"] for priority in payload.priorities):
        raise HTTPException(422, "Choose priorities from this scenario.")
    game.passport = payload.model_copy(update={"timelines": results,
        "priorities": list(dict.fromkeys(payload.priorities)), "dilemma": scenario["intro"],
        "questions": scenario["questions"], "experiment_title": scenario["experiment"]["title"]})
    return commit(db, record, game)


@router.put("/sessions/{session_id}/experiment")
def experiment(session_id: str, payload: ActionExperiment, db: DB, guest: Owner):
    record, game = load_game(db, session_id, guest)
    if game.passport is None:
        raise HTTPException(409, "Save a Decision Passport to open Reality Bridge.")
    count = len(SCENARIOS[game.scenario_id]["experiment"]["steps"])
    if any(index not in range(count) for index in payload.checked):
        raise HTTPException(422, "One checklist step could not be found.")
    game.experiment = payload.model_copy(update={"checked": sorted(set(payload.checked))})
    return commit(db, record, game)
