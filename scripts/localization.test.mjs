import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const scenarios = (name) => JSON.parse(read(`backend/app/scenarios/${name}.json`));
const strings = (value) => typeof value === 'string' ? [value] : Array.isArray(value) ? value.flatMap(strings)
  : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

test('all authored scenes, choices, NPC text and ending fields have Kazakh and Russian translations', () => {
  const catalog = scenarios('catalog'), after = scenarios('aftermaths'), lab = scenarios('decision-lab'),
    opportunities = scenarios('opportunities');
  const visible = new Set(['Year 3']);
  function add(...values) { strings(values).forEach((text) => visible.add(text)); }
  function beat({ title, when, location, body, choices }) {
    add(title, when, location, body, choices.map(([label, , outcome]) => [label, outcome]));
  }
  let endingCount = 0;
  for (const s of catalog) {
    add(s.title, s.subtitle, s.setting, s.intro, s.priorities, s.question, s.experiment, lab[s.id]);
    const [label, , outcome] = opportunities[s.id];
    add(label, outcome);
    assert.equal(s.paths.length, 3);
    for (const { id, name, avatar, ...npcText } of s.npcs) add(npcText);
    for (const p of s.paths) {
      add(p.title, p.short, p.description, p.endings);
      [...p.beats, after[s.id][p.id]].forEach(beat);
      assert.equal(p.beats.length + 1, 5);
      endingCount += p.endings.length;
    }
  }
  assert.equal(endingCount, 18);
  for (const lang of ['kk', 'ru']) {
    const translations = scenarios(lang);
    assert.deepEqual(Object.keys(translations).filter((key) => !visible.has(key)), []);
    const missing = [...visible].filter((key) => !translations[key] || translations[key] === key || !/\p{Script=Cyrillic}/u.test(translations[key]));
    assert.deepEqual(missing, [], `${lang} missing or untranslated authored strings`);
  }
});

test('shared UI translations preserve all interpolation fields', () => {
  const ui = JSON.parse(read('frontend/messages/ui.json'));
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, key]) => key).sort();
  for (const [key, translations] of Object.entries(ui)) for (const lang of ['kk', 'ru']) {
    const text = translations[lang];
    assert.ok(text && /\p{Script=Cyrillic}/u.test(text), `${lang}: ${key}`);
    assert.deepEqual(placeholders(text), placeholders(key), `${lang}: ${key}`);
  }
});
