"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowDownRight, ArrowLeft, ArrowRight, BookOpen, BriefcaseBusiness, CircleCheck,
  Compass, GitFork, GraduationCap, Heart, Layers, MapPin, MessageCircle, Sparkles, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LifeMap } from "@/components/life-map";
import {
  activeKey, ApiError, api, avatars, categories, perform, useGame,
  type Branch, type Category, type Ending, type Game, type Profile, type Scenario, type Universe, type View,
} from "@/lib/game";

const categoryInfo = {
  career: { title: "Career & Business", detail: "Ambition, independence, and the cost of starting over.", icon: BriefcaseBusiness, age: 29 },
  education: { title: "Education & Growth", detail: "Three ways to learn, each asking something different of you.", icon: GraduationCap, age: 27 },
  relationships: { title: "Relationships", detail: "Explore what it takes to make room for two different futures.", icon: Heart, age: 30 },
};
const metrics: Record<string, string> = {
  career: "Career", finances: "Finances", freedom: "Freedom", knowledge: "Knowledge",
  wellbeing: "Well-being", social: "Connections",
};
const avatarGlyph = { dawn: "☀", orbit: "◉", night: "☾", ember: "✦" };
const disclaimer = "Parallel Life is a fictional exploration tool, not a prediction of your future or a substitute for professional advice.";

function SceneArt({ category, className = "" }: { category: Category; className?: string }) {
  return <div className={`scene-art art-${category} ${className}`} aria-hidden="true" />;
}

function StartHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return <div className="page-heading"><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children}</div>;
}

function ScenarioCards({ select }: { select: (category: Category) => void }) {
  return <div className="scenario-grid">{categories.map((id) => {
    const { title, detail, icon: Icon } = categoryInfo[id];
    return <button type="button" key={id} className={`scenario-card ${id}`} onClick={() => select(id)}>
      <SceneArt category={id} />
      <div className="scenario-top"><span className="scenario-icon"><Icon size={21} /></span><ArrowDownRight size={20} /></div>
      <div><h3>{title}</h3><p>{detail}</p></div>
    </button>;
  })}</div>;
}

function Home({ start }: { start: (category?: Category) => void }) {
  return <>
    <section className="hero">
      <div className="hero-image" />
      <div className="hero-content">
        <p className="eyebrow"><span /> Interactive fiction</p>
        <h1>One life.<br /><em>Infinite possibilities.</em></h1>
        <p>Step into the lives that could follow one decision. Play each path, meet the people in it, and see what matters to you.</p>
        <Button onClick={() => start()}>Start Your Journey <ArrowRight size={17} /></Button>
      </div>
    </section>
    <section className="catalog"><div className="section-heading"><h2>Choose a crossroads</h2><span>Three playable stories</span></div>
      <ScenarioCards select={start} />
    </section>
  </>;
}

function Onboarding({ category, onSave }: { category: Category; onSave: (profile: Omit<Profile, "id">) => void }) {
  const [avatar, setAvatar] = useState<Profile["avatar"]>("dawn");
  const busy = useGame((state) => state.busy);
  function quickStart() {
    onSave({ name: "Avery", age: categoryInfo[category].age, avatar: "orbit",
      situation: "At a turning point", goal: "Explore the trade-offs before deciding", category,
      traits: "", values: "", background: "" });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const field = (key: string) => String(data.get(key) ?? "").trim();
    onSave({ name: field("name"), age: Number(field("age")), avatar, situation: field("situation"),
      goal: field("goal"), category: field("category") as Category, traits: field("traits"),
      values: field("values"), background: field("background") });
  }
  return <section className="narrow">
    <StartHeader eyebrow="Your avatar" title="Who will you play?"><p>Use a fictional profile or a name and details you’re comfortable sharing.</p></StartHeader>
    <form className="panel form-grid" onSubmit={submit}>
      <fieldset><legend>Avatar</legend><div className="avatar-row">{avatars.map((item) =>
        <button key={item} type="button" className={`avatar ${item}`} aria-pressed={item === avatar}
          aria-label={item} onClick={() => setAvatar(item)}>{avatarGlyph[item]}</button>)}</div></fieldset>
      <div className="form-row">
        <label>Display name<input name="name" maxLength={120} required /></label>
        <label>Age<input name="age" type="number" min={18} max={120} defaultValue={categoryInfo[category].age} required /></label>
      </div>
      <label>Current work or study situation<input name="situation" maxLength={120} required /></label>
      <label>Main personal goal<input name="goal" maxLength={120} required /></label>
      <label>Preferred story<select name="category" defaultValue={category}>{categories.map((id) =>
        <option value={id} key={id}>{categoryInfo[id].title}</option>)}</select></label>
      <details><summary>Optional character details</summary>
        <div className="form-grid optional-fields">
          <label>Personality traits<input name="traits" maxLength={180} /></label>
          <label>Values<input name="values" maxLength={180} /></label>
          <label>Fictional background<textarea name="background" maxLength={300} rows={2} /></label>
        </div>
      </details>
      <div className="actions"><Button type="submit" disabled={busy}>Save avatar <ArrowRight size={16} /></Button>
        <Button variant="outline" disabled={busy} onClick={quickStart}>Quick Start</Button></div>
    </form>
  </section>;
}

