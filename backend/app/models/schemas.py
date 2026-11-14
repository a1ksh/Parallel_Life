from typing import Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator
from typing_extensions import Annotated

ScenarioId = Literal["career", "education", "relationships"]
Locale = Literal["en", "kk", "ru"]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
MessageText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]


ValueId = Literal["career", "finances", "freedom", "knowledge", "wellbeing", "social"]


PriorityLevel = Annotated[int, Field(strict=True, ge=1, le=5)]


class LifePriorities(BaseModel):
    model_config = {"extra": "forbid"}
    skills: PriorityLevel
    health: PriorityLevel
    relationships: PriorityLevel
    work: PriorityLevel
    fulfillment: PriorityLevel
    study: PriorityLevel
    happiness: PriorityLevel


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
    gender: Literal["", "woman", "man", "nonbinary"] = ""
    personal_context: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] = ""
    background: str = Field(default="", max_length=300)

    life_priorities: LifePriorities | None = None
    dilemma: str = Field(default="", max_length=300)
    constraint: str = Field(default="", max_length=300)
    selected_values: list[ValueId] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def validate_personal_context(self):
        self.dilemma = self.dilemma.strip()
        self.constraint = self.constraint.strip()
        if self.dilemma or self.constraint or self.selected_values:
            if not (self.dilemma and self.constraint and len(set(self.selected_values)) == len(self.selected_values) >= 2):
                raise ValueError("Include a dilemma, a constraint, and two or three distinct values.")
        return self


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
    locale: Locale = "en"


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
    dilemma: str = ""
    constraint: str = ""
    selected_values: list[ValueId] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)
    experiment_title: str = ""


ExperimentText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]


class ExperimentPlan(BaseModel):
    action: ExperimentText
    deadline: Annotated[str, StringConstraints(pattern=r"^\d{4}-\d{2}-\d{2}$")]
    signal: ExperimentText


class ExperimentReflection(BaseModel):
    outcome: ExperimentText
    surprise: ExperimentText
    priority: ExperimentText


class ActionExperiment(BaseModel):
    checked: list[int] = Field(default_factory=list, max_length=5)
    status: Literal["active", "completed", "skipped"] = "active"
    plan: ExperimentPlan | None = None
    reflection: ExperimentReflection | None = None
    personal_1490_interest: Literal["interested", "declined"] | None = None
    pass_offer: Literal["KZT_1490"] | None = None
    pass_interest: Literal["interested", "declined"] | None = None


class SelfTurn(BaseModel):
    scene_index: int
    recorded_events: int | None = None
    question: str
    reply: str
    locale: Locale
    mode: Literal["live", "scripted"]


class GameSession(BaseModel):
    self_dialogues: dict[str, list[SelfTurn]] = Field(default_factory=dict)
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
    checkpoint: int | None = Field(default=None, ge=0, le=4)


class PlayerChoice(BaseModel):
    choice_id: str
    scene_index: int = Field(ge=0, le=4)


class NarrateInput(BaseModel):
    locale: Locale = "en"


class ChatInput(NarrateInput):
    text: MessageText
    scene_index: int = Field(ge=0, le=4)
