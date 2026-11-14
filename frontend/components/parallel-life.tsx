"use client";

import { LanguageContext, useTranslation } from "@/i18n/provider";
import { isLocale, languageCodes, languageNames, localeKey, locales, urlLocale, type Locale } from "@/i18n/config";
import { localizeGame, localizeScenario } from "@/i18n/presentation";
import { messages } from "@/i18n/messages";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDownRight, ArrowLeft, ArrowRight, BookOpen, BriefcaseBusiness, CircleCheck,
  Compass, GitFork, GraduationCap, Heart, Layers, MapPin, MessageCircle, Sparkles, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RealityBridge } from "@/components/reality-bridge";
import { PrioritySliders, PriorityComparison, readLifePriorities } from "@/components/life-priorities";
import { ChoiceEffects, ChoiceResult, decisionQuestions, pathTradeoffs } from "./choice-guide";
import { CountryContext } from "./country-context";
import "./choice-guide.css";
import { LifeMap } from "@/components/life-map";
import {
  activeKey, ApiError, api, avatars, categories, perform, useGame,
  type ValueId, type Branch, type Category, type Ending, type Game, type Profile, type Scenario, type Universe, type View,
} from "@/lib/game";

const categoryInfo = {
  career: { title: "Career & Business", icon: BriefcaseBusiness, age: 29 },
  education: { title: "Education & Growth", icon: GraduationCap, age: 27 },
  relationships: { title: "Relationships", icon: Heart, age: 30 },
} as const;
const metrics = {
  career: "Career", finances: "Finances", freedom: "Freedom", knowledge: "Knowledge",
  wellbeing: "Well-being", social: "Connections",
} as const;
const valueIds = Object.keys(metrics) as ValueId[];
const fictional = {
  career: ["Should I keep my salary or try my own business?", "I need a steady income to pay rent."],
  education: ["Should I study abroad or keep learning close to home?", "I can only afford one semester away."],
  relationships: ["Should we move together or keep separate homes?", "I need to stay close to my family."],
} as const;

const genderLabels = { woman: "Woman", man: "Man", nonbinary: "Nonbinary" } as const;
const sampleCircumstances = {
  career: "I share a flat in Almaty and split the rent with a friend.",
  education: "I live in Astana and help my younger brother after classes.",
  relationships: "I live in Karaganda and visit my family every Sunday.",
} as const;

function PersonalContext({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  if (!profile.dilemma && !profile.gender && !profile.personal_context) return null;
  return <div className="panel personal-context">{profile.dilemma && <><h3>{t("Your dilemma")}</h3><p>{profile.dilemma}</p>
    <p><strong>{t("Important constraint")}</strong> · {profile.constraint}</p>
    <p><strong>{t("Values")}</strong> · {profile.selected_values?.map(id => t(metrics[id])).join(", ")}</p></>}
    {profile.gender && <p>{t("Gender (optional)")} · {t(genderLabels[profile.gender])}</p>}
    {profile.personal_context && <p><strong>{t("My circumstances")}</strong> · {profile.personal_context}</p>}</div>;
}

const avatarGlyph = { dawn: "☀", orbit: "◉", night: "☾", ember: "✦" };
const avatarLabels = { dawn: "Dawn", orbit: "Orbit", night: "Night", ember: "Ember" } as const;
const screens: View[] = ["home", "onboarding", "scenarios", "story", "map", "compare", "lab", "bridge", "universes"];

function currentView(): View | undefined {
  const value = new URLSearchParams(window.location.search).get("view");
  return screens.find((screen) => screen === value);
}

function SceneArt({ category, className = "" }: { category: Category; className?: string }) {
  return <div className={`scene-art art-${category} ${className}`} aria-hidden="true" />;
}

function StartHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}</div>;
}

function ScenarioCards({ select, continuing }: { select: (category: Category) => void; continuing?: Category }) {
  const { t, story } = useTranslation();
  return <div className="scenario-grid">{categories.map((id) => {
    const { title, icon: Icon } = categoryInfo[id];
    return <button type="button" key={id} className={`scenario-card ${id}`} onClick={() => select(id)}>
      <SceneArt category={id} />
      <div className="scenario-top"><span className="scenario-icon"><Icon size={21} /></span><ArrowDownRight size={20} /></div>
      <div><h3>{story(title)}</h3><p>{t(decisionQuestions[id])}</p><span className="scenario-action">{continuing === id ? t("Continue") : t("Start")} <span aria-hidden="true">→</span></span></div>
    </button>;
  })}</div>;
}

function Home({ start, continuing, resume }: { start: (category?: Category) => void; continuing?: Category; resume: () => void }) {
  const { t } = useTranslation();
  return <>
    <section className="hero">
      <div className="hero-image" />
      <div className="hero-content">
        <p className="eyebrow"><span /> {t("Interactive fiction")}</p>
        <h1>{t("What if you")}<br /><em>{t("chose differently?")}</em></h1>
        <p>{t("Play through three fictional years of work, study, or relationships. Make a choice, see what changes, then try another path.")}</p>
        <div className="actions">{continuing && <Button onClick={resume}>{t("Continue")} <ArrowRight size={17} /></Button>}
          <a className={`button ${continuing ? "button-outline" : "button-default"}`} href="#story-catalog">{t("Choose a story")} <ArrowDownRight size={17} /></a></div>
      </div>
    </section>
    <section id="story-catalog" className="catalog"><div className="section-heading"><h2>{t("Which decision would you like to try?")}</h2><span>{t("Three playable stories")}</span></div>
      <ScenarioCards continuing={continuing} select={(category) => category === continuing ? resume() : start(category)} />
    </section>
  </>;
}

