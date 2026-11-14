"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, BookOpen, BriefcaseBusiness, GraduationCap, Heart, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { crossroads } from "@/lib/crossroads";

type Story = typeof crossroads[number];
type StoryId = Story["id"];
type Journey = { branch?: string; ending?: string; seen: string[] };
type Save = { active: StoryId | null; journeys: Partial<Record<StoryId, Journey>> };
type Outcome = { branch: Story["branches"][number]; ending: Story["branches"][number]["endings"][number] };

const key = "parallel-life-crossroads-kk-v1";
const fresh: Save = { active: null, journeys: {} };
const icons = { career: BriefcaseBusiness, education: GraduationCap, relationships: Heart };

function outcomes(story: Story): Outcome[] {
  return story.branches.flatMap((branch) => branch.endings.map((ending) => ({ branch, ending })));
}

function readSave(): Save {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "null");
    if (!raw || typeof raw !== "object") return fresh;
    const journeys: Save["journeys"] = {};
    for (const story of crossroads) {
      const saved = raw.journeys?.[story.id];
      if (!saved || typeof saved !== "object") continue;
      const valid = outcomes(story);
      const branch = story.branches.find((item) => item.id === saved.branch);
      const ending = branch?.endings.find((item) => item.id === saved.ending)?.id;
      const seen = valid.filter(({ ending }) => Array.isArray(saved.seen) && saved.seen.includes(ending.id))
        .map(({ ending }) => ending.id);
      if (ending && !seen.includes(ending)) seen.push(ending);
      journeys[story.id] = { branch: branch?.id, ending, seen };
    }
    return { active: crossroads.find((story) => story.id === raw.active)?.id ?? null, journeys };
  } catch {
    return fresh;
  }
}

function Decisions({ outcome }: { outcome: Outcome }) {
  return <div className="crossroads-decisions">
    <h3>Сенің шешімдерің</h3>
    <ol><li>{outcome.branch.choice}</li><li>{outcome.ending.choice}</li></ol>
  </div>;
}

