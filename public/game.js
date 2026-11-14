import { scenarios } from './scenarios.js';

const app = document.querySelector('#app');
const storageKey = 'parallel-life-v1';
const saveVersion = 2;
const priorities = ['Тұрақтылық', 'Еркіндік', 'Өсу', 'Жақындық', 'Бос уақыт'];
const icons = { career: '↗', study: '✦', relationship: '∞' };
const cardNotes = {
  career: 'Тұрақты жұмыс пен өз ісіңнің арасында.',
  study: 'Жаңа елдегі білім немесе үйдегі мүмкіндік.',
  relationship: 'Ортақ жоспарлар мен екі түрлі қала.',
};

function readSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (!isRecord(saved)) return {};
    if (!Object.hasOwn(saved, 'version')) return { games: saved, legacy: true };
    return { games: saved.games, location: saved.version === saveVersion ? saved.location : null };
  } catch {
    return {};
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validChoice(route, index) {
  return Number.isInteger(index) && index >= 0 && index < (route?.choices.length ?? 0);
}

function unlockedEndings(item, progress) {
  return item.routes.flatMap((route) => (progress.endings[route.id] ?? []).map((index) =>
    ({ id: `${route.id}:${index}`, route, index })));
}

function recoverGame(item, raw, legacy) {
  const recovered = blankGame();
  if (!isRecord(raw)) return recovered;
  const route = item.routes.find(({ id }) => id === raw.routeId);
  recovered.started = raw.started === true;
  recovered.routeId = route?.id ?? null;
  recovered.choice = validChoice(route, raw.choice) ? raw.choice : null;
  const textKeys = ['intro'];
  for (const route of item.routes) {
    const saved = raw.endings?.[route.id];
    const indices = Array.isArray(saved) ? saved.filter((index) => validChoice(route, index)) : [];
    if (legacy && route.id === recovered.routeId && recovered.choice !== null) indices.push(recovered.choice);
    if (indices.length) recovered.endings[route.id] = [...new Set(indices)];
    textKeys.push(route.id, ...route.choices.map((_, index) => `${route.id}:${index}`));
  }
  if (!recovered.endings[recovered.routeId]?.includes(recovered.choice)) recovered.choice = null;
  recovered.started ||= Boolean(route || Object.keys(recovered.endings).length);
  for (const id of textKeys) {
    if (typeof raw.texts?.[id] === 'string') recovered.texts[id] = raw.texts[id];
  }
  const unlocked = unlockedEndings(item, recovered);
  const selected = Array.isArray(raw.comparison) ? raw.comparison : item.routes.map((route) =>
    `${route.id}:${raw.comparison?.[route.id]}`);
  recovered.comparison = [...new Set(selected.filter((id) => unlocked.some((entry) => entry.id === id)))].slice(0, 2);
  recovered.context = typeof raw.context === 'string' ? raw.context.slice(0, 300) : '';
  recovered.step = typeof raw.step === 'string' ? raw.step.slice(0, 300) : '';
  recovered.priority = priorities.includes(raw.priority) ? raw.priority : '';
  recovered.passport = raw.passport === true && Boolean(recovered.priority);
  if (Number.isInteger(raw.character?.age) && raw.character.age >= 18 && raw.character.age <= 120) {
    recovered.character = { age: raw.character.age, name: typeof raw.character.name === 'string' ? raw.character.name : '' };
  }
  return recovered;
}

const saved = readSave();
const games = Object.fromEntries(scenarios.filter((item) => isRecord(saved.games?.[item.id]))
  .map((item) => [item.id, recoverGame(item, saved.games[item.id], saved.legacy)]));
let scenario;
let game;
let view = 'home';
let pending = 0;
let busy = false;
let passportNotice = '';
let capabilities = {};
let pointerBlockedUntil = 0;

const api = (path) => new URL(`./api/${path}`, window.location.href);
fetch(api('status'))
  .then((response) => response.ok ? response.json() : {})
  .then((status) => {
    capabilities = { ai: status?.ai === true, character: status?.character === true };
    document.querySelector('#story-mode').textContent = capabilities.ai
      ? 'Интерактивті көркем оқиға' : 'Демо режимі · авторлық оқиға';
    if (view === 'setup' && !busy && document.activeElement?.tagName !== 'TEXTAREA') render();
  })
  .catch(() => {});

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: saveVersion, games, location: locationState() }));
  } catch {
    // Progress is still available in memory during this visit.
  }
}