function JourneyNav({ game, view, open }: { game: Game; view: View; open: (view: View) => void }) {
  const links: { label: string; view: View; icon: typeof BookOpen; enabled: boolean }[] = [
    { label: "Story", view: "story", icon: BookOpen, enabled: true },
    { label: "Life Map", view: "map", icon: GitFork, enabled: true },
    { label: "Compare", view: "compare", icon: Layers, enabled: game.endings.length > 0 },
    { label: "Decision Lab", view: "lab", icon: Compass, enabled: game.endings.length > 0 },
    { label: "Reality Bridge", view: "bridge", icon: CircleCheck, enabled: !!game.passport },
  ];
  return <nav aria-label="Current journey" className="journey-nav">{links.map(({ label, view: target, icon: Icon, enabled }) =>
    <Button key={target} variant="ghost" aria-current={view === target ? "page" : undefined} disabled={!enabled}
      onClick={() => open(target)}><Icon size={16} /> {label}</Button>)}</nav>;
}

function PathButtons({ scenario, start, explored = [] }: { scenario: Scenario; start: (id: string) => void; explored?: string[] }) {
  const busy = useGame((state) => state.busy);
  return <div className="choice-list">{scenario.paths.map((path) =>
    <Button key={path.id} variant="outline" className="choice" disabled={busy} onClick={() => start(path.id)}>
      <span><strong>{path.title}</strong><small>{path.description}</small></span>
      {explored.includes(path.id) ? <span className="small-label">Explored</span> : <ArrowRight size={17} />}
    </Button>)}</div>;
}

function Chat({ game, branch, scenario, send }: {
  game: Game; branch: Branch; scenario: Scenario; send: (npc: string, message: string) => Promise<boolean>;
}) {
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
    if (!text.trim()) return;
    setSending(true);
    try {
      if (await send(npc.id, text.trim())) setText("");
    } finally {
      setSending(false);
    }
  }
  return <aside className="panel chat">
    <h2><MessageCircle size={18} /> Characters in this scene</h2>
    <div className="npc-list">{available.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item.id)}
      aria-pressed={npc.id === item.id} disabled={sending}><span className={`npc-avatar portrait-${item.id}`} aria-hidden="true">{item.avatar}</span><span>{item.name}</span></button>)}</div>
    <p className="npc-role">{npc.role} · {npc.mood}</p>
    <details className="npc-bio"><summary>About {npc.name}</summary><p>{npc.background}</p><p>{npc.goal}</p></details>
    <p className="small-label">{ai ? "AI conversation available" : "Scripted demo conversation"} · Trust {state?.trust ?? 50}</p>
    {ai && <p className="npc-role">Messages may be sent to the AI provider to write the character’s reply.</p>}
    <div className="messages" role="log" aria-live="polite" aria-label="Conversation" tabIndex={0}
      ref={(node) => { if (node) node.scrollTop = node.scrollHeight; }}>
      {messages.length ? messages.map((message, i) => <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        key={i} className={`message ${message.role}`}><small>{message.role === "player" ? game.profile.name : `${npc.name}${message.mode === "scripted" ? " · Scripted" : ""}`}</small><p>{message.text}</p></motion.div>)
        : <p className="muted">Ask about their goals or something that happened in this timeline.</p>}
    </div>
    <form className="chat-form" onSubmit={submit}>
      <label className="sr-only" htmlFor="chat-text">Message {npc.name}</label>
      <textarea id="chat-text" rows={2} maxLength={600} value={text} disabled={limited} onChange={(event) => setText(event.target.value)}
        placeholder={limited ? "Conversation limit reached" : `Talk to ${npc.name.split(" ")[0]}…`} />
      <Button type="submit" disabled={busy || limited || !text.trim()}>{sending ? "Waiting for reply…" : "Send"} <ArrowRight size={15} /></Button>
    </form>
  </aside>;
}

