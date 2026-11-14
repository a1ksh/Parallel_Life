import { catalog, opportunities } from './story-data.js';
import { aiEnabled, aiNotices, aiScene, aiConversation, generateAi } from './ai.js';

const worldDefaults = { career: 50, finances: 50, freedom: 50, knowledge: 50, wellbeing: 50, social: 50 };
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const scenarioFor = (id) => catalog.find((scenario) => scenario.id === id);
const pathFor = (game, branch) => scenarioFor(game.scenario_id).paths.find((path) => path.id === branch.path_id);
const validText = (value, max, required = true) => typeof value === 'string' && value.length <= max && (!required || Boolean(value.trim()));
const bounded = (number) => Math.min(100, Math.max(0, number));

function currentScene(game, branch) {
  if (branch.ending !== null) return null;
  const index = branch.events.length;
  const beat = pathFor(game, branch).beats[index];
  const choices = [...beat.choices];
  if (index === 2 && beat.npcs.some((id) => branch.npcs[id].trust >= 58)) choices.push(opportunities[game.scenario_id]);
  return { ...beat, index, choices, last_event: branch.events.at(-1)?.outcome ?? null };
}

function sceneView(game, branch) {
  const scene = currentScene(game, branch);
  if (!scene) return null;
  const generated = branch.narration[scene.index];
  return { ...scene, count: pathFor(game, branch).beats.length, title: generated?.title ?? scene.title, body: generated?.narrative ?? scene.body,
    personalized: Boolean(generated), dialogue: generated?.dialogue ?? null,
    reaction: generated?.reaction ?? null, side_event: generated?.side_event ?? null,
    choices: scene.choices.map(([label, effects], i) => ({ id: String(i), label, focus: Object.keys(effects) })) };
}

function endings(game) {
  return Object.values(game.branches).filter((branch) => branch.ending !== null).map((branch) => {
    const path = pathFor(game, branch);
    const [title, body, gain, cost] = path.endings[branch.ending];
    const aftermath = branch.events.length === path.beats.length ? branch.events.at(-1).outcome : null;
    return { id: branch.id, path: path.title, title, body, gain, cost, aftermath, events: branch.events };
  });
}

function gameView(game) {
  const branches = Object.values(game.branches).map(({ checkpoints, narration, npcs, ...branch }) => ({
    ...branch, checkpoints: checkpoints.length,
    ...(branch.id === game.active_id ? {
      npcs: Object.fromEntries(Object.entries(npcs).map(([id, { trust, messages }]) => [id, { trust, messages }])),
      scene: sceneView(game, game.branches[branch.id]),
    } : {}),
  }));
  return { ...game, branches, endings: endings(game) };
}

function applyEffects(branch, effects) {
  for (const [key, amount] of Object.entries(effects)) {
    if (!Number.isInteger(amount) || Math.abs(amount) > 20) throw new Error('Invalid authored effect.');
    const npc = key.startsWith('trust:') && branch.npcs[key.slice(6)];
    if (npc) npc.trust = bounded(npc.trust + amount);
    else if (Object.hasOwn(worldDefaults, key)) branch.world[key] = bounded(branch.world[key] + amount);
    else throw new Error('Unknown authored effect.');
  }
}

function startBranch(game, input) {
  if (Object.keys(game.branches).length >= 32) fail(409, 'This universe has reached its 32 timeline limit.');
  const id = crypto.randomUUID();
  let branch;
  if (input.parent_id !== undefined) {
    const parent = Object.hasOwn(game.branches, input.parent_id) ? game.branches[input.parent_id] : null;
    const index = input.checkpoint;
    if (!parent || input.path_id !== undefined || !Number.isInteger(index) || !parent.checkpoints[index]) fail(409, 'Choose one saved checkpoint.');
    branch = { ...structuredClone(parent.checkpoints[index]), id, parent_id: parent.id, fork_at: index,
      checkpoints: structuredClone(parent.checkpoints.slice(0, index)),
      narration: Object.fromEntries(Object.entries(parent.narration).filter(([key]) => Number(key) < index)) };
  } else {
    const scenario = scenarioFor(game.scenario_id);
    const path = scenario.paths.find((item) => item.id === input.path_id);
    if (!path || input.checkpoint !== undefined) fail(409, 'Choose a path from this scenario.');
    branch = { id, path_id: path.id, parent_id: null, fork_at: 0, events: [], checkpoints: [],
      world: { ...worldDefaults }, narration: {}, ending: null,
      npcs: Object.fromEntries(scenario.npcs.map(({ id }) => [id, { trust: 50, messages: [], memories: [] }])) };
    applyEffects(branch, path.effects);
  }
  game.branches[id] = branch;
  game.active_id = id;
}

