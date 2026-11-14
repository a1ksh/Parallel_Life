from typing import Literal

from pydantic import BaseModel, Field, StringConstraints
from typing_extensions import Annotated

ScenarioId = Literal["career", "education", "relationships"]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
MessageText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]


class PlayerProfile(BaseModel):
    id: str = ""
    name: ShortText
    age: int = Field(ge=18, le=120)
    avatar: Literal["dawn", "orbit", "night", "ember"]
    situation: ShortText
    goal: ShortText
    category: ScenarioId
    traits: str = Field(default="", max_length=180)
    values: str = Field(default="", max_length=180)
    background: str = Field(default="", max_length=300)


class WorldState(BaseModel):
    career: int = Field(default=50, ge=0, le=100)
    finances: int = Field(default=50, ge=0, le=100)
    freedom: int = Field(default=50, ge=0, le=100)
    knowledge: int = Field(default=50, ge=0, le=100)
    wellbeing: int = Field(default=50, ge=0, le=100)
    social: int = Field(default=50, ge=0, le=100)


class StoryEvent(BaseModel):
    scene: str
    choice_id: str
    choice: str
    outcome: str
    world: WorldState
    effects: dict[str, int]


class ConversationMessage(BaseModel):
    role: Literal["player", "npc"]
    text: str
    mode: Literal["scripted", "live"] | None = None


class NPCMemory(BaseModel):
    note: str


class NPCState(BaseModel):
    trust: int = Field(default=50, ge=0, le=100)
    messages: list[ConversationMessage] = Field(default_factory=list)
    memories: list[NPCMemory] = Field(default_factory=list)


class TimelineBranch(BaseModel):
    id: str
    path_id: str
    parent_id: str | None = None
    fork_at: int = 0
    world: WorldState = Field(default_factory=WorldState)
    events: list[StoryEvent] = Field(default_factory=list)
    npcs: dict[str, NPCState]
    checkpoints: list[dict] = Field(default_factory=list)
    narration: dict[str, dict] = Field(default_factory=dict)
    ending: int | None = None


class DecisionPassport(BaseModel):
    priorities: list[ShortText] = Field(min_length=1, max_length=4)
    uncertainty: str = Field(default="", max_length=500)
    next_step: str = Field(default="", max_length=500)
    timelines: list[dict] = Field(default_factory=list)


class ActionExperiment(BaseModel):
    checked: list[int] = Field(default_factory=list, max_length=5)
    status: Literal["active", "completed", "skipped"] = "active"


class GameSession(BaseModel):
    id: str
    profile: PlayerProfile
    scenario_id: ScenarioId
    branches: dict[str, TimelineBranch] = Field(default_factory=dict)
    active_id: str | None = None
    passport: DecisionPassport | None = None
    experiment: ActionExperiment = Field(default_factory=ActionExperiment)


class StartSession(BaseModel):
    profile_id: str
    scenario_id: ScenarioId


class StartBranch(BaseModel):
    path_id: str | None = None
    parent_id: str | None = None
    checkpoint: int | None = Field(default=None, ge=0, le=3)


class PlayerChoice(BaseModel):
    choice_id: str
    scene_index: int = Field(ge=0, le=3)


class ChatInput(BaseModel):
    text: MessageText
    scene_index: int = Field(ge=0, le=3)


class ProposedEffect(BaseModel):
    choice_id: str
    field: str
    delta: int = Field(ge=-20, le=20)


class GeneratedScene(BaseModel):
    title: ShortText
    narrative: Annotated[str, StringConstraints(min_length=1, max_length=1400)]
    location: ShortText
    npc_ids: list[str] = Field(min_length=1, max_length=3)
    decisions: list[str] = Field(min_length=2, max_length=3)
    proposed_effects: list[ProposedEffect] = Field(max_length=12)
    references: list[str] = Field(max_length=4)
    dialogue: str = Field(max_length=420)


class GeneratedReply(BaseModel):
    reply: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=720)]
