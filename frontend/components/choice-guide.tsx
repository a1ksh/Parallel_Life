import { useTranslation } from "@/i18n/provider";
import type { Scenario, StoryEvent } from "@/lib/game";

export const decisionQuestions = {
  career: "Start a business, change careers, or seek a promotion?",
  education: "Study abroad, earn a degree locally, or learn on the job?",
  relationships: "Work on the relationship, take some space, or start over?",
} as const;

export const pathTradeoffs: Record<string, keyof typeof import("../messages/ui.json")> = {
  business: "More control over your work, with income tied to your first customers.",
  change: "A new specialty, with time spent rebuilding skills and seniority.",
  grow: "A steadier income, with more people depending on your time.",
  abroad: "An international network, with moving costs and a new routine.",
  local: "Stay close to home while fitting coursework around existing commitments.",
  work: "Earn and gain experience now, with less time for formal study.",
  invest: "Keep building a life together, with compromises about where and how to live.",
  space: "More room for yourself, with uncertainty about your future together.",
  new: "Choose your own direction while rebuilding everyday support.",
};

const names = {
  career: "Career", finances: "Finances", freedom: "Freedom", knowledge: "Knowledge",
  wellbeing: "Well-being", social: "Connections",
} as const;

export function ChoiceEffects({ effects, scenario }: { effects?: Record<string, number>; scenario: Scenario }) {
  const { t } = useTranslation();
  if (!effects) return null;
  return <span className="effect-list">{Object.entries(effects).filter(([, delta]) => delta !== 0).map(([id, delta]) => {
    const person = id.startsWith("trust:") && scenario.npcs.find(npc => npc.id === id.slice(6));
    const metric = person ? t("Trust · {name}", { name: person.name }) : t(names[id as keyof typeof names] ?? "Character trust");
    const direction = delta > 0 ? t("{metric} increases", { metric }) : t("{metric} decreases", { metric });
    return <span key={id} className={delta > 0 ? "effect-up" : "effect-down"} title={direction}>
      <span aria-hidden="true">{metric} {delta > 0 ? "+" : ""}{delta}</span><span className="sr-only">{direction} ({delta})</span>
    </span>;
  })}</span>;
}

export function ChoiceResult({ event, scenario }: { event?: StoryEvent; scenario: Scenario }) {
  const { t } = useTranslation();
  if (!event) return null;
  return <div className="decision-result" role="status">
    <p className="result-choice">{t("Your choice")} · <strong>{event.choice}</strong></p>
    <h2>{t("What changed")}</h2><p>{event.outcome}</p>
    <ChoiceEffects effects={event.effects} scenario={scenario} />
  </div>;
}