function Outcome({ ending, expanded = false }: { ending: Ending; expanded?: boolean }) {
  return <article className="panel outcome"><p className="eyebrow">{ending.path}</p><h2>{ending.title}</h2><p>{ending.body}</p>
    {ending.aftermath && <p className="last-event">{ending.aftermath}</p>}
    <dl className="tradeoffs"><div><dt>What you gained</dt><dd>{ending.gain}</dd></div><div><dt>What it cost</dt><dd>{ending.cost}</dd></div></dl>
    <details open={expanded}><summary>Choices and consequences</summary><ol>{ending.events.map((event, index) =>
      <li key={index}><strong>{event.choice}</strong><p>{event.outcome}</p></li>)}</ol></details>
  </article>;
}

function WorldState({ branch }: { branch: Branch }) {
  return <details className="world"><summary>Fictional world state</summary><div className="metric-grid">
    {Object.entries(branch.world).map(([key, value]) => <div key={key}>
      <span>{metrics[key]} <strong>{value}</strong></span><meter min={0} max={100} value={value} aria-label={metrics[key]} />
    </div>)}</div></details>;
}

function Story({ game, scenario, start, choose, send, open, narrate }: {
  game: Game; scenario: Scenario; start: (id: string) => void; choose: (id: string, index: number) => void;
  send: (npc: string, text: string) => Promise<boolean>; open: (view: View) => void; narrate: () => void;
}) {
  const { busy, ai } = useGame();
  const branch = game.branches.find((item) => item.id === game.active_id);
  const scene = branch?.scene;
  const ending = game.endings.find((item) => item.id === branch?.id);
  if (ending) return <section className="story-page">
    <StartHeader eyebrow="Year 3 · Timeline complete" title="One possible life" />
    <Outcome ending={ending} />
    <div className="actions"><Button onClick={() => open("compare")}>Compare timelines</Button>
      <Button variant="outline" onClick={() => open("map")}>Explore another life <GitFork size={16} /></Button>
      <Button variant="ghost" onClick={() => open("lab")}>Open Decision Lab</Button></div>
  </section>;
  if (!branch || !scene) return <section className="story-page">
    <StartHeader eyebrow={scenario.setting} title={scenario.title}><p>{scenario.intro}</p></StartHeader>
    <p className="avatar-context"><span aria-hidden="true">{avatarGlyph[game.profile.avatar]} </span>Playing as {game.profile.name}, {game.profile.age} · Goal: {game.profile.goal}</p>
    <p className="small-label mb-2">The crossroads</p>
    <PathButtons scenario={scenario} start={start} />
  </section>;
  const path = scenario.paths.find((item) => item.id === branch.path_id);
  return <section className="story-layout">
    <div className="panel scene">
      <SceneArt category={scenario.id} className="scene-cover" />
      <div className="chapter"><span>Scene {scene.index + 1} of {scene.count}</span><span>{scene.when}</span></div>
      <div className="chapter-progress"><span style={{ width: `${(scene.index + 1) / scene.count * 100}%` }} /></div>
      <p className="eyebrow"><MapPin size={14} /> {scene.location}</p>
      <h1>{scene.title}</h1><p className="scene-body">{scene.body}</p>
      {scene.last_event && <p className="last-event">{scene.last_event}</p>}
      {scene.dialogue && <blockquote>{scene.dialogue}</blockquote>}
      {ai && !scene.personalized && <Button variant="ghost" disabled={busy} onClick={narrate}><Sparkles size={15} /> Personalize scene</Button>}
      <div className="choice-list">{scene.choices.map((option) => <Button key={option.id} className="choice" variant="outline"
        disabled={busy} onClick={() => choose(option.id, scene.index)}><span><strong>{option.label}</strong>
          <small>{option.focus.map((key) => metrics[key] ?? "Character trust").filter((item, i, all) => all.indexOf(item) === i).join(" · ")}</small>
        </span><ArrowRight size={17} /></Button>)}</div>
      <WorldState branch={branch} />
      <p className="small-label">{path?.title}</p>
    </div>
    <Chat key={`${branch.id}:${scene.index}`} branch={branch} scenario={scenario} game={game} send={send} />
  </section>;
}