function Onboarding({ category, onSave }: { category: Category; onSave: (profile: Omit<Profile, "id">) => void }) {
  const { t, story } = useTranslation();
  const [avatar, setAvatar] = useState<Profile["avatar"]>("dawn");
  const [invalid, setInvalid] = useState<"age" | "values" | "required" | null>(null);
  const busy = useGame((state) => state.busy);
  const [selected, setSelected] = useState<ValueId[]>([]);
  function quickStart(form: HTMLFormElement | null) {
    const data = form ? new FormData(form) : undefined;
    onSave({ life_priorities: readLifePriorities(data), gender: (data?.get("gender") || "") as Profile["gender"],
      personal_context: String(data?.get("personal_context") || "").trim() || t(sampleCircumstances[category]), name: t("Aruzhan"), age: categoryInfo[category].age, avatar: "orbit",
      situation: "At a turning point", goal: "Explore the trade-offs before deciding", category,
      traits: "", values: "", background: "", dilemma: t(fictional[category][0]), constraint: t(fictional[category][1]),
      selected_values: category === "career" ? ["finances", "freedom"] : category === "education" ? ["knowledge", "finances"] : ["social", "freedom"] });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (key: string) => String(data.get(key) ?? "").trim();
    for (const key of ["name", "age", "dilemma", "constraint"]) {
      const age = Number(field("age"));
      if (key === "age" ? !Number.isInteger(age) || age < 18 || age > 120 : !field(key)) {
        setInvalid(key === "age" ? "age" : "required");
        (event.currentTarget.elements.namedItem(key) as HTMLInputElement)?.focus();
        return;
      }
    }
    if (selected.length < 2) {
      setInvalid("values");
      event.currentTarget.querySelector<HTMLInputElement>('input[name="personal-value"]')?.focus();
      return;
    }
    setInvalid(null);
    onSave({ gender: field("gender") as Profile["gender"], personal_context: field("personal_context"), life_priorities: readLifePriorities(data), name: field("name"), age: Number(field("age")), avatar, situation: field("situation") || "At a turning point",
      goal: field("goal") || "Explore the trade-offs before deciding", dilemma: field("dilemma"), constraint: field("constraint"), selected_values: selected, category: field("category") as Category, traits: field("traits"),
      values: selected.map(id => metrics[id]).join(", "), background: field("background") });
  }
  return <section className="narrow">
    <StartHeader eyebrow={t("Your avatar")} title={t("Who will you play?")}><p>{t("Start with a ready-made character, or fill in the profile below.")}</p>
      <Button className="quick-start" variant="outline" form="avatar-profile" disabled={busy}
        onClick={event => quickStart(event.currentTarget.form)}>{t("Quick Start")} <ArrowRight size={16} /></Button>
    </StartHeader>
    <form id="avatar-profile" className="panel form-grid" onSubmit={submit} noValidate onInput={() => setInvalid(null)}>
      {invalid && <p className="error" role="alert">{invalid === "age" ? t("Enter an age between 18 and 120.") : invalid === "values" ? t("Choose two or three values.") : t("Fill out this field.")}</p>}
      <fieldset><legend>{t("Avatar")}</legend><div className="avatar-row">{avatars.map((item) =>
        <button key={item} type="button" className={`avatar ${item}`} aria-pressed={item === avatar}
          aria-label={t(avatarLabels[item])} onClick={() => setAvatar(item)}>{avatarGlyph[item]}</button>)}</div></fieldset>
      <div className="form-row">
        <label>{t("Display name")}<input name="name" maxLength={120} required /></label>
        <label>{t("Age")}<input name="age" type="number" min={18} max={120} defaultValue={categoryInfo[category].age} required /></label>
      </div>
      <label>{t("Your dilemma")}<input name="dilemma" maxLength={300} required placeholder={t(fictional[category][0])} /></label>
      <label>{t("Important constraint")}<input name="constraint" maxLength={300} required placeholder={t(fictional[category][1])} /></label>
      <fieldset><legend>{t("Choose two or three values.")}</legend><div className="priority-list">{valueIds.map(id =>
        <label key={id}><input type="checkbox" name="personal-value" checked={selected.includes(id)}
          disabled={selected.length === 3 && !selected.includes(id)} onChange={e => setSelected(e.target.checked ? [...selected, id] : selected.filter(item => item !== id))} /> {t(metrics[id])}</label>)}</div></fieldset>
      <PrioritySliders />
      <label>{t("Preferred story")}<select name="category" defaultValue={category}>{categories.map((id) =>
        <option value={id} key={id}>{story(categoryInfo[id].title)}</option>)}</select></label>
      <details><summary>{t("Optional character details")}</summary>
        <div className="form-grid optional-fields">
          <label>{t("Gender (optional)")}<select name="gender" defaultValue="">
            <option value="">{t("Prefer not to say")}</option>
            {Object.entries(genderLabels).map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
          </select></label>
          <label>{t("My circumstances")}<textarea name="personal_context" maxLength={300} rows={2}
            placeholder={t("For example, I live in Taraz and can travel only on weekends.")} /></label>
          <label>{t("Personality traits")}<input name="traits" maxLength={180} /></label>
          <label>{t("Current work or study situation")}<input name="situation" maxLength={120} /></label>
          <label>{t("Main personal goal")}<input name="goal" maxLength={120} /></label>
          <label>{t("Fictional background")}<textarea name="background" maxLength={300} rows={2} /></label>
        </div>
      </details>
      <div className="actions"><Button type="submit" disabled={busy}>{t("Save avatar")} <ArrowRight size={16} /></Button>
      </div>
    </form>
  </section>;
}

function JourneyNav({ game, view, open }: { game: Game; view: View; open: (view: View) => void }) {
  const { t } = useTranslation();
  const links: { label: string; view: View; icon: typeof BookOpen; enabled: boolean }[] = [
    { label: t("Story"), view: "story", icon: BookOpen, enabled: true },
    { label: t("Life Map"), view: "map", icon: GitFork, enabled: true },
    { label: t("Compare"), view: "compare", icon: Layers, enabled: game.endings.length > 0 },
    { label: t("Decision Lab"), view: "lab", icon: Compass, enabled: game.endings.length > 0 },
    { label: t("Reality Bridge"), view: "bridge", icon: CircleCheck, enabled: !!game.passport },
  ];
  return <nav aria-label={t("Current journey")} className="journey-nav">{links.map(({ label, view: target, icon: Icon, enabled }) =>
    <Button key={target} variant="ghost" aria-current={view === target ? "page" : undefined} disabled={!enabled}
      onClick={() => open(target)}><Icon size={16} /> {label}</Button>)}</nav>;
}

function PathButtons({ scenario, start, explored = [] }: { scenario: Scenario; start: (id: string) => void; explored?: string[] }) {
  const { t } = useTranslation();
  const busy = useGame((state) => state.busy);
  return <div className="choice-list decision-paths">{scenario.paths.map((path) =>
    <Button key={path.id} variant="outline" className="choice" disabled={busy} onClick={() => start(path.id)}>
      <span><strong>{path.short}</strong><small>{pathTradeoffs[path.id] ? t(pathTradeoffs[path.id]) : path.description}</small></span>
      {explored.includes(path.id) ? <span className="small-label">{t("Explored")}</span> : <ArrowRight size={17} />}
    </Button>)}</div>;
}

function Chat({ game, branch, scenario, send }: {
  game: Game; branch: Branch; scenario: Scenario; send: (npc: string, message: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const available = scenario.npcs.filter((npc) => branch.scene?.npcs.includes(npc.id));
  const [selected, setSelected] = useState(available[0]?.id);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const { busy, ai } = useGame();
  const npc = available.find((npc) => npc.id === selected) ?? available[0];
  if (!npc) return null;
  const state = branch.npcs?.[npc.id];
  const messages = state?.messages ?? [];
  const limited = messages.length >= 32;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || sending || limited || !text.trim()) return;
    setSending(true);
    try {
      if (await send(npc.id, text.trim())) setText("");
    } finally {
      setSending(false);
    }
  }
  return <aside className="panel chat">
    <h2><MessageCircle size={18} /> {t("Characters in this scene")}</h2>
    <div className="npc-list">{available.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item.id)}
      aria-pressed={npc.id === item.id} disabled={sending}><span className={`npc-avatar portrait-${item.id}`} aria-hidden="true">{item.avatar}</span><span>{item.name}</span></button>)}</div>
    <p className="npc-role">{npc.role} · {npc.mood}</p>
    <details className="npc-bio"><summary>{t("About {name}", { name: npc.name })}</summary><p>{npc.background}</p><p>{npc.goal}</p></details>
    <p className="small-label">{ai ? t("AI conversation available") : t("Scripted demo conversation")} · {t("Trust")} {state?.trust ?? 50}</p>
    {ai && <p className="npc-role">{t("For a live reply, the AI provider receives this scene, relevant messages and any gender or circumstances you entered.")}</p>}
    {game.profile.personal_context && <Button variant="outline" disabled={busy || limited || sending}
      onClick={() => setText(t("How does my situation fit this decision?"))}>{t("How does my situation fit this decision?")}</Button>}
    <div className="messages" role="log" aria-live="polite" aria-label={t("Conversation")} tabIndex={0}
      ref={(node) => { if (node) node.scrollTop = node.scrollHeight; }}>
      {messages.length ? messages.map((message, i) => <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        key={i} className={`message ${message.role}`}><small>{message.role === "player" ? game.profile.name : npc.name}{message.mode && ` · ${t(message.mode === "scripted" ? "Scripted" : "Live AI")}`}</small><p lang={message.locale ?? "en"}>{message.text}</p></motion.div>)
        : <p className="muted">{t("Ask about their goals or something that happened in this timeline.")}</p>}
    </div>
    <form className="chat-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="chat-text">{t("Message {name}", { name: npc.name })}</label>
      <textarea id="chat-text" rows={2} maxLength={600} value={text} disabled={limited} onChange={(event) => setText(event.target.value)}
        placeholder={limited ? t("Conversation limit reached") : t("Talk to {name}…", { name: npc.name.split(" ")[0] })} />
      <Button type="submit" disabled={busy || limited || !text.trim()}>{sending ? t("Waiting for reply…") : t("Send")} <ArrowRight size={15} /></Button>
    </form>
  </aside>;
}

