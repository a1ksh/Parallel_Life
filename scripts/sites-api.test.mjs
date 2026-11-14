import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import worker from '../dist/server/index.js';

function testDatabase() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0000_universes.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../drizzle/0001_ai_usage.sql', import.meta.url), 'utf8'));
  const adapter = {
    prepare(query) {
      return {
        bind(...args) {
          const stmt = sql.prepare(query);
          return {
            async run() { return { meta: stmt.run(...args) }; },
            async first() { return stmt.get(...args); },
            async all() { return { results: stmt.all(...args) }; },
          };
        },
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        for (const statement of statements) await statement.run();
        sql.exec('COMMIT');
      } catch (error) {
        sql.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { adapter, sql, close: () => sql.close() };
}

test('the hosted Worker serves Next.js and retains separate timelines, NPC memories, and progress', async () => {
  const db = testDatabase();
  const token = crypto.randomUUID();
  const env = { DB: db.adapter };
  async function call(path, method = 'GET', body, expected = 200, guest = token) {
    const response = await worker.fetch(new Request('https://parallel.example' + path, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'X-Guest-Token': guest },
    }), env);
    assert.equal(response.status, expected, await response.clone().text());
    return response.status === 204 ? null : response.headers.get('content-type').includes('application/json')
      ? response.json() : response.text();
  }
  try {
    const landing = await call('/');
    assert.match(landing, /What if you/);
    assert.match(landing, /href="\/kk"[^>]*>KZ/);
    const structure = (html) => [...html.matchAll(/<(header|nav|section|button)[^>]* class="([^"]+)"/g)].map(([, tag, name]) => [tag, name]);
    for (const [locale, headline] of [['en', 'chose differently?'], ['kk', 'таңдасаңыз ше?'], ['ru', 'выбрать другой путь?']]) {
      const localized = await call('/' + locale);
      assert.ok(localized.includes(headline));
      assert.ok(localized.includes(`<html lang="${locale}"`));
      assert.deepEqual(structure(localized), structure(landing));
      for (const [, asset] of localized.matchAll(/src="(\/_next\/[^"]+\.js)"/g)) assert.ok((await call(asset)).length > 100, asset);
    }
    const chunk = landing.match(/src="(\/_next\/[^"]+\.js)"/)[1];
    assert.ok((await call(chunk)).length > 100);
    const legacy = await call('/legacy/');
    assert.match(legacy, /Басқа жолды таңдасаң/);
    assert.match(legacy, /href="\/"[^>]*>English version/);
    assert.deepEqual(await call('/legacy/api/status'), { ai: false, character: false });
    const icon = await worker.fetch(new Request('https://parallel.example/favicon.ico'), env);
    assert.equal(icon.status, 200);
    assert.equal(icon.headers.get('content-type'), 'image/x-icon');
    assert.equal(new DataView(await icon.arrayBuffer()).getUint16(2, true), 1);
    assert.deepEqual(await call('/api/status'), { ai: false, storage: true });
    assert.deepEqual((await call('/api/scenarios')).map((scenario) => scenario.paths.length), [3, 3, 3]);
    const context = { dilemma: 'Keep my salary or start a studio?', constraint: 'Rent is due.',
      selected_values: ['freedom', 'finances'] };
    const fields = { gender: 'nonbinary', personal_context: 'I live in Astana.', name: 'Avery', age: 29, avatar: 'dawn', goal: 'Explore a decision', situation: 'At work', category: 'career', ...context };
    for (const values of [['freedom'], ['freedom', 'freedom'], ['freedom', 'unknown'], ['freedom', 'finances', 'social', 'career']])
      await call('/api/profiles', 'POST', { ...fields, selected_values: values }, 422);
    for (const invalid of [{ gender: 7 }, { personal_context: 'x'.repeat(301) }])
      await call('/api/profiles', 'POST', { ...fields, ...invalid }, 422);
    const weights = { skills: 2, health: 5, relationships: 4, work: 3, fulfillment: 1, study: 4, happiness: 2 };
    for (const invalid of [{}, { ...weights, health: 0 }, { ...weights, study: true }, { ...weights, extra: 3 }])
      await call('/api/profiles', 'POST', { ...fields, life_priorities: invalid }, 422);
    const profile = await call('/api/profiles', 'POST', { ...fields, life_priorities: weights }, 201);
    const game = await call('/api/sessions', 'POST', { profile_id: profile.id, scenario_id: 'career' }, 201);
    const session = `/api/sessions/${game.id}`;
    assert.equal(game.profile.gender, fields.gender);
    assert.equal(game.profile.personal_context, fields.personal_context);
    assert.deepEqual((await call(session)).profile.life_priorities, weights);
    const source = (await call(session + '/branches', 'POST', { path_id: 'business' })).active_id;
    const path = (id) => `${session}/branches/${id}`;
    const contextual = await call(path(source) + '/npcs/daniel/messages', 'POST',
      { scene_index: 0, locale: 'kk', text: 'Осы шешімде менің жағдайымды қалай ескеруге болады?' });
    assert.ok(contextual.branches[0].npcs.daniel.messages.at(-1).text.includes(fields.personal_context));
    await call(path(source) + '/npcs/emma/messages', 'POST', { scene_index: 0, text: 'What is your goal?' });
    await call(path(source) + '/choices', 'POST', { scene_index: 0, choice_id: '0' });
    const before = await call(path(source) + '/npcs/emma/messages', 'POST', { scene_index: 1, text: 'Do you remember earlier?' });
    const original = before.branches.find((branch) => branch.id === source);
    assert.match(original.npcs.emma.messages.at(-1).text, /small paid pilot/);
    assert.equal(original.npcs.emma.messages.at(-1).mode, 'scripted');
    const fork = await call(session + '/branches', 'POST', { parent_id: source, checkpoint: 0 });
    const forkId = fork.active_id;
    assert.equal(fork.branches.find((branch) => branch.id === forkId).npcs.emma.messages.length, 2);
    const selfQuestion = { scene_index: 0, text: 'Почему ты сделал такой выбор?', locale: 'ru' };
    await call(path(forkId) + '/other-self', 'POST', selfQuestion, 409);
    const discussed = await call(path(source) + '/other-self', 'POST', selfQuestion);
    assert.equal(discussed.active_id, forkId);
    assert.match(discussed.self_dialogues[source][0].reply, /Мой выбор/);
    assert.equal(discussed.self_dialogues[source][0].mode, 'scripted');
    assert.equal(discussed.self_dialogues[forkId], undefined);
    assert.deepEqual((await call(session)).self_dialogues, discussed.self_dialogues);
    const realFetch = globalThis.fetch;
    let providerContext;
    try {
      env.OPENAI_API_KEY = 'test-only';
      globalThis.fetch = async (url, request) => {
        assert.equal(url, 'https://api.openai.com/v1/responses');
        providerContext = JSON.parse(JSON.parse(request.body).input);
        return Response.json({ status: 'completed', output: [{ type: 'message',
          content: [{ type: 'output_text', text: '{"reply":"Let’s price the work before we promise it."}' }] }] });
      };
      const live = await call(path(forkId) + '/npcs/emma/messages', 'POST', { scene_index: 0, text: 'How should we start?' });
      assert.deepEqual(live.branches.find((branch) => branch.id === forkId).npcs.emma.messages.at(-1),
        { role: 'npc', text: 'Let’s price the work before we promise it.', mode: 'live', locale: 'en' });
      assert.deepEqual(providerContext.recent.filter(({ role }) => role === 'player').map(({ text }) => text), ['What is your goal?']);
      assert.deepEqual(providerContext.events, []);
      assert.equal(providerContext.npc.name, 'Aigerim Omarova');
      assert.equal(providerContext.timeline.path, 'Build Your Own Business');
    } finally {
      delete env.OPENAI_API_KEY;
      globalThis.fetch = realFetch;
    }
    for (let i = 0; i < 5; i++) await call(path(forkId) + '/choices', 'POST', { scene_index: i, choice_id: '1' });
    const reopened = await call(path(source) + '/active', 'PUT');
    assert.deepEqual(reopened.branches.find((branch) => branch.id === source).npcs.emma.messages, original.npcs.emma.messages);
    assert.equal(reopened.endings.length, 1);
    assert.equal(reopened.endings[0].events.length, 5);
    assert.ok(reopened.endings[0].aftermath);
    // A timeline already completed before the new scene stays complete.
    const saved = JSON.parse(db.sql.prepare('SELECT data FROM game_sessions WHERE id = ?').get(game.id).data);
    saved.branches[forkId].events.pop();
    saved.branches[forkId].checkpoints.pop();
    db.sql.prepare('UPDATE game_sessions SET data = ? WHERE id = ?').run(JSON.stringify(saved), game.id);
    const oldEnding = (await call(session)).endings[0];
    assert.equal(oldEnding.title, reopened.endings[0].title);
    assert.equal(oldEnding.events.length, 4);
    assert.equal(oldEnding.aftermath, null);
    await call(path(source) + '/choices', 'POST', { scene_index: 1, choice_id: '0' });
    const trusted = await call(path(source) + '/choices', 'POST', { scene_index: 2, choice_id: '2' });
    const trustedEvent = trusted.branches.find(b => b.id === source).events[2];
    const other = (await call(session + '/branches', 'POST', { parent_id: source, checkpoint: 2 })).active_id;
    const changed = await call(path(other) + '/choices', 'POST', { scene_index: 2, choice_id: '1' });
    const alternateEvent = changed.branches.find(b => b.id === other).events[2];
    const askSelf = (id, text, locale = 'en') => call(path(id) + '/other-self', 'POST', { scene_index: 2, text, locale });
    const result = (await askSelf(source, 'What did it lead to?')).self_dialogues[source];
    assert.ok(result.at(-1).reply.includes(trustedEvent.outcome));
    assert.match(result.at(-1).reply, /still open/);
    assert.deepEqual((await askSelf(source, 'What did it lead to?')).self_dialogues[source], result);
    const cost = (await askSelf(other, 'What did it cost?')).self_dialogues[other].at(-1).reply;
    assert.ok(cost.includes(alternateEvent.outcome) && !cost.includes(trustedEvent.outcome));
    assert.match(cost, /finances \(-4\)/);
    assert.match((await askSelf(other, 'Юпитер қайда?', 'kk')).self_dialogues[other].at(-1).reply, /күнделікте жоқ/);
    try {
      env.OPENAI_API_KEY = 'test-only';
      globalThis.fetch = async (_, request) => {
        providerContext = JSON.parse(JSON.parse(request.body).input);
        return Response.json({ status: 'completed', output: [{ type: 'message',
          content: [{ type: 'output_text', text: '{"reply":"I got an introduction."}' }] }] });
      };
      assert.equal((await askSelf(source, 'Do you regret this choice?')).self_dialogues[source].at(-1).mode, 'live');
      assert.deepEqual(providerContext.selected, trustedEvent);
      assert.deepEqual(providerContext.history, result);
      assert.equal(providerContext.ending, null);
      assert.ok(!JSON.stringify(providerContext).includes(alternateEvent.outcome));
    } finally {
      delete env.OPENAI_API_KEY;
      globalThis.fetch = realFetch;
    }
    await call(session, 'GET', undefined, 404, crypto.randomUUID());
    const reflected = await call(session + '/reflection', 'PUT', { priorities: ['Independence'], dilemma: 'overwritten' });
    for (const [key, value] of Object.entries(context)) assert.deepEqual(reflected.passport[key], value);
    await call(session + '/experiment', 'PUT', { checked: [0], status: 'active' });
    assert.deepEqual((await call(session)).experiment.checked, [0]);
    const plan = { action: 'Ask a mentor', deadline: '2026-11-21', signal: 'Receive one example' };
    const reflection = { outcome: 'Met at lunch', surprise: 'Low setup cost', priority: 'Independence matters more' };
    await call(session + '/experiment', 'PUT', { reflection }, 409);
    await call(session + '/experiment', 'PUT', { plan: { ...plan, deadline: '2026-02-30' } }, 422);
    await call(session + '/experiment', 'PUT', { plan });
    await call(session + '/experiment', 'PUT', { reflection, status: 'completed' });
    await call(session + '/experiment', 'PUT', { pass_interest: 'declined', pass_offer: 'KZT_1490' });
    assert.deepEqual((await call(session)).experiment, { checked: [0], status: 'completed', plan, reflection, pass_interest: 'declined', pass_offer: 'KZT_1490' });
    await call(session, 'DELETE', undefined, 204);
    assert.deepEqual(await call('/api/sessions'), []);
    assert.deepEqual(await call('/api/profiles'), []);
  } finally {
    db.close();
  }
});

