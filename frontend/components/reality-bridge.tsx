"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/provider";
import { useGame, type Experiment, type Game, type Scenario, type View } from "@/lib/game";

function nextWeek() {
  const day = new Date();
  day.setDate(day.getDate() + 7);
  return [day.getFullYear(), String(day.getMonth() + 1).padStart(2, "0"), String(day.getDate()).padStart(2, "0")].join("-");
}

export function RealityBridge({ game, scenario, save, open }: {
  game: Game; scenario: Scenario; save: (change: Partial<Experiment>) => Promise<boolean>; open: (view: View) => void;
}) {
  const { t, story, locale } = useTranslation();
  const busy = useGame((state) => state.busy);
  const { passport, experiment } = game;
  const { plan, reflection } = experiment;
  const pass_interest = experiment.personal_1490_interest;
  const [action, setAction] = useState(plan?.action ?? passport?.next_step ?? "");
  const [deadline, setDeadline] = useState(plan?.deadline ?? nextWeek);
  const [signal, setSignal] = useState(plan?.signal ?? "");
  const [notes, setNotes] = useState(reflection ?? { outcome: "", surprise: "", priority: "" });
  const [editing, setEditing] = useState(!plan);
  const [editingNotes, setEditingNotes] = useState(!reflection);
  const [showPass, setShowPass] = useState(false);
  if (!passport) return <section className="panel empty"><h1>{t("Reality Bridge")}</h1>
    <p>{t("Save a Decision Passport to open Reality Bridge.")}</p>
    <Button onClick={() => open(game.endings.length ? "lab" : "story")}>{t("Continue")}</Button></section>;
  const observationFields = [
    ["outcome", t("What happened when you tried it?")],
    ["surprise", t("What surprised you?")],
    ["priority", t("How did your priorities change or stay the same?")],
  ] as const;
  if (showPass) return <section className="narrow panel form-grid">
    <h1>{t("A scenario about your own decision")}</h1>
    <p>{t("The stories you played, both endings and your Decision Passport are free.")}</p>
    <p>{t("Would you pay ₸1,490 once for a playable scenario written around your own two options and one real constraint?")}</p>
    <p>{t("For example: stay at work or start taking orders with only two evenings a week. Play through both schedules and ask each version of yourself what had to give.")}</p>
    <p>{t("This is an interest survey. We only save your answer in this universe. No purchase, subscription or charge.")}</p>
    <div className="actions"><Button disabled={busy} aria-pressed={pass_interest === "interested"} onClick={() => void save({ personal_1490_interest: "interested" })}>{t("Interested at this price")}</Button>
      <Button variant="outline" disabled={busy} aria-pressed={pass_interest === "declined"} onClick={() => void save({ personal_1490_interest: "declined" })}>{t("I would pass")}</Button></div>
    {pass_interest && <p role="status">{pass_interest === "interested" ? t("Your response: interested.") : t("Your response: would pass.")}</p>}
    <Button variant="ghost" onClick={() => setShowPass(false)}>{t("Back to Reality Bridge")}</Button></section>;
  const constraint = passport.constraint || game.profile.constraint;
  return <section>
    <header className="page-heading"><p className="eyebrow">{t("Reality Bridge")}</p><h1>{t("Your seven-day experiment")}</h1>
      <p>{scenario.experiment.description}</p>
      <Button variant="ghost" onClick={() => setShowPass(true)}>{t("Personal scenario for ₸1,490 · interest survey")}</Button></header>
    <div className="lab-layout"><div className="form-grid">
      {experiment.status === "skipped" ? <div className="panel form-grid"><p role="status">{t("Experiment skipped.")}</p>
        <Button variant="outline" disabled={busy} onClick={() => void save({ status: "active" })}>{t("Reopen experiment")}</Button></div> :
      <><section className="panel form-grid">
        <h2>{t("One small action")}</h2>
        {editing || !plan ? <form className="form-grid" onSubmit={async (event) => {
          event.preventDefault();
          if (await save({ plan: { action, deadline, signal } })) setEditing(false);
        }}>
          <label>{t("What will you try?")}<textarea required rows={2} maxLength={500} value={action} placeholder={scenario.experiment.steps[0]} onChange={(e) => setAction(e.target.value)} /></label>
          <Button variant="ghost" onClick={() => setAction(scenario.experiment.steps[0])}>{t("Use the suggested action")}</Button>
          <label>{t("When will you check the result?")}<input required type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
          <label>{t("What observable sign will you look for?")}<textarea required rows={2} maxLength={500} value={signal} onChange={(e) => setSignal(e.target.value)} /></label>
          <Button type="submit" disabled={busy || !action.trim() || !signal.trim()}>{t("Save experiment")}</Button>
        </form> : <><p>{plan.action}</p><p><strong>{t("Check-in date")}</strong> · {new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(new Date(plan.deadline + "T12:00:00"))}</p>
          <p><strong>{t("Observable sign")}</strong> · {plan.signal}</p>
          <Button variant="outline" onClick={() => setEditing(true)}>{t("Edit experiment")}</Button></>}
        <details><summary>{t("Suggested steps")}</summary><div className="checklist">{scenario.experiment.steps.map((step, index) =>
          <label key={index}><input type="checkbox" disabled={busy} checked={experiment.checked.includes(index)}
            onChange={(e) => void save({ checked: e.target.checked ? [...experiment.checked, index] : experiment.checked.filter((v) => v !== index) })}/>{step}</label>)}</div></details>
        {experiment.status === "active" && <Button variant="ghost" disabled={busy} onClick={() => void save({ status: "skipped" })}>{t("Skip experiment")}</Button>}
      </section>
      {plan && !editing && <section className="panel form-grid"><h2>{t("After the experiment")}</h2>
        {editingNotes || !reflection ? <form className="form-grid" onSubmit={async (e) => {
          e.preventDefault();
          if (await save({ reflection: notes, status: "completed" })) setEditingNotes(false);
        }}>{observationFields.map(([key, label]) => <label key={key}>{label}<textarea rows={2} required maxLength={500}
          value={notes[key]} onChange={(e) => setNotes({ ...notes, [key]: e.target.value })}/></label>)}
          <Button type="submit" disabled={busy || Object.values(notes).some((value) => !value.trim())}>{t("Save observations")}</Button></form> :
          <>{observationFields.map(([key, label]) => <div key={key}><strong>{label}</strong><p>{reflection[key]}</p></div>)}
            <Button variant="outline" onClick={() => setEditingNotes(true)}>{t("Edit observations")}</Button></>}
      </section>}</>}
      {experiment.status === "completed" && <p className="saved" role="status">{t("Experiment completed.")}</p>}
    </div><aside className="panel form-grid"><h2>{t("Decision Passport")}</h2><p>{passport.dilemma || scenario.intro}</p>
      {constraint && <p><strong>{t("Experiment constraint")}</strong> · {constraint}</p>}
      <p><strong>{t("Priorities")}</strong> · {passport.priorities.map(story).join(", ")}</p>
      {passport.uncertainty && <p><strong>{t("What’s still uncertain?")}</strong> {passport.uncertainty}</p>}
      {passport.next_step && <p><strong>{t("Next step")}</strong> · {passport.next_step}</p>}
      <Button onClick={() => open("map")}>{t("Return to the crossroads")}</Button>

    </aside></div>
  </section>;
}