function Outcome({ ending, expanded = false }: { ending: Ending; expanded?: boolean }) {
  const { t } = useTranslation();
  return <article className="panel outcome"><p className="eyebrow">{ending.path}</p><h2>{ending.title}</h2><p>{ending.body}</p>
    {ending.aftermath && <p className="last-event">{ending.aftermath}</p>}
    <dl className="tradeoffs"><div><dt>{t("What you gained")}</dt><dd>{ending.gain}</dd></div><div><dt>{t("What it cost")}</dt><dd>{ending.cost}</dd></div></dl>
    <details open={expanded}><summary>{t("Choices and consequences")}</summary><ol>{ending.events.map((event, index) =>
      <li key={index}><strong>{event.choice}</strong><p>{event.outcome}</p></li>)}</ol></details>
  </article>;
}

function WorldState({ branch }: { branch: Branch }) {
  const { t } = useTranslation();
  return <details className="world"><summary>{t("Fictional world state")}</summary><div className="metric-grid">
    {Object.entries(branch.world).map(([key, value]) => <div key={key}>
      <span>{t(metrics[key as keyof typeof metrics])} <strong>{value}</strong></span><meter min={0} max={100} value={value} aria-label={t(metrics[key as keyof typeof metrics])} />
    </div>)}</div></details>;
}