function TimelineScreen({ game, scenario, start, activate, fork }: {
  game: Game; scenario: Scenario; start: (id: string) => void; activate: (id: string) => void;
  fork: (id: string, checkpoint: number) => void;
}) {
  const busy = useGame((state) => state.busy);
  return <section><StartHeader eyebrow={scenario.title} title="Life Map"><p>Start another path or return to a saved decision to create a separate timeline.</p></StartHeader>
    <LifeMap game={game} scenario={scenario} onSelect={activate} onFork={fork} />
    <div className="map-details"><div><h2>Start from the crossroads</h2>
      <PathButtons scenario={scenario} start={start} explored={game.branches.map((branch) => branch.path_id)} /></div>
      <div><h2>Saved timelines</h2>
        {game.branches.length === 0 && <p className="muted">Your first timeline appears after you choose a path.</p>}
        {game.branches.map((branch, i) => <article key={branch.id} className="panel timeline-item">
          <h3>{scenario.paths.find((path) => path.id === branch.path_id)?.short} · Timeline {i + 1}</h3>
          <p className="muted">{branch.ending === null ? `In progress · ${branch.events.length} decisions` : "Finished"}</p>
          <Button variant="outline" disabled={busy} onClick={() => activate(branch.id)}>Open timeline</Button>
          {branch.events.length > 0 && <details><summary>Branch from a saved decision</summary><ol>
            {branch.events.map((event, index) => <li key={index}><Button variant="ghost" disabled={busy} onClick={() => fork(branch.id, index)}>
              <GitFork size={14} /> {event.scene}</Button></li>)}</ol></details>}
        </article>)}
      </div>
    </div>
  </section>;
}

function Compare({ game, open }: { game: Game; open: (view: View) => void }) {
  const [left, setLeft] = useState(game.endings[0]?.id);
  const [right, setRight] = useState(game.endings[1]?.id ?? "");
  const a = game.endings.find((ending) => ending.id === left) ?? game.endings[0];
  const b = game.endings.find((ending) => ending.id === right && ending.id !== a?.id);
  return <section><StartHeader eyebrow="Alternative lives" title="Compare timelines"><p>See the choices, benefits, and trade-offs you experienced in each life.</p></StartHeader>
    <div className="compare-grid">
      <div>{a && <><label>First timeline<select value={a.id} onChange={(event) => {
        setLeft(event.target.value);
        if (event.target.value === right) setRight(a.id);
      }}>{game.endings.map((end, i) => <option value={end.id} key={end.id}>{i + 1}. {end.path} · {end.title}</option>)}</select></label>
        <Outcome ending={a} expanded /></>}</div>
      <div>{game.endings.length > 1 && <label>Second timeline<select value={b?.id ?? ""} onChange={(event) => setRight(event.target.value)}>
        <option value="">Choose another timeline</option>{game.endings.filter((end) => end.id !== a?.id).map((end) =>
          <option value={end.id} key={end.id}>{end.path} · {end.title}</option>)}</select></label>}
        {b ? <Outcome ending={b} expanded /> : <div className="panel empty"><GitFork /><h2>{game.endings.length < 2 ? "Explore a second path" : "Select an ending"}</h2>
          {game.endings.length < 2 && <Button variant="outline" onClick={() => open("map")}>Open Life Map</Button>}</div>}</div>
    </div><div className="actions"><Button onClick={() => open("lab")}>Reflect in Decision Lab <ArrowRight size={16} /></Button></div>
  </section>;
}