function choose(game, branch, input) {
  const scene = currentScene(game, branch);
  if (!scene || input.scene_index !== scene.index) fail(409, 'This scene already moved forward. Refresh the timeline and try again.');
  const option = scene.choices.find((_, index) => input.choice_id === String(index));
  if (!option) fail(422, 'Choose one of the options in this scene.');
  const { checkpoints, narration, ...state } = branch;
  checkpoints.push(structuredClone(state));
  const [choice, effects, outcome] = option;
  applyEffects(branch, effects);
  branch.events.push({ scene: scene.title, choice_id: input.choice_id, choice, effects, outcome, world: { ...branch.world } });
  if (branch.events.length === pathFor(game, branch).beats.length) branch.ending = Number(branch.events.at(-2).choice_id);
}

async function chat(env, owner, game, branch, npcId, input) {
  const scene = currentScene(game, branch);
  if (!scene || input.scene_index !== scene.index || !scene.npcs.includes(npcId)) fail(409, 'That character is unavailable in this scene.');
  if (!validText(input.text, 600)) fail(422, 'Enter a message of up to 600 characters.');
  const text = input.text.trim();
  const scenario = scenarioFor(game.scenario_id);
  const npc = scenario.npcs.find((item) => item.id === npcId);
  const state = branch.npcs[npcId];
  if (state.messages.length >= 32) fail(409, 'This character has reached the conversation limit for this timeline.');
  const path = pathFor(game, branch);
  const events = branch.events.flatMap(({ choice, outcome }, i) => path.beats[i].npcs.includes(npcId) ? [{ choice, outcome }] : []);
  const { data, reason } = await generateAi(env, owner, 'npc_reply', {
    npc, trust: state.trust, timeline: { scenario: scenario.title, path: path.title },
    scene: aiScene({ ...scene, last_event: null }), events, ...aiConversation(state.messages, text), text,
  });
  const live = Boolean(data);
  let reply = data?.reply ?? npc.voice;
  if (!live) {
    const priorMessage = state.messages.findLast((item) => item.role === 'player');
    const event = events.at(-1)?.outcome;
    if (/\b(remember|earlier|before|last time)\b/i.test(text) && (priorMessage || event)) {
      reply = priorMessage
        ? `I remember your earlier message: “${priorMessage.text.slice(0, 120)}” ${event ?? npc.support}`
        : `Here’s what I remember: ${event} ${npc.support}`;
    } else if (/\b(your goal|your plans?|what (do|did) you (want|need)|why are you)\b/i.test(text)) {
      reply = `My goal is to ${npc.goal[0].toLowerCase()}${npc.goal.slice(1)} ${npc.support}`;
    } else if (event && !priorMessage) {
      reply = `${event} ${npc.support}`;
    } else if (priorMessage || state.trust >= 65) {
      reply = npc.support;
    }
  }
  state.messages.push({ role: 'player', text }, { role: 'npc', text: reply, mode: live ? 'live' : 'scripted' });
  if (state.messages.length <= 12) state.trust = bounded(state.trust + 1);
  if (currentScene(game, branch).choices.length !== scene.choices.length) delete branch.narration[scene.index];
  return reason === 'disabled' ? undefined : reason;
}

async function narrate(env, owner, game, branch) {
  const scene = currentScene(game, branch);
  if (!scene || branch.narration[scene.index]) return {};
  const scenario = scenarioFor(game.scenario_id);
  const { profile } = game;
  const { data, reason } = await generateAi(env, owner, 'scene', {
    scene: aiScene(scene), timeline: { scenario: scenario.title, path: pathFor(game, branch).title },
    profile: { age: profile.age, goal: profile.goal, values: profile.values, traits: profile.traits },
    events: branch.events.map(({ choice, outcome }) => ({ choice, outcome })),
    npcs: scenario.npcs.filter((npc) => scene.npcs.includes(npc.id)).map((npc) => ({ ...npc, trust: branch.npcs[npc.id].trust })),
  });
  if (!data) return { reason };
  if (!branch.events.length) data.reaction = '';
  branch.narration[scene.index] = data;
  return { updated: true };
}