function Story({ game, scenario, start, choose, send, open, narrate }: {
  game: Game; scenario: Scenario; start: (id: string) => void; choose: (id: string, index: number) => void;
  send: (npc: string, text: string) => Promise<boolean>; open: (view: View) => void; narrate: () => void;
}) {
  const { t } = useTranslation();
  const { busy, ai } = useGame();
  const branch = game.branches.find((item) => item.id === game.active_id);
  const scene = branch?.scene;
  const ending = game.endings.find((item) => item.id === branch?.id);
  if (ending) return <section className="story-page">
    <StartHeader eyebrow={t("Year 3 · Timeline complete")} title={t("One possible life")} />
    <ChoiceResult event={ending.events.at(-1)} scenario={scenario} />
    <Outcome ending={{ ...ending, aftermath: null }} />
    <div className="actions"><Button onClick={() => open("compare")}>{t("Compare timelines")}</Button>
      <Button variant="outline" onClick={() => open("map")}>{t("Explore another life")} <GitFork size={16} /></Button>
      <Button variant="ghost" onClick={() => open("lab")}>{t("Open Decision Lab")}</Button></div>
  </section>;
  if (!branch || !scene) return <section className="story-page decision-start">
    <StartHeader eyebrow={scenario.title} title={t(decisionQuestions[scenario.id])}><p>{scenario.intro}</p></StartHeader>
    <div className="decision-heading"><h2>{t("Choose your first path")}</h2><p>{t("You can return to this decision and play another path.")}</p></div>
    <PathButtons scenario={scenario} start={start} />
    <PersonalContext profile={game.profile} />
    <CountryContext category={scenario.id} />
  </section>;
  const path = scenario.paths.find((item) => item.id === branch.path_id);
  return <section className="story-layout">
    <div className="panel scene">
      <ChoiceResult event={branch.events.at(-1)} scenario={scenario} />
      <SceneArt category={scenario.id} className="scene-cover" />
      <div className="chapter"><span>{t("Scene {current} of {total}", { current: scene.index + 1, total: scene.count })}</span><span>{scene.when}</span></div>
      <div className="chapter-progress"><span style={{ width: `${(scene.index + 1) / scene.count * 100}%` }} /></div>
      <p className="eyebrow"><MapPin size={14} /> {scene.location}</p>
      <h1>{scene.title}</h1><p className="scene-body">{scene.body}</p>
      {scene.reaction && <p className="last-event">{scene.reaction}</p>}
      {scene.dialogue && <blockquote>{scene.dialogue}</blockquote>}
      {scene.side_event && <details className="world"><summary>{t("A moment on the side")}</summary><p>{scene.side_event}</p></details>}
      {ai && !scene.personalized && <Button variant="ghost" disabled={busy} onClick={narrate}><Sparkles size={15} /> {t(scene.has_personalization ? "Translate AI scene" : "Personalize scene")}</Button>}
      <div className="decision-heading"><h2>{t("What will you do?")}</h2>
        {scene.choices.some(option => option.effects) && <p>{t("Arrows show what each choice changes in this story.")}</p>}</div>
      <div className="choice-list decision-options">{scene.choices.map((option) => <Button key={option.id} className="choice" variant="outline"
        disabled={busy} onClick={() => choose(option.id, scene.index)}><span><strong>{option.label}</strong>
          {option.effects ? <ChoiceEffects effects={option.effects} scenario={scenario} /> :
            <small>{option.focus.map(key => t(metrics[key as keyof typeof metrics] ?? "Character trust")).filter((item, i, all) => all.indexOf(item) === i).join(" · ")}</small>}
        </span><ArrowRight size={17} /></Button>)}</div>
      <WorldState branch={branch} />
      <p className="small-label">{path?.title}</p>
    </div>
    <Chat key={`${branch.id}:${scene.index}`} branch={branch} scenario={scenario} game={game} send={send} />
  </section>;
}

type AskSelf = (branchId: string, index: number, text: string) => Promise<boolean>;

function OtherSelf({ game, branch, ask }: { game: Game; branch: Branch; ask: AskSelf }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(branch.events.length - 1);
  const [question, setQuestion] = useState("");
  const busy = useGame(state => state.busy);
  async function send(text: string) {
    if (!busy && text.trim() && await ask(branch.id, index, text.trim())) setQuestion("");
  }
  return <details className="panel timeline-item"><summary>{t("Talk to my other self")}</summary>
    <label>{t("Which decision?")}<select value={index} disabled={busy} onChange={e => setIndex(Number(e.target.value))}>
      {branch.events.map((event, i) => <option key={i} value={i}>{i + 1}. {event.choice}</option>)}
    </select></label>
    <div role="log" aria-live="polite">{(game.self_dialogues?.[branch.id] ?? []).map((turn, i) =>
      <article className="panel" key={i}><small>{turn.scene_index + 1}. {branch.events[turn.scene_index]?.scene} · {branch.events[turn.scene_index]?.choice}</small>
        <p lang={turn.locale}><strong>{turn.question}</strong></p><p lang={turn.locale}>{turn.reply}</p>
        <small>{t("My other self")} · {t(turn.mode === "live" ? "AI reply" : "From the timeline journal")}</small>
      </article>)}</div>
    <div className="actions">{(["Why did you make this choice?", "What did it lead to?", "What did it cost?", "Do you regret this choice?", "What remains unknown?"] as const).map(key =>
      <Button key={key} variant="outline" disabled={busy} onClick={() => void send(t(key))}>{t(key)}</Button>)}</div>
    <form className="chat-form" onSubmit={e => { e.preventDefault(); void send(question); }}>
      <label>{t("Ask about this decision")}<textarea maxLength={600} rows={2} value={question}
        disabled={busy} onChange={e => setQuestion(e.target.value)} /></label>
      <Button type="submit" disabled={busy || !question.trim()}>{t("Ask")}</Button>
    </form>
  </details>;
}

