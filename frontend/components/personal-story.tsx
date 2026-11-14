"use client";

import { useEffect, useState } from "react";
import { PersonalDialogue } from "./personal-dialogue";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/game";
import type { Locale } from "@/i18n/config";
import { messages } from "@/i18n/messages";

type Brief = { first: string; second: string; constraint: string; goal?: string };
type Branch = "first" | "second";
type PersonalStoryData = { id: string; brief: Brief; story: Record<string,string>; picks: Partial<Record<Branch,"a"|"b">> };
type Library = PersonalStoryData[];
const empty = { first: "", second: "", constraint: "" };

export function PersonalStory({ locale }: { locale: Locale }) {
  const t = messages(locale);
  const [library, setLibrary] = useState<Library>();
  const [brief, setBrief] = useState<Brief>(empty);
  const [selected, setSelected] = useState<PersonalStoryData>();
  const [branch, setBranch] = useState<Branch>("first");
  const [preview, setPreview] = useState<"a"|"b">();
  const [busy, setBusy] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [error, setError] = useState(false);
  const draftKey = "personal-story-draft-" + locale;

  async function refresh() {
    const data = await api<Library>("/personal");
    setLibrary(data);
    const last = localStorage.getItem("personal-story-current");
    setSelected(data.find(o => o.id === last));
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(false);
    try { await action(); } catch { setError(true); } finally { setBusy(false); }
  }
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(draftKey) || "null"); if (saved) setBrief(saved); } catch {}
    setDraftReady(true);
    void run(refresh);
  }, [draftKey]);

  function edit(field: keyof Brief, value: string) {
    const next = { ...brief, [field]: value };
    setBrief(next); localStorage.setItem(draftKey, JSON.stringify(next));
  }
  function select(item?: PersonalStoryData) {
    if (item) localStorage.setItem("personal-story-current", item.id);
    else localStorage.removeItem("personal-story-current");
    setPreview(undefined); setSelected(item); setBranch("first"); setError(false);
  }
  async function createStory() {
    const key = JSON.stringify([locale, brief]);
    const attempt = JSON.parse(localStorage.getItem("personal-story-attempt") || "null");
    const id = attempt?.key === key ? attempt.id : crypto.randomUUID();
    localStorage.setItem("personal-story-attempt", JSON.stringify({ key, id }));
    localStorage.setItem("personal-story-current", id);
    const item = await api<PersonalStoryData>("/personal/" + id, "POST", { ...brief, locale }, 65000);
    select(item);
    await refresh();
  }

  const choice = selected?.picks[branch];
  const outcome = choice && selected?.story[branch+"_"+choice+"_end"];
  const assessment = choice && selected?.story[branch+"_"+choice+"_goal"];
  const path = "/personal/" + selected?.id;
  return <main className="frame narrow form-grid" style={{paddingBlock:"2rem",overflowWrap:"anywhere"}}>
    <a href={`/${locale}/`}>← Parallel Life</a>
    <header className="page-heading"><p className="eyebrow">Gemini</p><h1>{t("A scenario about your own decision")}</h1></header>
    {error && <div role="alert">{t("Could not load the story. Your draft is saved. Try again in a minute.")} <Button onClick={() => void run(refresh)}>{t("Refresh")}</Button></div>}
    {!selected ? <form className="panel form-grid" onSubmit={e => { e.preventDefault(); void run(createStory); }}>
      <p>{t("Enter two paths and one limit. Gemini writes a scene for each path, with two actions and their consequences.")}</p>
      {(["first","second","constraint"] as const).map((field,i) => <label key={field}>{t((["My first option","My second option","My real constraint"] as const)[i])}
        <textarea disabled={!draftReady || busy} rows={2} minLength={3} maxLength={350} required value={brief[field]} onChange={e => edit(field,e.target.value)}/></label>)}
      {brief.first.trim() && brief.first.trim().toLowerCase() === brief.second.trim().toLowerCase() && <p role="status">{t("Enter two different options.")}</p>}
      <label>{t("My goal (optional)")}<textarea maxLength={200} rows={2} disabled={!draftReady || busy} value={brief.goal || ""} onChange={e => edit("goal", e.target.value)} /></label>
      <small>{t("Your answers go to Gemini. Reopen the story in this browser.")}</small>
      <Button type="submit" disabled={busy || [brief.first, brief.second, brief.constraint].some(s => s.trim().length < 3) || brief.first.trim().toLowerCase() === brief.second.trim().toLowerCase()}>{t(busy ? "Writing both paths…" : "Generate my two paths")}</Button>
    </form> : <section className="panel form-grid">
      {selected.brief.goal && <p><strong>{t("Main personal goal")}</strong> · {selected.brief.goal}</p>}<p>{t("My real constraint")} · {selected.brief.constraint}</p>
      <>
        <div className="actions">{(["first","second"] as const).map(k => <Button key={k} aria-pressed={k === branch} variant={k === branch ? "default":"outline"} disabled={busy} onClick={() => {setPreview(undefined); setBranch(k);}}>{selected.brief[k]}</Button>)}</div>
        <h2>{selected.brief[branch]}</h2><p>{selected.story[branch+"_scene"]}</p>
        <h3>{t("What will you do?")}</h3>
        {(["a","b"] as const).map(c => <Button disabled={busy} variant={(preview ?? choice) === c ? "default" : "outline"} key={c}
          aria-pressed={(preview ?? choice) === c} onClick={() => setPreview(c)}>{selected.story[branch+"_"+c]}</Button>)}
        {preview && <Button disabled={busy} onClick={() => void run(async () => {
          setSelected(await api<PersonalStoryData>(path+"/pick/"+branch+"/"+preview,"PUT"));
          setPreview(undefined);
        })}>{t("Confirm and see the consequence")}</Button>}
        {choice && !preview && <>
          <section className="decision-result" aria-live="polite"><p>{t("Your choice")} · {selected.story[branch+"_"+choice]}</p>
            <h2>{t("Branch ending")}</h2><p>{outcome}</p>
            {assessment && <><h3>{t(selected.brief.goal ? "Goal result" : "How the constraint affected the result")}</h3><p>{assessment}</p></>}
            <small>{t("Paths explored: {count} of 2", {count: Object.keys(selected.picks).length})}</small>
          </section>
          <PersonalDialogue key={path+branch+choice} path={path+"/chat/"+branch+"/"+choice} locale={locale} />
        </>}
      </>
      <Button variant="ghost" onClick={() => { localStorage.removeItem("personal-story-attempt"); select(); void run(refresh); }}>{t("Back to my stories")}</Button>
    </section>}
    {!selected && !!library?.length && <section className="panel form-grid"><h2>{t("My personal stories")}</h2>{library.map(item => <Button key={item.id} variant="outline" onClick={() => select(item)}>{item.brief.first} / {item.brief.second}</Button>)}</section>}
  </main>;
}