async function ownerFor(request) {
  const token = request.headers.get('X-Guest-Token');
  if (!token || token.length < 36 || token.length > 90) fail(422, 'A guest token is required.');
  const scope = request.headers.get('oai-authenticated-user-id') ?? '';
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${scope}:${token}`));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function payload(request) {
  const text = await request.text();
  if (text.length > 20_000) fail(413, 'Request too large.');
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(422, 'Enter valid request data.');
  return data;
}

async function profileRoute(db, method, owner, input) {
  if (method === 'GET') {
    const { results } = await db.prepare('SELECT data FROM player_profiles WHERE owner = ?').bind(owner).all();
    return json(results.map(({ data }) => JSON.parse(data)));
  }
  const { name, age, avatar, situation, goal, category, traits = '', values = '', background = '' } = input;
  if (method !== 'POST') fail(405, 'Method not allowed.');
  if (![name, situation, goal].every((value) => validText(value, 120)) || !Number.isInteger(age) || age < 18 || age > 120 ||
      !['dawn', 'orbit', 'night', 'ember'].includes(avatar) || !scenarioFor(category) ||
      !validText(traits, 180, false) || !validText(values, 180, false) || !validText(background, 300, false)) fail(422, 'Check the avatar fields and try again.');
  const profile = { id: crypto.randomUUID(), name: name.trim(), age, avatar, situation: situation.trim(),
    goal: goal.trim(), category, traits, values, background };
  await db.prepare('INSERT INTO player_profiles (id, owner, data) VALUES (?, ?, ?)').bind(profile.id, owner, JSON.stringify(profile)).run();
  return json(profile, 201);
}

async function sessionsRoute(db, method, owner, input) {
  if (method === 'GET') {
    const { results } = await db.prepare('SELECT data FROM game_sessions WHERE owner = ?').bind(owner).all();
    return json(results.map(({ data }) => {
      const game = JSON.parse(data);
      return { id: game.id, profile: game.profile, scenario_id: game.scenario_id,
        branches: Object.keys(game.branches).length, completed: endings(game).length };
    }));
  }
  if (method !== 'POST') fail(405, 'Method not allowed.');
  if (!scenarioFor(input.scenario_id) || !validText(input.profile_id, 36)) fail(422, 'Choose a profile and scenario.');
  const row = await db.prepare('SELECT data FROM player_profiles WHERE id = ? AND owner = ?').bind(input.profile_id, owner).first();
  if (!row) fail(404, 'This avatar could not be found.');
  const game = { id: crypto.randomUUID(), profile: JSON.parse(row.data), scenario_id: input.scenario_id,
    active_id: null, branches: {}, passport: null, experiment: { checked: [], status: 'active' } };
  await db.prepare('INSERT INTO game_sessions (id, owner, data) VALUES (?, ?, ?)').bind(game.id, owner, JSON.stringify(game)).run();
  return json(gameView(game), 201);
}

async function gameRoute(request, env, owner, id, tail) {
  const db = env.DB;
  const row = await db.prepare('SELECT data, revision FROM game_sessions WHERE id = ? AND owner = ?').bind(id, owner).first();
  if (!row) fail(404, 'This universe could not be found.');
  const game = JSON.parse(row.data);
  const method = request.method;
  let notice;
  if (!tail.length && method === 'GET') return json(gameView(game));
  if (!tail.length && method === 'DELETE') {
    await db.batch([
      db.prepare('DELETE FROM game_sessions WHERE id = ? AND owner = ?').bind(id, owner),
      db.prepare(`DELETE FROM player_profiles WHERE id = ? AND owner = ? AND NOT EXISTS (
        SELECT 1 FROM game_sessions WHERE owner = ? AND json_extract(data, '$.profile.id') = ?)`)
        .bind(game.profile.id, owner, owner, game.profile.id),
    ]);
    return new Response(null, { status: 204 });
  }
  if (tail[0] === 'comparison' && tail.length === 1 && method === 'GET') return json(endings(game));
  if (tail[0] === 'branches' && tail.length === 1 && method === 'POST') startBranch(game, await payload(request));
  else if (tail[0] === 'branches' && tail[1]) {
    const branch = Object.hasOwn(game.branches, tail[1]) ? game.branches[tail[1]] : null;
    if (!branch) fail(404, 'This timeline could not be found.');
    const endpoint = tail[2];
    if (endpoint === 'scene' && method === 'GET') return json(sceneView(game, branch));
    if (endpoint === 'active' && method === 'PUT') game.active_id = branch.id;
    else if (endpoint === 'choices' && method === 'POST') choose(game, branch, await payload(request));
    else if (endpoint === 'scene' && method === 'POST') {
      const { updated, reason } = await narrate(env, owner, game, branch);
      if (!updated) return json({ ...gameView(game), ...(reason && { ai_notice: aiNotices[reason] }) });
    } else if (endpoint === 'npcs' && tail[4] === 'messages' && method === 'POST') {
      notice = await chat(env, owner, game, branch, tail[3], await payload(request));
    }
    else fail(404, 'This action could not be found.');
  } else if (tail[0] === 'reflection' && method === 'PUT') {
    const results = endings(game);
    if (!results.length) fail(409, 'Finish a timeline to open the Decision Lab.');
    const { priorities, uncertainty = '', next_step = '' } = await payload(request);
    const scenario = scenarioFor(game.scenario_id);
    const allowed = scenario.priorities;
    if (!Array.isArray(priorities) || priorities.length < 1 || priorities.length > 4 ||
        !priorities.every((priority) => allowed.includes(priority)) || !validText(uncertainty, 500, false) ||
        !validText(next_step, 500, false)) fail(422, 'Choose priorities from this scenario.');
    game.passport = { priorities: [...new Set(priorities)], uncertainty, next_step, timelines: results,
      dilemma: scenario.intro, questions: scenario.questions, experiment_title: scenario.experiment.title };
  } else if (tail[0] === 'experiment' && method === 'PUT') {
    if (!game.passport) fail(409, 'Save a Decision Passport to open Reality Bridge.');
    const { checked, status } = await payload(request);
    const count = scenarioFor(game.scenario_id).experiment.steps.length;
    if (!Array.isArray(checked) || checked.length > 5 || checked.some((i) => !Number.isInteger(i) || i < 0 || i >= count) ||
        !['active', 'skipped', 'completed'].includes(status)) fail(422, 'Check your experiment progress.');
    game.experiment = { checked: [...new Set(checked)].sort(), status };
  } else fail(404, 'This action could not be found.');

  const result = await db.prepare('UPDATE game_sessions SET data = ?, revision = revision + 1 WHERE id = ? AND owner = ? AND revision = ?')
    .bind(JSON.stringify(game), id, owner, row.revision).run();
  if (!result.meta.changes) fail(409, 'The universe changed in another request. Reload and try again.');
  return json({ ...gameView(game), ...(notice && { ai_notice: aiNotices[notice] }) });
}

export async function handleApi(request, env, path) {
  const method = request.method;
  try {
    if (path === '/api/status' && method === 'GET') return json({ ai: aiEnabled(env), storage: Boolean(env.DB) });
    if (path === '/api/scenarios' && method === 'GET') return json(catalog.map(({ paths, ...scenario }) => ({
      ...scenario, paths: paths.map(({ id, title, short, description }) => ({ id, title, short, description })),
    })));
    if (!env.DB) fail(503, 'Hosted storage is temporarily unavailable.');
    const owner = await ownerFor(request);
    if (path === '/api/profiles') return await profileRoute(env.DB, method, owner, method === 'POST' ? await payload(request) : null);
    if (path === '/api/sessions') return await sessionsRoute(env.DB, method, owner, method === 'POST' ? await payload(request) : null);
    const match = path.match(/^\/api\/sessions\/([a-f0-9-]{36})(?:\/(.*))?$/);
    if (match) return await gameRoute(request, env, owner, match[1], match[2]?.split('/') ?? []);
    return json({ detail: 'This endpoint could not be found.' }, 404);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ detail: 'Enter valid request data.' }, 422);
    if (error.status) return json({ detail: error.message }, error.status);
    console.error('Parallel Life request failed', error.name);
    return json({ detail: 'The story server couldn’t complete this action. Please try again.' }, 500);
  }
}