function TimelineScreen({ game, scenario, start, activate, fork, ask }: {
  ask: AskSelf;
  game: Game; scenario: Scenario; start: (id: string) => void; activate: (id: string) => void;
  fork: (id: string, checkpoint: number) => void;
}) {
  const { t } = useTranslation();
  const busy = useGame((state) => state.busy);
  return <section><StartHeader eyebrow={scenario.title} title={t("Life Map")}><p>{t("Start another path or return to a saved decision to create a separate timeline.")}</p></StartHeader>
    <LifeMap game={game} scenario={scenario} onSelect={activate} onFork={fork} />
    <div className="map-details"><div><h2>{t("Start from the crossroads")}</h2>
      <PathButtons scenario={scenario} start={start} explored={game.branches.map((branch) => branch.path_id)} /></div>
      <div><h2>{t("Saved timelines")}</h2>
        {game.branches.length === 0 && <p className="muted">{t("Your first timeline appears after you choose a path.")}</p>}
        {game.branches.map((branch, i) => <article key={branch.id} className="panel timeline-item">
          <h3>{scenario.paths.find((path) => path.id === branch.path_id)?.short} · {t("Timeline {number}", { number: i + 1 })}</h3>
          <p className="muted">{branch.ending === null ? t("In progress · decisions: {count}", { count: branch.events.length }) : t("Finished")}</p>
          <Button variant="outline" disabled={busy} onClick={() => activate(branch.id)}>{t("Open timeline")}</Button>
          {branch.events.length > 0 && <details open><summary>{t("Branch from a saved decision")}</summary><ol>
            {branch.events.map((event, index) => <li key={index}><Button variant="ghost" disabled={busy} onClick={() => fork(branch.id, index)}>
              <GitFork size={14} /> {t("Replay {scene}", { scene: event.scene })} · {event.choice}</Button></li>)}</ol></details>}
          {branch.events.length > 0 && <OtherSelf game={game} branch={branch} ask={ask} />}
        </article>)}
      </div>
    </div>
  </section>;
}

function Compare({ game, open, ask }: { ask: AskSelf; game: Game; open: (view: View) => void }) {
  const { t, story } = useTranslation();
  const [left, setLeft] = useState(game.endings[0]?.id);
  const [right, setRight] = useState(game.endings[1]?.id ?? "");
  const a = game.endings.find((ending) => ending.id === left) ?? game.endings[0];
  const b = game.endings.find((ending) => ending.id === right && ending.id !== a?.id);
  function conversation(id: string) {
    const branch = game.branches.find(item => item.id === id);
    return branch?.events.length ? <OtherSelf key={id} game={game} branch={branch} ask={ask} /> : null;
  }
  return <section><StartHeader eyebrow={story(categoryInfo[game.scenario_id].title)} title={t("Compare timelines")}><p>{t("See the choices, benefits, and trade-offs you experienced in each life.")}</p></StartHeader>
    <PersonalContext profile={game.profile} />
    {a && game.profile.life_priorities && <PriorityComparison weights={game.profile.life_priorities} endings={b ? [a, b] : [a]} />}
    {a && b && <>
      <Divergence game={game} first={a} second={b} />
      <aside className="panel personal-context"><h2>{t("Guide between timelines")}</h2>
        <p>{t("In the first life you gained “{gain}”. In the second, the cost was “{cost}”.", { gain: a.gain, cost: b.cost })}</p>
        <p>{game.profile.constraint
          ? t("Given your constraint “{constraint}”, which compromise could you live with for a week?", { constraint: game.profile.constraint })
          : t("Which compromise could you live with for a week?")}</p>
        <Button variant="outline" onClick={() => open("lab")}>{t("Reflect in Decision Lab")}</Button>
      </aside>
    </>}
    <div className="compare-grid">
      <div>{a && <><label>{t("First timeline")}<select value={a.id} onChange={(event) => {
        setLeft(event.target.value);
        if (event.target.value === right) setRight(a.id);
      }}>{game.endings.map((end, i) => <option value={end.id} key={end.id}>{i + 1}. {end.path} · {end.title}</option>)}</select></label>
        <Outcome ending={a} expanded />{conversation(a.id)}</>}</div>
      <div>{game.endings.length > 1 && <label>{t("Second timeline")}<select value={b?.id ?? ""} onChange={(event) => setRight(event.target.value)}>
        <option value="">{t("Choose another timeline")}</option>{game.endings.map((end, index) => end.id !== a?.id &&
          <option value={end.id} key={end.id}>{index + 1}. {end.path} · {end.title}</option>)}</select></label>}
        {b ? <><Outcome ending={b} expanded />{conversation(b.id)}</> : <div className="panel empty"><GitFork /><h2>{game.endings.length < 2 ? t("Explore a second path") : t("Select an ending")}</h2>
          {game.endings.length < 2 && <Button variant="outline" onClick={() => open("map")}>{t("Open Life Map")}</Button>}</div>}</div>
    </div><div className="actions"><Button onClick={() => open("lab")}>{t("Reflect in Decision Lab")} <ArrowRight size={16} /></Button></div>
  </section>;
}

function Divergence({ game, first, second }: { game: Game; first: Ending; second: Ending }) {
  const { t } = useTranslation();
  const differentPaths = game.branches.find(b => b.id === first.id)?.path_id !== game.branches.find(b => b.id === second.id)?.path_id;
  const index = differentPaths ? 0 : first.events.findIndex((event, i) => second.events[i] &&
    (event.choice_id ?? event.choice) !== (second.events[i].choice_id ?? second.events[i].choice));
  return <section className="panel divergence"><h2>{t("Where the timelines diverged")}</h2>
    {index < 0 ? <p>{t("Both timelines share the same recorded choices.")}</p> : <>
      <p>{differentPaths ? t("Original decision") : first.events[index].scene}</p>
      <div className="compare-grid">{[first, second].map((end, i) => <div key={end.id}>
        <h3>{i === 0 ? t("First timeline") : t("Second timeline")} · {end.path}</h3>
        <small>{t("Observed in the story")}</small><p><strong>{end.events[index].choice}</strong></p><p>{end.events[index].outcome}</p>
        <strong>{t("Later trade-off")}</strong><p>{end.gain} · {end.cost}</p>
      </div>)}</div></>}
  </section>;
}