function escape(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function action(label, key, value = '', style = 'primary') {
  return `<button type="button" class="button ${style}" data-action="${key}" data-value="${escape(value)}">${escape(label)}</button>`;
}

function blankGame() {
  return {
    started: false, context: '', routeId: null, choice: null,
    endings: {}, comparison: [], texts: {}, priority: '', step: '', passport: false, character: null,
  };
}

function currentRoute() {
  return scenario.routes.find((route) => route.id === game.routeId);
}

function openScenario(id) {
  scenario = scenarios.find((item) => item.id === id);
  if (!scenario) return;
  game = games[id] ??= blankGame();
  view = !game.started ? 'setup' : game.choice !== null ? 'ending' : game.routeId ? 'scene' : 'crossroad';
}

function locationState() {
  if (view === 'home') return { view };
  return { view, scenarioId: scenario.id, routeId: game.routeId, choice: game.choice };
}

function restoreLocation(location) {
  const item = scenarios.find(({ id }) => id === location?.scenarioId);
  if (location?.view === 'home' || !item || !games[item.id]) {
    view = 'home';
    scenario = game = undefined;
    return;
  }
  openScenario(item.id);
  const route = item.routes.find(({ id }) => id === location.routeId);
  const ending = validChoice(route, location.choice) && game.endings[route.id]?.includes(location.choice);
  switch (location.view) {
    case 'setup':
      view = 'setup';
      break;
    case 'crossroad':
      if (!game.started) break;
      view = 'crossroad';
      game.routeId = game.choice = null;
      break;
    case 'scene':
    case 'ending':
    case 'compare':
      if (!game.started || !route) break;
      game.routeId = route.id;
      game.choice = ending && location.view !== 'scene' ? location.choice : null;
      view = game.choice === null ? 'scene' : 'ending';
      if (view === 'ending' && location.view === 'compare' && unlockedEndings(item, game).length >= 2) view = 'compare';
      break;
  }
}

function map() {
  return `<aside class="map" aria-label="Өмір жолдарының картасы">
    <h2>Өмір жолдары</h2>
    <div class="map-root"><span></span> Бастапқы таңдау</div>
    <ol>${scenario.routes.map((route) => {
      const done = game.endings[route.id]?.length;
      const active = route.id === game.routeId;
      const status = done ? `Ашылған финал: ${done}/2` : active ? 'Ойналып жатыр' : 'Зерттелмеген';
      return `<li class="${active ? 'active' : ''} ${done ? 'complete' : ''}">
        <button data-action="route" data-value="${route.id}" type="button" ${view === 'setup' ? 'disabled' : ''}>
          <span>${route.short}</span><small>${status}</small>
        </button>
      </li>`;
    }).join('')}</ol>
  </aside>`;
}

function home() {
  return `<section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">Интерактивті көркем ойын</p>
      <h1>Басқа жолды<br>таңдасаң <em>ше?</em></h1>
      <p class="hero-description">Бір шешімнен бірнеше өмір басталады. Өз жолыңды таңда, оқиғаны ойнап шық және балама финалдарды салыстыр.</p>
      <a href="#scenarios" class="button primary">Сценарий таңдау <span aria-hidden="true">↓</span></a>
    </div>
    <div class="hero-photo" role="img" aria-label="Екіге айырылған жолға қарап тұрған адам"></div>
  </section>
  <section id="scenarios" class="catalog" aria-labelledby="catalog-title">
    <h2 id="catalog-title">Қай жағдайды ойнап көресің?</h2>
    <div class="catalog-grid">${scenarios.map((item) => `
      <button type="button" class="scenario-card ${item.id}" data-action="open" data-value="${item.id}">
        <span class="card-top"><span class="card-icon" aria-hidden="true">${icons[item.id]}</span><span aria-hidden="true">↗</span></span>
        <span class="category">${item.category}</span>
        <strong>${item.question}</strong>
        <span class="card-note">${cardNotes[item.id]}</span>
        <span class="card-action">${games[item.id]?.started ? 'Жалғастыру' : 'Бастау'} <span aria-hidden="true">→</span></span>
      </button>`).join('')}</div>
  </section>`;
}

function setup() {
  return `<p class="eyebrow">${scenario.category}</p><h1>${scenario.question}</h1>
    <p class="story">${scenario.intro}</p>
    ${capabilities.ai ? `<label class="field">Өз жағдайыңнан бір деталь қос <span>(міндетті емес)</span>
      <textarea id="context" maxlength="300" placeholder="Мысалы, маған демалыс күндерін бос қалдыру маңызды.">${escape(game.context)}</textarea>
      <small>Осы мәтін көріністі бейімдеу үшін OpenAI-ға жіберіледі.</small>
    </label>` : ''}
    <div class="actions">
      ${action('Оқиғаны бастау', 'start')}
      ${capabilities.character ? action('1in8b кейіпкерін алу', 'character', '', 'secondary') : ''}
    </div>`;
}

function bodyFor(key, fallback) {
  if (busy) return `<p class="story" role="status">Көрініс дайындалып жатыр…</p>`;
  return `<p class="story">${escape(game.texts[key] || fallback)}</p>`;
}

function crossroad() {
  return `<p class="eyebrow">Бүгін</p><h1>${scenario.question}</h1>
    ${game.character ? `<p class="character">${game.character.name ? `${escape(game.character.name)} · ` : ''}${escape(game.character.age)} жастағы ойдан шығарылған кейіпкер.
      <a href="https://1in8b.life/en/api/" target="_blank" rel="noopener">1in8b Engine (1in8b.life)</a></p>` : ''}
    ${bodyFor('intro', scenario.intro)}
    <div class="choices">${scenario.routes.map((route) => action(route.label, 'route', route.id, 'choice')).join('')}</div>`;
}

function scene() {
  const route = currentRoute();
  return `<p class="eyebrow">Бір жылдан кейін · ${route.short}</p><h1>${route.title}</h1>
    ${bodyFor(route.id, route.scene)}
    <div class="choices">${route.choices.map((choice, index) => action(choice[0], 'choice', index, 'choice')).join('')}</div>`;
}

function ending() {
  const route = currentRoute();
  const [, title, body, gain, cost] = route.choices[game.choice];
  const other = scenario.routes.find((item) => item.id !== route.id && !game.endings[item.id]?.length);
  return `<p class="eyebrow">Үш жылдан кейін · ${route.short}</p><h1>${title}</h1>
    ${bodyFor(`${route.id}:${game.choice}`, body)}
    ${decisions(route, game.choice)}
    <dl class="tradeoffs"><div><dt>Не ұттың?</dt><dd>${gain}</dd></div><div><dt>Не қиындады?</dt><dd>${cost}</dd></div></dl>
    <div class="actions">
      ${other ? action('Басқа өмірді ойнау', 'route', other.id) : ''}
      ${unlockedEndings(scenario, game).length >= 2 ? action('Финалдарды салыстыру', 'compare', '', other ? 'secondary' : 'primary') : ''}
      ${action('Бастапқы таңдауға оралу', 'crossroad', '', 'secondary')}
      ${action('Басқа бағытқа өту', 'home', '', 'secondary')}
    </div>`;
}

function decisions(route, index) {
  return `<section class="decision-summary"><h3>Сенің шешімдерің</h3><ol>
    <li>${escape(route.label)}</li><li>${escape(route.choices[index][0])}</li>
  </ol></section>`;
}

function comparisonPair() {
  const unlocked = unlockedEndings(scenario, game);
  const current = `${game.routeId}:${game.choice}`;
  const candidates = [...game.comparison, current, ...unlocked.map(({ id }) => id)];
  return [...new Set(candidates)].map((id) => unlocked.find((entry) => entry.id === id)).filter(Boolean).slice(0, 2);
}

function comparisonCard({ route, index, id }, side) {
  const [, title, body, gain, cost] = route.choices[index];
  return `<article class="comparison-card">
    <label class="field">${side === 0 ? 'Бірінші финал' : 'Екінші финал'} <select data-compare-side="${side}">
      ${unlockedEndings(scenario, game).map((entry) =>
        `<option value="${entry.id}" ${entry.id === id ? 'selected' : ''}>${escape(entry.route.choices[entry.index][1])}</option>`).join('')}
    </select></label>
    <h2>${title}</h2>
    <p>${escape(game.texts[id] || body)}</p>
    ${decisions(route, index)}
    <dl class="tradeoffs"><div><dt>Не ұттың?</dt><dd>${gain}</dd></div><div><dt>Не қиындады?</dt><dd>${cost}</dd></div></dl>
  </article>`;
}

function passport() {
  return `<section class="passport">
    <p class="eyebrow">Decision Passport</p>
    <h2>Осы оқиғаларда саған не маңызды болды?</h2>
    <form id="passport-form">
      <fieldset><legend>Бір басымдықты таңда</legend><div class="priority-list">
        ${priorities.map((value) => `<label><input type="radio" name="priority" value="${value}" ${game.priority === value ? 'checked' : ''} required><span>${value}</span></label>`).join('')}
      </div></fieldset>
      <label class="field">Осы аптада байқап көретін қадамың <span>(міндетті емес)</span>
        <textarea id="step" name="step" maxlength="300" rows="2">${escape(game.step)}</textarea>
      </label>
      <div class="suggestions">${scenario.experiments.map((value) => action(value, 'suggest', value, 'text-button')).join('')}</div>
      <div class="actions">
        <button class="button primary" type="submit">Карточканы сақтау</button>
        ${game.passport ? action('Карточканы жүктеу', 'download', '', 'secondary') : ''}
      </div>
      <p class="notice" role="status">${escape(passportNotice || (game.passport ? 'Карточка осы браузерде сақталған.' : ''))}</p>
    </form>
  </section>`;
}

function compare() {
  const [first, second] = comparisonPair();
  return `<p class="eyebrow">${scenario.category}</p><h1>Үш жылдан кейінгі өмірлер</h1>
    <div class="comparison-grid">${comparisonCard(first, 0)}${comparisonCard(second, 1)}</div>
    ${passport()}`;
}

function render(focus = false) {
  const restoreHeading = app.querySelector('h1') === document.activeElement;
  if (view === 'home') {
    app.innerHTML = home();
  } else {
    const screens = { setup, crossroad, scene, ending, compare };
    app.innerHTML = `<div class="play-layout ${view === 'compare' ? 'wide' : ''}" ${busy ? 'aria-busy="true"' : ''}>
      <div class="play-main">${screens[view]()}</div>${map()}</div>`;
    if (busy) app.querySelectorAll('button[data-action]').forEach((button) => {
      if (sceneActions.has(button.dataset.action)) button.disabled = true;
    });
  }
  if (focus || restoreHeading) {
    const heading = app.querySelector('h1');
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    if (focus) window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

function go(next) {
  pending++;
  busy = false;
  view = next;
  history.pushState({ parallelLife: locationState() }, '', window.location.pathname + window.location.search);
  save();
  render(true);
}

async function personalize(node) {
  if (!capabilities.ai || !game.context || game.texts[node]) return;
  const requestId = ++pending;
  busy = true;
  render();
  try {
    const response = await fetch(api('scene'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: scenario.id, node, context: game.context }),
      signal: AbortSignal.timeout(6000),
    });
    if (response.ok) {
      const result = await response.json();
      if (requestId === pending && typeof result.body === 'string') game.texts[node] = result.body;
    }
  } catch {
    // The authored scene is shown if personalization is unavailable.
  } finally {
    if (requestId === pending) {
      busy = false;
      save();
      render();
    }
  }
}

function start() {
  game.context = document.querySelector('#context')?.value.trim() ?? game.context;
  game.started = true;
  game.routeId = game.choice = null;
  go('crossroad');
  personalize('intro');
}

async function startWithCharacter(button) {
  const requestId = ++pending;
  button.disabled = true;
  button.textContent = 'Кейіпкер жүктеліп жатыр…';
  try {
    const response = await fetch(api('character'), { method: 'POST', signal: AbortSignal.timeout(5500) });
    if (response.ok) {
      const character = await response.json();
      if (requestId === pending) game.character = character;
    }
  } catch {
    // Continue with the scenario's character if the service is unavailable.
  }
  if (requestId === pending) start();
}

function downloadPassport() {
  const text = [
    'Parallel Life · Decision Passport', scenario.question, '',
    ...comparisonPair().map(({ route, index }) => {
      const [, title, , gain, cost] = route.choices[index];
      return `${route.short} · ${title}\n${route.label}\n${route.choices[index][0]}\nНе ұттым? ${gain}\nНе қиындады? ${cost}`;
    }),
    '', `Маған маңыздысы — ${game.priority}`, game.step ? `Келесі қадам — ${game.step}` : '',
  ].join('\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `parallel-life-${scenario.id}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const sceneActions = new Set(['open', 'start', 'character', 'crossroad', 'route', 'choice', 'compare']);

document.addEventListener('keydown', (event) => {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ') &&
      sceneActions.has(event.target.closest('button[data-action]')?.dataset.action)) {
    event.preventDefault();
  }
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button?.isConnected || button.disabled) return;
  const { action: key, value } = button.dataset;
  if (sceneActions.has(key)) {
    if (busy || event.detail > 1 || (event.detail > 0 && performance.now() < pointerBlockedUntil)) return;
    if (event.detail > 0) pointerBlockedUntil = performance.now() + 300;
  }
  switch (key) {
    case 'home': go('home'); break;
    case 'open':
      if (view !== 'home' || !scenarios.some(({ id }) => id === value)) return;
      openScenario(value);
      go(view);
      break;
    case 'start': if (view === 'setup') start(); break;
    case 'character': if (view === 'setup' && capabilities.character) startWithCharacter(button); break;
    case 'crossroad':
      game.routeId = null;
      game.choice = null;
      go('crossroad');
      break;
    case 'route':
      if (!game?.started || !scenario.routes.some((route) => route.id === value)) return;
      game.routeId = value;
      game.choice = null;
      go('scene');
      personalize(value);
      break;
    case 'choice': {
      const index = Number(value);
      const route = currentRoute();
      if (view !== 'scene' || !validChoice(route, index)) return;
      game.choice = index;
      const unlocked = game.endings[route.id] ??= [];
      if (!unlocked.includes(index)) unlocked.push(index);
      go('ending');
      personalize(`${route.id}:${index}`);
      break;
    }
    case 'compare':
      if (view !== 'ending' || unlockedEndings(scenario, game).length < 2) return;
      passportNotice = '';
      go('compare');
      break;
    case 'suggest': {
      const field = document.querySelector('#step');
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
      break;
    }
    case 'download': downloadPassport(); break;
  }
});

document.addEventListener('input', (event) => {
  const field = event.target;
  if (field.id === 'step') game.step = field.value;
  else if (field.name === 'priority') game.priority = field.value;
  else return;
  save();
});

document.addEventListener('change', (event) => {
  const field = event.target;
  if (view !== 'compare' || field.dataset.compareSide === undefined) return;
  const side = Number(field.dataset.compareSide);
  const pair = comparisonPair();
  if (![0, 1].includes(side) || !unlockedEndings(scenario, game).some(({ id }) => id === field.value)) return;
  game.comparison = pair.map(({ id }) => id);
  if (game.comparison[1 - side] === field.value) game.comparison[1 - side] = game.comparison[side];
  game.comparison[side] = field.value;
  save();
  render();
  app.querySelector(`select[data-compare-side="${side}"]`)?.focus();
});

app.addEventListener('submit', (event) => {
  if (event.target.id !== 'passport-form') return;
  event.preventDefault();
  const data = new FormData(event.target);
  game.priority = data.get('priority');
  game.step = data.get('step').trim();
  game.passport = true;
  passportNotice = 'Карточка сақталды.';
  save();
  render();
  app.querySelector('.notice')?.scrollIntoView({ block: 'nearest' });
});

window.addEventListener('popstate', (event) => {
  pending++;
  busy = false;
  restoreLocation(event.state?.parallelLife);
  save();
  render(true);
});

restoreLocation(history.state?.parallelLife ?? saved.location);
history.replaceState({ parallelLife: locationState() }, '');
save();
render();