function EndingText({ outcome }: { outcome: Outcome }) {
  return <>
    <p className="eyebrow">{outcome.ending.time}</p>
    <h2>{outcome.ending.title}</h2>
    <div className="crossroads-prose">{outcome.ending.text.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
    <Decisions outcome={outcome} />
  </>;
}

export function CrossroadsGame() {
  const [save, setSave] = useState<Save>(fresh);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const shouldFocus = useRef(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => { setSave(readSave()); }, []);

  const story = crossroads.find((item) => item.id === save.active);
  const journey = story ? save.journeys[story.id] : undefined;
  const branch = story?.branches.find((item) => item.id === journey?.branch);
  const ending = branch?.endings.find((item) => item.id === journey?.ending);
  const current = branch && ending ? { branch, ending } : null;
  const alternatives = story && current ? outcomes(story).filter(({ ending }) =>
    ending.id !== current.ending.id && journey?.seen.includes(ending.id)) : [];
  const other = alternatives.find(({ ending }) => ending.id === otherId) ?? alternatives[0];
  const screen = comparing && current ? "compare" : ending ? ending.id : branch ? branch.id : story ? "intro" : "home";

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen, save.active]);

  function update(next: Save) {
    shouldFocus.current = true;
    setComparing(false);
    setOtherId(null);
    setSave(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  function setJourney(id: StoryId, next: Journey) {
    update({ active: id, journeys: { ...save.journeys, [id]: next } });
  }

  function open(id: StoryId) {
    const previous = save.journeys[id];
    setJourney(id, previous ?? { seen: [] });
  }

  function goHome() {
    update({ ...save, active: null });
  }

  function showComparison() {
    shouldFocus.current = true;
    setComparing(true);
  }

  return <div className="crossroads">
    <header className="topbar"><div className="frame topbar-inner">
      <Button variant="ghost" className="wordmark" onClick={goHome}><span aria-hidden="true">◈</span> Parallel Life</Button>
      <nav aria-label="Негізгі мәзір"><a className="button button-ghost" href="/universes/"><Layers size={16} /> Кеңейтілген ойын</a></nav>
    </div></header>
    <main className={`frame main ${story ? "" : "home"}`}>
      {storageError && <p className="error" role="status">Браузер ойынды сақтай алмады. Осы бет ашық тұрғанда ойынды жалғастыра аласың.</p>}
      {!story ? <>
        <section className="hero"><div className="hero-image" /><div className="hero-content">
          <p className="eyebrow"><span /> Интерактивті көркем оқиғалар</p>
          <h1 ref={heading} tabIndex={-1}>Басқа жолды<br /><em>таңдасаң ше?</em></h1>
          <p>Өзіңе жақын оқиғаны таңда. Екі шешім қабылдап, сол жолдың қалай аяқталатынын көр.</p>
          <a className="button button-default" href="#stories">Оқиға таңдау <ArrowRight size={17} /></a>
        </div></section>
        <section className="catalog" id="stories"><div className="section-heading"><h2>Қай оқиғаны бастайсың?</h2></div>
          <div className="scenario-grid">{crossroads.map((item) => {
            const Icon = icons[item.id];
            const progress = save.journeys[item.id];
            const action = progress?.ending ? "Финалды ашу" : progress ? "Жалғастыру" : "Бастау";
            return <button key={item.id} className={`scenario-card ${item.id}`} type="button" onClick={() => open(item.id)}>
              <div className={`scene-art art-${item.id}`} aria-hidden="true" />
              <div className="scenario-top"><span className="scenario-icon"><Icon size={20} /></span><span className="crossroads-card-action">{action} <ArrowRight size={15} /></span></div>
              <div><p className="crossroads-category">{item.category}</p><h3>{item.title}</h3><p>{item.teaser}</p></div>
            </button>;
          })}</div>
        </section>
      </> : <motion.section key={`${story.id}:${screen}`} className={comparing ? "crossroads-comparison" : "crossroads-story"}
        initial={reduceMotion ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.16 }}>
        <Button variant="ghost" className="crossroads-back" onClick={comparing ? () => {
          shouldFocus.current = true;
          setComparing(false);
        } : goHome}><ArrowLeft size={16} /> {comparing ? "Финалға оралу" : "Оқиғалар"}</Button>
        {comparing && current ? <>
          <div className="page-heading"><p className="eyebrow">{story.title}</p><h1 ref={heading} tabIndex={-1}>Екі жолды салыстыру</h1></div>
          {other ? <>
            {alternatives.length > 1 && <label className="crossroads-select">Салыстыратын финал
              <select value={other.ending.id} onChange={(event) => setOtherId(event.target.value)}>
                {alternatives.map(({ ending }) => <option key={ending.id} value={ending.id}>{ending.title}</option>)}
              </select>
            </label>}
            <div className="compare-grid"><article className="panel outcome"><EndingText outcome={current} /></article>
              <article className="panel outcome"><EndingText outcome={other} /></article></div>
          </> : <div className="panel empty"><p>Салыстыру үшін тағы бір финалға жет.</p>
            <Button onClick={() => setJourney(story.id, { seen: journey?.seen ?? [] })}>Басқа таңдау жасап көру</Button></div>}
        </> : <article className="panel crossroads-page">
          <div className={`scene-art scene-cover art-${story.id}`} aria-hidden="true" />
          <div className="chapter"><span>{story.category}</span><span>{current ? "Финал" : branch ? "Екінші таңдау" : "Бірінші таңдау"}</span></div>
          <p className="eyebrow">{ending?.time ?? branch?.time ?? story.time}</p>
          <h1 ref={heading} tabIndex={-1}>{ending?.title ?? branch?.title ?? story.title}</h1>
          <div className="crossroads-prose">{(ending?.text ?? branch?.text ?? story.intro).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
          {current ? <>
            <Decisions outcome={current} />
            <div className="actions crossroads-actions">
              <Button onClick={() => setJourney(story.id, { seen: journey?.seen ?? [] })}>Басқа таңдау жасап көру</Button>
              <Button variant="outline" onClick={goHome}>Басқа бағытқа өту</Button>
              <Button variant="ghost" onClick={showComparison}><BookOpen size={16} /> Басқа жолды салыстыру</Button>
            </div>
          </> : <div className="choice-list crossroads-choices">
            {(branch ? branch.endings : story.branches).map((option) =>
              <Button key={option.id} variant="outline" className="choice" onClick={() => {
                const seen = journey?.seen ?? [];
                setJourney(story.id, branch
                  ? { branch: branch.id, ending: option.id, seen: seen.includes(option.id) ? seen : [...seen, option.id] }
                  : { branch: option.id, seen });
              }}>{option.choice}<ArrowRight size={17} /></Button>)}
          </div>}
        </article>}
      </motion.section>}
    </main>
    <footer className="frame footer"><strong>Parallel Life</strong><p>Оқиғалар көркем шығарма ретінде жазылған.</p></footer>
  </div>;
}