function ValueMatrix({ game }: { game: Game }) {
  const { t } = useTranslation();
  const values = game.profile.selected_values;
  if (!values?.length) return null;
  return <section className="panel matrix" tabIndex={0} aria-label={t("Your values across timelines")}>
    <h2>{t("Your values across timelines")}</h2><p>{t("Scores describe the fictional world. You decide which trade-off is acceptable.")}</p>
    <table><thead><tr><th scope="col">{t("Values")}</th>{game.endings.map((end, i) => <th scope="col" key={end.id}>{t("Timeline {number}", { number: i + 1 })} · {end.path}</th>)}</tr></thead>
    <tbody>{values.map(id => <tr key={id}><th scope="row">{t(metrics[id])}</th>{game.endings.map(end => {
      const branch = game.branches.find(b => b.id === end.id);
      const event = end.events.filter(e => e.effects[id]).sort((a, b) => Math.abs(b.effects[id]) - Math.abs(a.effects[id]))[0];
      return <td key={end.id}><strong>{branch?.world[id]} / 100</strong>{event ? <>
        <p>{event.scene} · {event.choice}</p><p>{event.outcome}</p>
        <small>{t("Effect in this scene")} {event.effects[id] > 0 ? "+" : ""}{event.effects[id]}</small>
      </> : <p>{t("No recorded decision changed this score.")}</p>}</td>;
    })}</tr>)}</tbody></table><p>{t("Your interpretation: which event matters most to you?")}</p>
  </section>;
}