function DecisionLab({ game, scenario, save, open }: {
  game: Game; scenario: Scenario; save: (values: { priorities: string[]; uncertainty: string; next_step: string }) => void;
  open: (view: View) => void;
}) {
  const busy = useGame((state) => state.busy);
  const [priorities, setPriorities] = useState(game.passport?.priorities ?? []);
  const [uncertainty, setUncertainty] = useState(game.passport?.uncertainty ?? "");
  const [step, setStep] = useState(game.passport?.next_step ?? "");
  const passport = game.passport;
  function download() {
    if (!passport) return;
    const text = ["Parallel Life · Decision Passport", scenario.subtitle, passport.dilemma || scenario.intro,
      `Priorities: ${passport.priorities.join(", ")}`, ...passport.timelines.map((timeline) =>
        `${timeline.path} — ${timeline.title}\nGain: ${timeline.gain}\nTrade-off: ${timeline.cost}\n${timeline.events.map((event) => `• ${event.choice} — ${event.outcome}`).join("\n")}`),
      `Still uncertain: ${passport.uncertainty || scenario.question}`, `Question: ${scenario.question}`,
      ...(passport.questions ?? []).map((question) => `Question: ${question}`),
      `Optional experiment: ${passport.experiment_title || scenario.experiment.title}`,
      `Next step: ${passport.next_step || scenario.experiment.steps[0]}`].join("\n\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "decision-passport.txt"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="lab-layout">
    <div><StartHeader eyebrow={scenario.title} title="Decision Lab"><p>{scenario.intro}</p></StartHeader>
      <div className="reflection-outcomes">{game.endings.map((end) => <Outcome key={end.id} ending={end} expanded />)}</div></div>
    <form className="panel form-grid" onSubmit={(event) => { event.preventDefault(); save({ priorities, uncertainty, next_step: step }); }}>
      <h2>Decision Passport</h2>
      <fieldset><legend>What mattered most to you in this story?</legend><div className="priority-list">{scenario.priorities.map((item) =>
        <label key={item}><input type="checkbox" checked={priorities.includes(item)} onChange={(event) =>
          setPriorities(event.target.checked ? [...priorities, item] : priorities.filter((entry) => entry !== item))} /> {item}</label>)}</div></fieldset>
      <div className="reflection-questions"><h3>Questions to take with you</h3>
        <ul>{[scenario.question, ...scenario.questions].map((question) => <li key={question}>{question}</li>)}</ul></div>
      <label>What’s still uncertain?<textarea rows={2} maxLength={500} value={uncertainty} onChange={(event) => setUncertainty(event.target.value)} /></label>
      <label>One practical next step<textarea rows={2} maxLength={500} value={step} onChange={(event) => setStep(event.target.value)}
        placeholder={scenario.experiment.steps[0]} /></label>
      <div className="actions"><Button type="submit" disabled={!priorities.length || busy}>Save Passport</Button>
        {passport && <Button variant="outline" onClick={download}>Download</Button>}</div>
      {passport && <><p className="saved" role="status">Passport saved for {passport.timelines.length} explored {passport.timelines.length === 1 ? "timeline" : "timelines"}.</p>
        <div className="passport-experiment"><small>Optional experiment</small><strong>{scenario.experiment.title}</strong><p>{scenario.experiment.description}</p></div>
        <Button variant="outline" onClick={() => open("bridge")}>Continue to Reality Bridge <ArrowRight size={16} /></Button></>}
    </form>
  </section>;
}

function RealityBridge({ game, scenario, save }: {
  game: Game; scenario: Scenario; save: (progress: Game["experiment"]) => void;
}) {
  const { busy } = useGame();
  const { experiment } = scenario;
  const progress = game.experiment;
  return <section className="narrow"><StartHeader eyebrow="Reality Bridge" title={experiment.title}><p>{experiment.description}</p></StartHeader>
    <div className="panel form-grid">
      {game.passport?.next_step && <p className="last-event">{game.passport.next_step}</p>}
      <p className="small-label">{progress.checked.length} of {experiment.steps.length} steps checked</p>
      <progress value={progress.checked.length} max={experiment.steps.length} aria-label="Checklist progress" />
      <div className="checklist">{experiment.steps.map((step, index) => <label key={step}><input type="checkbox" disabled={busy}
        checked={progress.checked.includes(index)} onChange={(event) => save({ status: "active",
          checked: event.target.checked ? [...progress.checked, index] : progress.checked.filter((item) => item !== index) })} />{step}</label>)}</div>
      <div className="actions"><Button disabled={busy || progress.status === "completed"} onClick={() => save({ ...progress, status: "completed" })}>Mark complete</Button>
        <Button variant="outline" disabled={busy || progress.status === "skipped"} onClick={() => save({ ...progress, status: "skipped" })}>Skip experiment</Button></div>
      {progress.status !== "active" && <p className="saved" role="status">{progress.status === "completed" ? "Experiment completed." : "Experiment skipped."}</p>}
    </div>
  </section>;
}

export function ParallelLife() {
  const { view, game, profile, catalog, busy, error, setView, update } = useGame();
  const reduceMotion = useReducedMotion();
  const [preferred, setPreferred] = useState<Category>("career");
  const [universes, setUniverses] = useState<Universe[] | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const scenario = catalog.find((item) => item.id === game?.scenario_id);

  async function loadCatalog() {
    if (useGame.getState().catalog.length) return;
    const [items, status] = await Promise.all([api<Scenario[]>("/scenarios"), api<{ ai: boolean }>("/status")]);
    useGame.setState({ catalog: items, ai: status.ai });
  }

  useEffect(() => {
    const id = localStorage.getItem(activeKey);
    void perform(async () => {
      const profiles = await api<Profile[]>("/profiles");
      if (profiles.length) useGame.setState({ profile: profiles.at(-1) });
      if (!id) return;
      await loadCatalog();
      try {
        update(await api<Game>(`/sessions/${id}`));
        setView("story");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) localStorage.removeItem(activeKey);
        throw error;
      }
    });
  }, [setView, update]);

  function open(next: View) {
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
      useGame.setState({ profile: await api<Profile>("/profiles", "POST", value) });
      open("scenarios");
    });
  }

  function startSession(category: Category) {
    if (!profile) return start(category);
    void perform(async () => {
      update(await api<Game>("/sessions", "POST", { profile_id: profile.id, scenario_id: category }));
      open("story");
    });
  }

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
    void perform(async () => { await loadCatalog(); update(await api<Game>(`/sessions/${id}`)); open("story"); });
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
    case "home": content = <Home start={start} />; break;
    case "onboarding": content = <Onboarding key={preferred} category={preferred} onSave={saveProfile} />; break;
    case "scenarios": content = <section className="catalog-page">
      <StartHeader eyebrow="Your next decision" title="Choose a crossroads"><p>Playing as {profile?.name}. Choose the story you want to explore first.</p></StartHeader>
      <ScenarioCards select={startSession} /></section>; break;
    case "universes": content = <section><StartHeader eyebrow="Saved stories" title="My Universes"><p>Resume a saved story in this browser.</p></StartHeader>
      {universes === null ? <div className="panel empty"><p>{busy ? "Loading your universes…" : "Couldn’t load your universes."}</p>
        {!busy && <Button variant="outline" onClick={() => open("universes")}>Try again</Button>}</div> : universes.length ? <div className="universe-list">{universes.map((universe) =>
        <article className="panel universe" key={universe.id}><div><h2>{categoryInfo[universe.scenario_id].title}</h2>
          <p>{universe.profile.name} · {universe.branches} timelines · {universe.completed} finished</p></div>
          <div className="actions"><Button disabled={busy} onClick={() => resume(universe.id)}>Resume</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setDeleteId(universe.id)} aria-label={`Delete ${categoryInfo[universe.scenario_id].title} universe`}><Trash2 size={17} /></Button></div>
          {deleteId === universe.id && <div className="delete-confirm"><p>Delete this universe, its timeline history, and its saved reflections?</p>
            <Button variant="outline" disabled={busy} onClick={() => remove(universe.id)}>Delete universe</Button>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button></div>}
        </article>)}</div> : <div className="panel empty"><Layers /><h2>No saved universes yet</h2><Button onClick={() => start()}>Start a journey</Button></div>}
    </section>; break;
    default:
      if (!game || !scenario) {
        content = <section className="panel empty"><h1>Choose a story to begin</h1><Button onClick={() => start()}>Create an avatar</Button></section>;
        break;
      }
      switch (view) {
        case "story": content = <Story game={game} scenario={scenario} open={open}
          start={(id) => { void mutation("/branches", "POST", { path_id: id }); }}
          choose={(id, index) => { void mutation(`${branchPath}/choices`, "POST", { choice_id: id, scene_index: index }); }}
          send={(npc, text) => mutation(`${branchPath}/npcs/${npc}/messages`, "POST", {
            text, scene_index: game.branches.find((item) => item.id === game.active_id)?.scene?.index,
          })}
          narrate={() => { void mutation(`${branchPath}/scene`); }} />; break;
        case "map": content = <TimelineScreen game={game} scenario={scenario}
          start={(id) => { void mutation("/branches", "POST", { path_id: id }, "story"); }}
          activate={(id) => { void mutation(`/branches/${id}/active`, "PUT", undefined, "story"); }}
          fork={(id, checkpoint) => { void mutation("/branches", "POST", { parent_id: id, checkpoint }, "story"); }} />; break;
        case "compare": content = <Compare game={game} open={open} />; break;
        case "lab": content = <DecisionLab key={game.id} game={game} scenario={scenario} open={open}
          save={(value) => { void mutation("/reflection", "PUT", value); }} />; break;
        case "bridge": content = <RealityBridge game={game} scenario={scenario}
          save={(value) => { void mutation("/experiment", "PUT", value); }} />; break;
      }
  }
  const journey = game && ["story", "map", "compare", "lab", "bridge"].includes(view);
  const key = `${view}:${game?.active_id ?? ""}:${game?.branches.find((item) => item.id === game.active_id)?.events.length ?? ""}`;
  return <>
    <header className="topbar"><div className="frame topbar-inner">
      <Button variant="ghost" className="wordmark" disabled={busy} onClick={() => open("home")}><span aria-hidden="true">◈</span> Parallel Life</Button>
      <nav aria-label="Main navigation">
        {game && view !== "story" && <Button variant="ghost" disabled={busy} onClick={() => open("story")}>Resume</Button>}
        {profile && view === "home" && <Button variant="ghost" disabled={busy} onClick={() => open("scenarios")}>New story</Button>}
        <Button variant="ghost" disabled={busy} onClick={() => open("universes")}><Layers size={16} /> My Universes</Button>
      </nav>
    </div></header>
    <main className={`frame main ${view === "home" ? "home" : ""}`}>
      {view === "onboarding" && <Button variant="ghost" className="back" onClick={() => open("home")}><ArrowLeft size={15} /> Home</Button>}
      {journey && <JourneyNav game={game} view={view} open={open} />}
      {error && <p className="error" role="alert">{error}</p>}
      {busy && <p className="busy" role="status">Working…</p>}
      <AnimatePresence mode="wait" initial={false}><motion.div key={key}
        initial={reduceMotion ? false : { opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }}>
        {content}
      </motion.div></AnimatePresence>
    </main>
    <footer className="frame footer"><strong>Parallel Life</strong><p>{disclaimer}</p></footer>
  </>;
}
