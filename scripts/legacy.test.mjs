import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { scenarios } from '../public/scenarios.js';

const gameCode = readFileSync(new URL('../public/game.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/, '');

function browser(initialSave, initialHistory) {
  let data = initialSave;
  let now = 1000;
  const handlers = new Map();
  const heading = { focus() {} };
  const app = { innerHTML: '', querySelector: () => heading, querySelectorAll: () => [], addEventListener() {} };
  const history = {
    state: initialHistory,
    pushState(state) { this.state = state; },
    replaceState(state) { this.state = state; },
  };
  const document = {
    querySelector: (selector) => selector === '#app' ? app : null,
    addEventListener: (type, handler) => handlers.set(type, handler),
  };
  const window = {
    location: new URL('https://parallel.example/legacy/'), scrollTo() {},
    addEventListener: document.addEventListener,
  };
  runInNewContext(gameCode, {
    scenarios, document, window, history, URL, performance: { now: () => now },
    fetch: async () => ({ ok: false }),
    localStorage: { getItem: () => data, setItem: (_, saved) => { data = saved; } },
  });
  function button(action, value, isConnected = true) {
    const target = { dataset: { action, value }, isConnected, disabled: false };
    return { ...target, closest: () => target };
  }
  return {
    click: (action, value, detail = 0, connected = true) =>
      handlers.get('click')({ target: button(action, value, connected), detail }),
    repeatedEnter(action, value) {
      let prevented = false;
      handlers.get('keydown')({ target: button(action, value), key: 'Enter', repeat: true,
        preventDefault: () => { prevented = true; } });
      return prevented;
    },
    select: (side, id) => handlers.get('change')({ target: { dataset: { compareSide: String(side) }, value: id } }),
    advance: () => { now += 500; },
    html: () => app.innerHTML,
    state: () => JSON.parse(data),
    entry: () => history.state,
    restore: (state) => handlers.get('popstate')({ state }),
    refresh: () => browser(data, history.state),
  };
}

test('a rapid second click or stale choice cannot end the Relationship story', () => {
  const game = browser();
  const route = scenarios.find(({ id }) => id === 'relationship').routes.find(({ label }) => label === 'Бірге көшу');
  game.click('open', 'relationship');
  game.click('start');
  game.click('route', route.id, 1);
  game.click('choice', '0', 2);
  game.click('choice', '0', 1); // Browsers may reset the click count when the original button disappears.
  game.click('choice', '0', 0, false);
  assert.equal(game.state().location.view, 'scene');
  assert.deepEqual(game.state().games.relationship.endings, {});
  assert.ok(game.repeatedEnter('choice', '0'));
  game.advance();
  game.click('choice', '0', 0); // Normal keyboard activation.
  assert.equal(game.state().location.view, 'ending');
  assert.deepEqual(game.state().games.relationship.endings, { [route.id]: [0] });
});

test('migrates unversioned saves and recovers corrupt routes, indices, scenes and schema versions', () => {
  const old = browser(JSON.stringify({ career: { started: true, routeId: 'retired', choice: 99,
    endings: { launch: [0, 0, -1, '1', 999], pilot: null, retired: [0] }, comparison: { launch: 0, retired: 0 } } }));
  assert.equal(old.state().version, 2);
  assert.deepEqual(old.state().games.career.endings, { launch: [0] });
  assert.deepEqual(old.state().games.career.comparison, ['launch:0']);
  old.click('open', 'career');
  assert.equal(old.state().location.view, 'crossroad');

  const stored = old.state();
  stored.location = { view: 'compare', scenarioId: 'career', routeId: 'launch', choice: 1 };
  stored.games.career.routeId = 'launch';
  stored.games.career.choice = 1;
  const recovered = browser(JSON.stringify(stored));
  assert.equal(recovered.state().location.view, 'scene');
  assert.deepEqual(recovered.state().games.career.endings, { launch: [0] });
  assert.doesNotMatch(recovered.html(), /comparison-grid/);
  stored.version = 999;
  const unknown = browser(JSON.stringify(stored));
  assert.equal(unknown.state().location.view, 'home');
  assert.deepEqual(unknown.state().games.career.endings, { launch: [0] });
  assert.equal(browser('{').state().location.view, 'home');
});

test('all Kazakh endings record actual decisions and retain each explored path on refresh and Back', () => {
  let game = browser();
  let total = 0;
  for (const scenario of scenarios) {
    game.click('open', scenario.id);
    game.click('start');
    for (const route of scenario.routes) {
      for (const [index, [label, title]] of route.choices.entries()) {
        game.click('route', route.id);
        const prior = game.entry();
        game = game.refresh();
        assert.ok(game.html().includes(route.title));
        game.click('choice', String(index));
        game = game.refresh();
        assert.ok(game.html().includes(title));
        assert.ok(game.html().includes(`<li>${route.label}</li>`));
        assert.ok(game.html().includes(`<li>${label}</li>`));
        game.restore(prior);
        assert.equal(game.state().location.view, 'scene');
        assert.ok(game.state().games[scenario.id].endings[route.id].includes(index));
        total++;
      }
    }
    game.click('home');
  }
  assert.equal(total, 14);
  assert.equal(Object.keys(game.state().games).length, 3);
});

test('comparison permits both endings from the same choice, excludes locked endings and saves selection order', () => {
  let game = browser();
  game.click('open', 'career');
  game.click('start');
  for (const index of [0, 1]) {
    game.click('route', 'launch');
    game.click('choice', String(index));
  }
  game.click('compare');
  assert.equal((game.html().match(/data-compare-side=/g) ?? []).length, 2);
  assert.equal((game.html().match(/<option /g) ?? []).length, 4);
  assert.match(game.html(), /Таңғы жеткізу/);
  game.select(0, 'launch:0');
  game.select(1, 'pilot:0');
  game = game.refresh();
  assert.deepEqual(game.state().games.career.comparison, ['launch:0', 'launch:1']);
  assert.equal(game.state().location.view, 'compare');
});
