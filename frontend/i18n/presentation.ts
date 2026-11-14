import type { Branch, Ending, Game, NPC, Scenario, Scene, StoryEvent } from "@/lib/game";
import type { Locale } from "./config";
import { authored } from "./messages";

export function localizeScenario(scenario: Scenario, locale: Locale): Scenario {
  const t = (value: string) => authored(locale, value);
  const { experiment } = scenario;
  return {
    ...scenario, title: t(scenario.title), subtitle: t(scenario.subtitle), setting: t(scenario.setting),
    intro: t(scenario.intro), question: t(scenario.question), questions: scenario.questions.map(t),
    experiment: { title: t(experiment.title), description: t(experiment.description), steps: experiment.steps.map(t) },
    npcs: scenario.npcs.map((npc): NPC => ({
      ...npc, role: t(npc.role), background: t(npc.background), goal: t(npc.goal), mood: t(npc.mood),
      traits: npc.traits.map(t),
    })),
    paths: scenario.paths.map((path) => ({ ...path, title: t(path.title), short: t(path.short), description: t(path.description) })),
  };
}

export function localizeGame(game: Game, locale: Locale): Game {
  const t = (value: string) => authored(locale, value);
  function event(e: StoryEvent): StoryEvent {
    return { ...e, scene: t(e.scene), choice: t(e.choice), outcome: t(e.outcome) };
  }
  function ending(e: Ending): Ending {
    return { ...e, path: t(e.path), title: t(e.title), body: t(e.body), gain: t(e.gain), cost: t(e.cost),
      aftermath: e.aftermath ? t(e.aftermath) : e.aftermath, events: e.events.map(event) };
  }
  function scene(s: Scene): Scene {
    const variant = s.variants?.[locale];
    return {
      ...s, title: variant?.title ?? t(s.authored_title ?? s.title),
      body: variant?.narrative ?? t(s.authored_body ?? s.body),
      dialogue: variant?.dialogue ?? null, reaction: variant?.reaction ?? null, side_event: variant?.side_event ?? null,
      personalized: Boolean(variant), has_personalization: Boolean(s.variants && Object.keys(s.variants).length),
      when: t(s.when), location: t(s.location), last_event: s.last_event && t(s.last_event),
      choices: s.choices.map((choice) => ({ ...choice, label: t(choice.label) })),
    };
  }
  function branch(b: Branch): Branch {
    return { ...b, events: b.events.map(event), scene: b.scene && scene(b.scene) };
  }
  return { ...game, endings: game.endings.map(ending), branches: game.branches.map(branch),
    passport: game.passport && { ...game.passport, timelines: game.passport.timelines.map(ending),
      dilemma: game.passport.dilemma && t(game.passport.dilemma), questions: game.passport.questions?.map(t),
      experiment_title: game.passport.experiment_title && t(game.passport.experiment_title) } };
}
