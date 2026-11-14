import { create } from "zustand";

export const categories = ["career", "education", "relationships"] as const;
export type Category = typeof categories[number];
export const avatars = ["dawn", "orbit", "night", "ember"] as const;
export type Profile = {
  id: string; name: string; age: number; avatar: typeof avatars[number]; situation: string;
  goal: string; category: Category; traits: string; values: string; background: string;
};
export type NPC = {
  id: string; name: string; role: string; avatar: string; traits: string[];
  background: string; goal: string; mood: string;
};
export type Scenario = {
  id: Category; title: string; subtitle: string; setting: string; intro: string; age: number;
  npcs: NPC[]; paths: { id: string; title: string; short: string; description: string }[];
  priorities: string[]; question: string; questions: string[];
  experiment: { title: string; description: string; steps: string[] };
};
export type Scene = {
  index: number; count: number; title: string; body: string; when: string; location: string; npcs: string[];
  last_event: string | null; dialogue: string | null; personalized: boolean;
  choices: { id: string; label: string; focus: string[] }[];
};
export type Message = { role: "player" | "npc"; text: string; mode?: "scripted" | "live" };
export type StoryEvent = { scene: string; choice: string; outcome: string; effects: Record<string, number> };
export type Branch = {
  id: string; path_id: string; parent_id: string | null; fork_at: number;
  world: Record<string, number>; events: StoryEvent[]; checkpoints: number; ending: number | null;
  scene?: Scene | null; npcs?: Record<string, { trust: number; messages: Message[] }>;
};
export type Ending = {
  id: string; path: string; title: string; body: string; gain: string; cost: string; aftermath?: string | null; events: StoryEvent[];
};
export type Passport = {
  priorities: string[]; uncertainty: string; next_step: string; timelines: Ending[];
  dilemma?: string; questions?: string[]; experiment_title?: string;
};
export type Experiment = { checked: number[]; status: "active" | "completed" | "skipped" };
export type Game = {
  id: string; profile: Profile; scenario_id: Category; active_id: string | null; branches: Branch[];
  endings: Ending[]; passport: Passport | null; experiment: Experiment;
};
export type Universe = Pick<Game, "id" | "scenario_id" | "profile"> & { branches: number; completed: number };
export type View = "home" | "onboarding" | "scenarios" | "story" | "map" | "compare" | "lab" | "bridge" | "universes";

const base = process.env.NEXT_PUBLIC_API_BASE ?? "/api";
const tokenKey = "parallel-life-guest";
export const activeKey = "parallel-life-universe";
let inMemoryGuest: string | undefined;

function guestToken() {
  if (inMemoryGuest) return inMemoryGuest;
  const saved = localStorage.getItem(tokenKey);
  inMemoryGuest = saved || crypto.randomUUID() + crypto.randomUUID();
  if (!saved) localStorage.setItem(tokenKey, inMemoryGuest);
  return inMemoryGuest;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method, headers: { "Content-Type": "application/json", "X-Guest-Token": guestToken() },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error("The story server couldn’t be reached. Check your connection and try again.");
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(typeof data?.detail === "string" ? data.detail : "Check your input and try again.", response.status);
  }
  if (data === null) throw new Error("The story server returned an unexpected response.");
  return data as T;
}

type State = {
  view: View; game: Game | null; profile: Profile | null; catalog: Scenario[]; ai: boolean;
  busy: boolean; error: string; setView: (view: View) => void; update: (game: Game) => void;
};

export const useGame = create<State>((set) => ({
  view: "home", game: null, profile: null, catalog: [], ai: false, busy: false, error: "",
  setView: (view) => set({ view, error: "" }),
  update: (game) => {
    localStorage.setItem(activeKey, game.id);
    set({ game, profile: game.profile });
  },
}));

export async function perform(task: () => Promise<void>) {
  if (useGame.getState().busy) return;
  useGame.setState({ busy: true, error: "" });
  try {
    await task();
  } catch (error) {
    useGame.setState({ error: error instanceof Error ? error.message : "Something went wrong." });
  } finally {
    useGame.setState({ busy: false });
  }
}
