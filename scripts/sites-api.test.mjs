import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import worker from '../dist/server/index.js';

function testDatabase() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../drizzle/0000_universes.sql', import.meta.url), 'utf8'));
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
    assert.match(landing, /Дүйсенбіге дейін/);
    assert.match(await call('/universes/'), /One life\./);
    const chunk = landing.match(/src="(\/_next\/[^"]+\.js)"/)[1];
    assert.ok((await call(chunk)).length > 100);
    assert.match(await call('/legacy/'), /Басқа жолды таңдасаң/);
    assert.deepEqual(await call('/api/status'), { ai: false, storage: true });
    assert.deepEqual((await call('/api/scenarios')).map((scenario) => scenario.paths.length), [3, 3, 3]);
    const profile = await call('/api/profiles', 'POST', {
      name: 'Avery', age: 29, avatar: 'dawn', goal: 'Explore a decision', situation: 'At work', category: 'career',
    }, 201);
    const game = await call('/api/sessions', 'POST', { profile_id: profile.id, scenario_id: 'career' }, 201);
    const session = `/api/sessions/${game.id}`;
    const source = (await call(session + '/branches', 'POST', { path_id: 'business' })).active_id;
    const path = (id) => `${session}/branches/${id}`;
    await call(path(source) + '/npcs/emma/messages', 'POST', { scene_index: 0, text: 'What is your goal?' });
    await call(path(source) + '/choices', 'POST', { scene_index: 0, choice_id: '0' });
    const before = await call(path(source) + '/npcs/emma/messages', 'POST', { scene_index: 1, text: 'Do you remember earlier?' });
    const original = before.branches.find((branch) => branch.id === source);
    assert.match(original.npcs.emma.messages.at(-1).text, /small paid pilot/);
    const fork = await call(session + '/branches', 'POST', { parent_id: source, checkpoint: 0 });
    const forkId = fork.active_id;
    assert.equal(fork.branches.find((branch) => branch.id === forkId).npcs.emma.messages.length, 2);
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
    await call(session, 'GET', undefined, 404, crypto.randomUUID());
    await call(session + '/reflection', 'PUT', { priorities: ['Independence'] });
    await call(session + '/experiment', 'PUT', { checked: [0], status: 'active' });
    assert.deepEqual((await call(session)).experiment.checked, [0]);
    await call(session, 'DELETE', undefined, 204);
    assert.deepEqual(await call('/api/sessions'), []);
    assert.deepEqual(await call('/api/profiles'), []);
  } finally {
    db.close();
  }
});