test('the Worker accepts only bounded prose and falls back after a provider error or exhausted shared budget', async () => {
  const db = testDatabase();
  const env = { DB: db.adapter, OPENAI_API_KEY: 'test-only' };
  const realFetch = globalThis.fetch;
  const guest = crypto.randomUUID();
  const calls = [];
  async function call(path, body, status = 200) {
    const response = await worker.fetch(new Request('https://parallel.example' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'X-Guest-Token': guest },
      body: JSON.stringify(body),
    }), env);
    assert.equal(response.status, status, await response.clone().text());
    return response.json();
  }
  const sceneText = { title: 'An offer on the table', narrative: 'Emma looks over the proposal.',
    dialogue: 'Emma: Let’s make the scope clear.', reaction: '', side_event: 'Rain starts against the window.' };
  const outputs = [
    () => new Response(null, { status: 503 }),
    () => providerText({ ...sceneText, world: { finances: 100 } }),
    () => providerText(sceneText),
    () => providerText({ reply: 'I’d start with one customer.' }),
    () => providerText({ ...sceneText, title: 'Предложение на столе', narrative: 'Эмма изучает предложение.',
      dialogue: 'Эмма: Давай уточним объём.', side_event: 'За окном начинается дождь.' }),
  ];
  function providerText(value) {
    return Response.json({ status: 'completed', output: [{ type: 'message',
      content: [{ type: 'output_text', text: JSON.stringify(value) }] }] });
  }
  globalThis.fetch = async (url, request) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    calls.push(JSON.parse(request.body));
    return outputs.shift()();
  };
  try {
    const profile = await call('/api/profiles', {
      name: 'Fictional avatar', age: 29, avatar: 'dawn', goal: 'Keep a clear scope', situation: 'At work', category: 'career',
    }, 201);
    const game = await call('/api/sessions', { profile_id: profile.id, scenario_id: 'career' }, 201);
    const session = `/api/sessions/${game.id}`;
    const started = await call(session + '/branches', { path_id: 'business' });
    const path = `${session}/branches/${started.active_id}`;
    const npc = path + '/npcs/emma/messages';
    const initial = started.branches[0];
    const failed = await call(npc, { scene_index: 0, text: 'What do you think?' });
    assert.match(failed.ai_notice, /couldn’t respond/);
    assert.equal(failed.branches[0].npcs.emma.messages.at(-1).mode, 'scripted');
    const rejected = await call(path + '/scene', {});
    assert.deepEqual(rejected.branches[0].scene, initial.scene);
    assert.deepEqual(rejected.branches[0].world, initial.world);
    const enhanced = await call(path + '/scene', {});
    assert.equal(enhanced.branches[0].scene.side_event, sceneText.side_event);
    assert.deepEqual(enhanced.branches[0].scene.choices, initial.scene.choices);
    assert.deepEqual(enhanced.branches[0].events, []);
    assert.deepEqual(enhanced.branches[0].world, initial.world);
    assert.equal((await call(npc, { scene_index: 0, text: 'What is the first step?' }))
      .branches[0].npcs.emma.messages.at(-1).mode, 'live');
    assert.deepEqual(calls.map((request) => request.max_output_tokens), [420, 650, 650, 420]);
    assert.equal(JSON.parse(calls[3].input).recent[0].text, 'What do you think?');
    assert.ok(calls.every((request) => request.store === false && request.text.format.strict));
    const translated = await call(path + '/scene', { locale: 'ru' });
    assert.match(calls[4].instructions, /Russian.*Translate each supplied prose/);
    assert.deepEqual(JSON.parse(calls[4].input).prose, sceneText);
    assert.equal(translated.branches[0].scene.variants.ru.title, 'Предложение на столе');
    assert.equal(translated.branches[0].scene.variants.en.title, sceneText.title);
    assert.deepEqual(translated.branches[0].scene.choices, initial.scene.choices);
    await call(path + '/scene', { locale: 'ru' });
    assert.equal(calls.length, 5);
    db.sql.prepare("UPDATE ai_usage SET calls = 500 WHERE bucket = 'global:day'").run();
    const capped = await call(npc, { scene_index: 0, text: 'Can I still play?' });
    assert.match(capped.ai_notice, /usage limit/);
    assert.equal(capped.branches[0].npcs.emma.messages.at(-1).mode, 'scripted');
    assert.equal(calls.length, 5);
    assert.equal(db.sql.prepare("SELECT calls FROM ai_usage WHERE bucket LIKE 'guest:%'").get().calls, 5);
    assert.equal((await call(session)).branches[0].npcs.emma.messages.length, 6);
  } finally {
    globalThis.fetch = realFetch;
    db.close();
  }
});
