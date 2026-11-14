"use client";

import { useEffect, useRef, useState } from "react";
import { messages } from "@/i18n/messages";
import type { Locale } from "@/i18n/config";
import { api } from "@/lib/game";
import { Button } from "./ui/button";

type Turn = { question: string; reply: string; locale: Locale };

export function PersonalDialogue({ path, locale }: { path: string; locale: Locale }) {
  const t = messages(locale);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const attempt = useRef({ question: "", id: "" });
  useEffect(() => {
    let active = true;
    api<Turn[]>(path).then(data => { if (active) setTurns(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [path]);
  async function send(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true); setError(false);
    if (attempt.current.question !== question) attempt.current = { question, id: crypto.randomUUID() };
    try {
      setTurns(await api<Turn[]>(path, "POST", { question, locale, request_id: attempt.current.id }, 30000));
      attempt.current = { question: "", id: "" };
      setText("");
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <section className="panel form-grid">
    <h3>{t("Talk to my other self")}</h3>
    <div role="log" aria-live="polite">{turns.map((turn,i) => <article key={i} lang={turn.locale}>
      <strong>{turn.question}</strong><p>{turn.reply}</p></article>)}</div>
    <div className="actions">{(["Why did you make this choice?", "What did it lead to?"] as const).map(key =>
      <Button disabled={busy} key={key} variant="outline" onClick={() => void send(t(key))}>{t(key)}</Button>)}</div>
    <form className="form-grid" onSubmit={e => { e.preventDefault(); void send(text.trim()); }}>
      <label>{t("Ask about this decision")}<textarea maxLength={600} value={text} onChange={e => setText(e.target.value)} /></label>
      <Button type="submit" disabled={busy || !text.trim()}>{t("Ask")}</Button>
    </form>
    {busy && <p role="status">{t("Waiting for reply…")}</p>}
    {error && <p role="alert">{t("Chat is unavailable. Try your question again in a minute.")}</p>}
  </section>;
}
