from copy import deepcopy
from uuid import uuid4

from app.models.schemas import GameSession, NPCState, StoryEvent, TimelineBranch, WorldState
from app.scenarios import MENTOR_OPPORTUNITIES, SCENARIOS


class GameError(ValueError):
    pass


def path_for(game: GameSession, branch: TimelineBranch) -> dict:
    return next(path for path in SCENARIOS[game.scenario_id]["paths"] if path["id"] == branch.path_id)


def snapshot(branch: TimelineBranch) -> dict:
    return branch.model_dump(exclude={"checkpoints", "narration"})


def apply_effects(branch: TimelineBranch, effects: dict[str, int]) -> None:
    world = branch.world.model_dump()
    for key, delta in effects.items():
        if type(delta) is not int or abs(delta) > 20:
            raise GameError("Invalid story effect.")
        if key.startswith("trust:") and key[6:] in branch.npcs:
            npc = branch.npcs[key[6:]]
            npc.trust = min(100, max(0, npc.trust + delta))
        elif key in world:
            world[key] = min(100, max(0, world[key] + delta))
        else:
            raise GameError("Unknown story effect.")
    branch.world = WorldState.model_validate(world)


def add_branch(game: GameSession, path_id: str | None, parent_id: str | None, checkpoint: int | None):
    if len(game.branches) >= 32:
        raise GameError("This universe has reached its 32 timeline limit.")
    new_id = str(uuid4())
    if parent_id is not None:
        if path_id is not None or checkpoint is None:
            raise GameError("Choose one saved checkpoint.")
        parent = game.branches.get(parent_id)
        if parent is None or checkpoint >= len(parent.checkpoints):
            raise GameError("This checkpoint is not available.")
        data = deepcopy(parent.checkpoints[checkpoint])
        data.update(id=new_id, parent_id=parent_id, fork_at=checkpoint,
                    checkpoints=deepcopy(parent.checkpoints[:checkpoint]),
                    narration={k: v for k, v in parent.narration.items() if k.isdigit() and int(k) < checkpoint})
        branch = TimelineBranch.model_validate(data)
    else:
        scenario = SCENARIOS[game.scenario_id]
        path = next((path for path in scenario["paths"] if path["id"] == path_id), None)
        if path is None or checkpoint is not None:
            raise GameError("Choose a path from this scenario.")
        branch = TimelineBranch(id=new_id, path_id=path["id"],
                                npcs={npc["id"]: NPCState() for npc in scenario["npcs"]})
        apply_effects(branch, path["effects"])
    game.branches[branch.id] = branch
    game.active_id = branch.id
    return branch


def current_scene(game: GameSession, branch: TimelineBranch) -> dict | None:
    if branch.ending is not None:
        return None
    index = len(branch.events)
    beat = path_for(game, branch)["beats"][index]
    options = list(beat["choices"])
    if index == 2 and any(branch.npcs[npc].trust >= 58 for npc in beat["npcs"]):
        options.append(MENTOR_OPPORTUNITIES[game.scenario_id])
    return {**beat, "choices": options, "index": index,
            "last_event": branch.events[-1].outcome if branch.events else None}


def choose(game: GameSession, branch: TimelineBranch, scene_index: int, choice_id: str) -> None:
    scene = current_scene(game, branch)
    if scene is None or scene_index != scene["index"]:
        raise GameError("This scene already moved forward. Refresh the timeline and try again.")
    choices = {str(i): choice for i, choice in enumerate(scene["choices"])}
    if choice_id not in choices:
        raise GameError("Choose one of the options in this scene.")
    branch.checkpoints.append(snapshot(branch))
    label, effects, outcome = choices[choice_id]
    apply_effects(branch, effects)
    branch.events.append(StoryEvent(scene=scene["title"], choice_id=choice_id, choice=label,
                                   outcome=outcome, world=branch.world, effects=effects))
    if len(branch.events) == len(path_for(game, branch)["beats"]):
        branch.ending = int(choice_id)


def comparisons(game: GameSession) -> list[dict]:
    result = []
    for branch in game.branches.values():
        if branch.ending is None:
            continue
        path = path_for(game, branch)
        title, body, gain, cost = path["endings"][branch.ending]
        result.append({"id": branch.id, "path": path["title"], "title": title, "body": body,
                       "gain": gain, "cost": cost,
                       "events": [event.model_dump() for event in branch.events]})
    return result
