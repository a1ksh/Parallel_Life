"use client";

import { useState } from "react";
import { useTranslation } from "@/i18n/provider";
import type { Ending, LifeDimension, LifePriorities } from "@/lib/game";

// A story metric selects an event for reflection. Different questions can use
// the same event, and the player's importance never changes its authored effects.
const dimensions = [
  ["skills", "Skills", "knowledge", "Knowledge", "What did you learn to do?"],
  ["health", "Health", "wellbeing", "Well-being", "What room did this choice leave for rest?"],
  ["relationships", "Relationships", "social", "Connections", "Who could you spend time with?"],
  ["work", "Work", "career", "Career", "Which responsibilities did you take on?"],
  ["fulfillment", "Fulfillment", "freedom", "Freedom", "Could you use your time for something meaningful to you?"],
  ["study", "Study", "knowledge", "Knowledge", "What opportunities did you have to study?"],
  ["happiness", "Happiness", "wellbeing", "Well-being", "Would you enjoy an ordinary day in this life?"],
] as const;

export function readLifePriorities(data?: FormData): LifePriorities {
  return Object.fromEntries(dimensions.map(([id]) => [id, Number(data?.get("importance-" + id) ?? 3)])) as LifePriorities;
}

export function PrioritySliders() {
  const { t } = useTranslation();
  const [levels, setLevels] = useState(() => readLifePriorities());
  return <fieldset className="life-priorities"><legend>{t("What matters in your daily life?")}</legend>
    <p>{t("Set importance from 1 (low) to 5 (high). Your top priorities appear first when you compare paths.")}</p>
    <div className="priority-sliders">{dimensions.map(([id, label]) => <label key={id}>
      <span>{t(label)} <output htmlFor={"importance-" + id}>{levels[id]} / 5</output></span>
      <input id={"importance-" + id} name={"importance-" + id} type="range" min={1} max={5} step={1} value={levels[id]}
        aria-valuetext={t("Importance {level} of 5", { level: levels[id] })}
        onChange={e => setLevels({ ...levels, [id]: Number(e.target.value) })} />
    </label>)}</div>
  </fieldset>;
}

export function PriorityComparison({ weights, endings }: { weights: LifePriorities; endings: Ending[] }) {
  const { t } = useTranslation();
  const ordered = [...dimensions].sort(([a], [b]) => weights[b] - weights[a]);
  const [picked, setPicked] = useState<LifeDimension>(ordered[0][0]);
  const [, , metric, metricLabel, question] = dimensions.find(([id]) => id === picked)!;
  return <section className="panel personal-context priority-evidence">
    <h2>{t("Your priorities across timelines")}</h2>
    <p>{t("Choose a priority to see the decision with the largest recorded change in its related story score. These fictional scores cannot predict your health or happiness.")}</p>
    <div className="priority-tabs">{ordered.map(([id, label]) =>
      <button type="button" key={id} aria-pressed={picked === id} onClick={() => setPicked(id)}>
        {t(label)} · {weights[id]}/5
      </button>)}</div>
    <div className="compare-grid">{endings.map((ending, i) => {
      const event = ending.events.filter(e => e.effects[metric]).sort((a, b) => Math.abs(b.effects[metric]) - Math.abs(a.effects[metric]))[0];
      return <div key={ending.id}><h3>{t("Timeline {number}", { number: i + 1 })} · {ending.path}</h3>
        {event ? <><strong>{event.choice}</strong><p>{event.outcome}</p>
          <small>{event.scene} · {t(metricLabel)} {event.effects[metric] > 0 ? "+" : ""}{event.effects[metric]}</small></>
          : <p>{t("No recorded decision changed this score.")} · {t(metricLabel)}</p>}</div>;
    })}</div>
    <p><strong>{t(question)}</strong></p>
  </section>;
}