function DecisionLab({ game, scenario, save, open }: {
  game: Game; scenario: Scenario; save: (values: { priorities: string[]; uncertainty: string; next_step: string }) => void;
  open: (view: View) => void;
}) {
  const { t, story } = useTranslation();
  const busy = useGame((state) => state.busy);
  const [priorities, setPriorities] = useState(game.passport?.priorities ?? []);
  const [uncertainty, setUncertainty] = useState(game.passport?.uncertainty ?? "");
  const [step, setStep] = useState(game.passport?.next_step ?? "");
  const passport = game.passport;
  function download() {
    if (!passport) return;
    const text = [`Parallel Life · ${t("Decision Passport")}`, scenario.subtitle, passport.dilemma || scenario.intro,
      ...(passport.constraint ? [`${t("Important constraint")}: ${passport.constraint}`] : []),
      ...(passport.selected_values?.length ? [`${t("Values")}: ${passport.selected_values.map(id => t(metrics[id])).join(", ")}`] : []),
      `${t("Priorities")}: ${passport.priorities.map(story).join(", ")}`, ...passport.timelines.map((timeline) =>
        `${timeline.path} — ${timeline.title}\n${t("What you gained")}: ${timeline.gain}\n${t("What it cost")}: ${timeline.cost}\n${timeline.events.map((event) => `• ${event.choice} — ${event.outcome}`).join("\n")}`),
      `${t("What’s still uncertain?")} ${passport.uncertainty || scenario.question}`, `${t("Question")}: ${scenario.question}`,
      ...(passport.questions ?? []).map((question) => `${t("Question")}: ${question}`),
      `${t("Optional experiment")}: ${passport.experiment_title || scenario.experiment.title}`,
      `${t("Next step")}: ${passport.next_step || scenario.experiment.steps[0]}`].join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "decision-passport.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="lab-layout">
    <div><StartHeader eyebrow={scenario.title} title={t("Decision Lab")}><p>{scenario.intro}</p></StartHeader>
      <ValueMatrix game={game} />
      <div className="reflection-outcomes">{game.endings.map((end) => <Outcome key={end.id} ending={end} expanded />)}</div></div>
    <form className="panel form-grid" onSubmit={(event) => { event.preventDefault(); save({ priorities, uncertainty, next_step: step }); }}>
      <h2>{t("Decision Passport")}</h2>
      <PersonalContext profile={game.profile} />
      <fieldset><legend>{t("What mattered most to you in this story?")}</legend><div className="priority-list">{scenario.priorities.map((item) =>
        <label key={item}><input type="checkbox" checked={priorities.includes(item)} onChange={(event) =>
          setPriorities(event.target.checked ? [...priorities, item] : priorities.filter((entry) => entry !== item))} /> {story(item)}</label>)}</div></fieldset>
      <div className="reflection-questions"><h3>{t("Questions to take with you")}</h3>
        <ul>{[scenario.question, ...scenario.questions].map((question) => <li key={question}>{question}</li>)}</ul></div>
      <label>{t("What’s still uncertain?")}<textarea rows={2} maxLength={500} value={uncertainty} onChange={(event) => setUncertainty(event.target.value)} /></label>
      <label>{t("One practical next step")}<textarea rows={2} maxLength={500} value={step} onChange={(event) => setStep(event.target.value)}
        placeholder={scenario.experiment.steps[0]} /></label>
      <div className="actions"><Button type="submit" disabled={!priorities.length || busy}>{t("Save Passport")}</Button>
        {passport && <Button variant="outline" onClick={download}>{t("Download")}</Button>}</div>
      {passport && <><p className="saved" role="status">{t("Passport saved · explored timelines: {count}", { count: passport.timelines.length })}</p>
        <div className="passport-experiment"><small>{t("Optional experiment")}</small><strong>{scenario.experiment.title}</strong><p>{scenario.experiment.description}</p></div>
        <Button variant="outline" onClick={() => open("bridge")}>{t("Continue to Reality Bridge")} <ArrowRight size={16} /></Button></>}
    </form>
  </section>;
}

export function ParallelLife({ initialLocale = "en" }: { initialLocale?: Locale }) {
  const [locale, setLocale] = useState(initialLocale);
  useEffect(() => {
    function readLocale() {
      const saved = localStorage.getItem(localeKey);
      const route = urlLocale();
      if (route) localStorage.setItem(localeKey, route);
      setLocale(route ?? (isLocale(saved) ? saved : "en"));
    }
    readLocale();
    window.addEventListener("popstate", readLocale);
    return () => window.removeEventListener("popstate", readLocale);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    const t = messages(locale);
    document.title = `Parallel Life — ${t("One life.")} ${t("Infinite possibilities.")}`;
  }, [locale]);
  function switchLocale(next: Locale) {
    if (next === locale && urlLocale() === next) return;
    localStorage.setItem(localeKey, next);
    // Keep the mounted game, draft inputs and the current history entry's view.
    window.history.replaceState(window.history.state, "", `/${next}${window.location.search}${window.location.hash}`);
    setLocale(next);
  }
  return <LanguageContext.Provider value={locale}>
    <GameInterface switchLocale={switchLocale} />
  </LanguageContext.Provider>;
}

function GameInterface({ switchLocale }: { switchLocale: (locale: Locale) => void }) {
  const { locale, t, story } = useTranslation();
  const { view, game: rawGame, profile, catalog, busy, error, setView, update } = useGame();
  const reduceMotion = useReducedMotion();
  const [preferred, setPreferred] = useState<Category>("career");
  const [universes, setUniverses] = useState<Universe[] | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const canonicalScenario = catalog.find((item) => item.id === rawGame?.scenario_id);
  const scenario = useMemo(() => canonicalScenario && localizeScenario(canonicalScenario, locale), [canonicalScenario, locale]);
  const game = useMemo(() => rawGame && localizeGame(rawGame, locale), [rawGame, locale]);

  async function loadCatalog() {
    if (useGame.getState().catalog.length) return;
    const [items, status] = await Promise.all([api<Scenario[]>("/scenarios"), api<{ ai: boolean }>("/status")]);
    useGame.setState({ catalog: items, ai: status.ai });
  }

  useEffect(() => {
    const previous = currentView();
    const id = localStorage.getItem(activeKey);
    void perform(async () => {
      const profiles = await api<Profile[]>("/profiles");
      if (profiles.length) useGame.setState({ profile: profiles.at(-1) });
      if (previous === "universes") {
        setView("universes");
        setUniverses(await api<Universe[]>("/sessions"));
      }
      if (!id) {
        if (previous === "scenarios" && profiles.length) setView("scenarios");
        if (previous === "onboarding") setView("onboarding");
        return;
      }
      await loadCatalog();
      try {
        update(await api<Game>(`/sessions/${id}`));
        const savedGame = useGame.getState().game;
        const restored = previous ?? (savedGame?.experiment.plan && savedGame.experiment.status === "active" ? "bridge" : "story");
        setView(restored);
        const url = new URL(window.location.href);
        url.searchParams.set("view", restored);
        window.history.replaceState({ ...window.history.state, parallelLifeView: restored }, "", url);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) localStorage.removeItem(activeKey);
        throw error;
      }
    });
  }, [setView, update]);

  useEffect(() => {
    function restoreView(event: PopStateEvent) {
      const { game, profile } = useGame.getState();
      const next: View = currentView() ?? event.state?.parallelLifeView ?? (game ? "story" : "home");
      setView(!game && ["story", "map", "compare", "lab", "bridge"].includes(next) ||
        !profile && next === "scenarios" ? "home" : next);
      if (next === "universes") void perform(async () => { setUniverses(await api<Universe[]>("/sessions")); });
    }
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, [setView]);

  function open(next: View) {
    if (useGame.getState().view !== next) {
      const url = new URL(window.location.href);
      url.searchParams.set("view", next);
      window.history.pushState({ ...window.history.state, parallelLifeView: next }, "", url);
    }
    setView(next);
    window.scrollTo(0, 0);
    if (next === "universes") {
      setUniverses(null);
      void perform(async () => { setUniverses(await api<Universe[]>("/sessions")); });
    }
  }

  function start(category: Category = "career") {
    setPreferred(category);
    open("onboarding");
  }

  function saveProfile(value: Omit<Profile, "id">) {
    void perform(async () => {
      await loadCatalog();
      const profile = await api<Profile>("/profiles", "POST", value);
      useGame.setState({ profile });
      update(await api<Game>("/sessions", "POST", { profile_id: profile.id, scenario_id: profile.category }));
      open("story");
    });
  }

  function startSession(category: Category) {
    if (!profile) return start(category);
    void perform(async () => {
      update(await api<Game>("/sessions", "POST", { profile_id: profile.id, scenario_id: category }));
      open("story");
    });
  }

  const askSelf: AskSelf = (id, index, text) =>
    mutation(`/branches/${id}/other-self`, "POST", { scene_index: index, text, locale });

  const branchPath = game?.active_id ? `/branches/${game.active_id}` : "";
  async function mutation(path: string, method = "POST", body?: unknown, next?: View) {
    if (!game) return false;
    let completed = false;
    await perform(async () => {
      try {
        update(await api<Game>(`/sessions/${game.id}${path}`, method, body));
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          const latest = await api<Game>(`/sessions/${game.id}`).catch(() => null);
          if (latest) update(latest);
        }
        throw error;
      }
      if (next) open(next);
      completed = true;
    });
    return completed;
  }

  function resume(id: string) {
    void perform(async () => {
      await loadCatalog();
      const savedGame = await api<Game>(`/sessions/${id}`);
      update(savedGame);
      open(savedGame.experiment.plan && savedGame.experiment.status === "active" ? "bridge" : "story");
    });
  }

  function remove(id: string) {
    void perform(async () => {
      await api(`/sessions/${id}`, "DELETE");
      if (game?.id === id) {
        localStorage.removeItem(activeKey);
        useGame.setState({ game: null, profile: null });
      }
      setUniverses(await api<Universe[]>("/sessions"));
      setDeleteId(null);
    });
  }

  let content: ReactNode;
  switch (view) {
    case "home": content = <Home start={start} continuing={game?.scenario_id} resume={() => open(game?.experiment.plan && game.experiment.status === "active" ? "bridge" : "story")} />; break;
    case "onboarding": content = <Onboarding key={preferred} category={preferred} onSave={saveProfile} />; break;
    case "scenarios": content = <section className="catalog-page">
      <StartHeader eyebrow={t("Your next decision")} title={t("Choose a crossroads")}><p>{t("Playing as {name}. Choose the story you want to explore first.", { name: profile?.name ?? "" })}</p></StartHeader>
      {profile && <PersonalContext profile={profile} />}
      <ScenarioCards select={startSession} /></section>; break;
    case "universes": content = <section><StartHeader eyebrow={t("Saved stories")} title={t("My Universes")}><p>{t("Resume a saved story in this browser.")}</p></StartHeader>
      {universes === null ? <div className="panel empty"><p>{busy ? t("Loading your universes…") : t("Couldn’t load your universes.")}</p>
        {!busy && <Button variant="outline" onClick={() => open("universes")}>{t("Try again")}</Button>}</div> : universes.length ? <div className="universe-list">{universes.map((universe) =>
        <article className="panel universe" key={universe.id}><div><h2>{story(categoryInfo[universe.scenario_id].title)}</h2>
          <p>{universe.profile.name} · {t("Timelines: {total} · Finished: {done}", { total: universe.branches, done: universe.completed })}</p></div>
          <div className="actions"><Button disabled={busy} onClick={() => resume(universe.id)}>{t("Continue")}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setDeleteId(universe.id)} aria-label={t("Delete {name} universe", { name: story(categoryInfo[universe.scenario_id].title) })}><Trash2 size={17} /></Button></div>
          {deleteId === universe.id && <div className="delete-confirm"><p>{t("Delete this universe, its timeline history, and its saved reflections?")}</p>
            <Button variant="outline" disabled={busy} onClick={() => remove(universe.id)}>{t("Delete universe")}</Button>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>{t("Cancel")}</Button></div>}
        </article>)}</div> : <div className="panel empty"><Layers /><h2>{t("No saved universes yet")}</h2><Button onClick={() => start()}>{t("Start a journey")}</Button></div>}
    </section>; break;
    default:
      if (!game || !scenario) {
        content = <section className="panel empty"><h1>{t("Choose a story to begin")}</h1><Button onClick={() => start()}>{t("Create an avatar")}</Button></section>;
        break;
      }
      switch (view) {
        case "story": content = <Story game={game} scenario={scenario} open={open}
          start={(id) => { void mutation("/branches", "POST", { path_id: id }, "story"); }}
          choose={(id, index) => { void mutation(`${branchPath}/choices`, "POST", { choice_id: id, scene_index: index }, "story"); }}
          send={(npc, text) => mutation(`${branchPath}/npcs/${npc}/messages`, "POST", {
            text, locale, scene_index: game.branches.find((item) => item.id === game.active_id)?.scene?.index,
          })}
          narrate={() => { void mutation(`${branchPath}/scene`, "POST", { locale }); }} />; break;
        case "map": content = <TimelineScreen ask={askSelf} game={game} scenario={scenario}
          start={(id) => { void mutation("/branches", "POST", { path_id: id }, "story"); }}
          activate={(id) => { void mutation(`/branches/${id}/active`, "PUT", undefined, "story"); }}
          fork={(id, checkpoint) => { void mutation("/branches", "POST", { parent_id: id, checkpoint }, "story"); }} />; break;
        case "compare": content = <Compare ask={askSelf} game={game} open={open} />; break;
        case "lab": content = <DecisionLab key={game.id} game={game} scenario={scenario} open={open}
          save={(value) => { void mutation("/reflection", "PUT", value); }} />; break;
        case "bridge": content = <RealityBridge key={game.id} game={game} scenario={scenario} open={open}
          save={(value) => mutation("/experiment", "PUT", value)} />; break;
      }
  }
  const journey = game && ["story", "map", "compare", "lab", "bridge"].includes(view);
  const key = `${view}:${game?.active_id ?? ""}:${game?.branches.find((item) => item.id === game.active_id)?.events.length ?? ""}`;
  return <>
    <header className="topbar"><div className="frame topbar-inner">
      <Button variant="ghost" className="wordmark" disabled={busy} onClick={() => open("home")}><span aria-hidden="true">◈</span> Parallel Life</Button>
      <nav aria-label={t("Main navigation")}>
        <div className="language-switch" role="group" aria-label={t("Language")}>{locales.map((next) =>
          <a key={next} href={`/${next}`} lang={next} hrefLang={next} title={languageNames[next]} aria-label={languageNames[next]}
            aria-current={locale === next ? "true" : undefined} onClick={(event) => {
              if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              switchLocale(next);
            }}>{languageCodes[next]}</a>)}</div>
        {game && view !== "story" && <Button variant="ghost" disabled={busy} onClick={() => open("story")}>{t("Resume")}</Button>}
        {profile && view === "home" && <Button variant="ghost" disabled={busy} onClick={() => open("scenarios")}>{t("New story")}</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => open("universes")}><Layers size={16} /> {t("My Universes")}</Button>
      </nav>
    </div></header>
    <main className={`frame main ${view === "home" ? "home" : ""}`}>
      {view === "onboarding" && <Button variant="ghost" className="back" onClick={() => open("home")}><ArrowLeft size={15} /> {t("Home")}</Button>}
      {journey && <JourneyNav game={game} view={view} open={open} />}
      {error && <p className="error" role="alert">{story(error)}</p>}
      {view === "story" && game?.ai_notice && <p className="busy" role="status">{story(game.ai_notice)}</p>}
      {busy && <p className="busy" role="status">{t("Working…")}</p>}
      <AnimatePresence mode="wait" initial={false}><motion.div key={key}
        initial={reduceMotion ? false : { opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }}>
        {content}
      </motion.div></AnimatePresence>
    </main>
    <footer className="frame footer"><strong>Parallel Life</strong><p>{t("Parallel Life is a fictional exploration tool, not a prediction of your future or a substitute for professional advice.")}</p></footer>
  </>;
}
