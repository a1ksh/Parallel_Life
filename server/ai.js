import policy from '../backend/app/services/ai-policy.json' with { type: 'json' };
import localePolicy from '../backend/app/services/locale-policy.json' with { type: 'json' };
import kk from '../backend/app/scenarios/kk.json' with { type: 'json' };
import ru from '../backend/app/scenarios/ru.json' with { type: 'json' };

const storyText = { kk, ru };
export const validLocale = (locale) => typeof locale === 'string' && Object.hasOwn(localePolicy, locale);
export const narrationVariants = (saved = {}) => Object.hasOwn(saved, 'title') ? { en: saved } : saved;

export function scriptedReply(locale, npc, state, events, text) {
  const ui = localePolicy[locale];
  const t = (value) => storyText[locale]?.[value] ?? value;
  const prior = state.messages.findLast((item) => item.role === 'player');
  const event = events.at(-1)?.outcome;
  const fields = { message: prior?.text.slice(0, 120), followup: t(event ?? npc.support),
    event: event && t(event), support: t(npc.support), goal: t(npc.goal) };
  const fill = (key) => ui[key].replace(/\{(\w+)\}/g, (_, name) => fields[name] ?? '');
  if (new RegExp(ui.recall, 'iu').test(text) && (prior || event)) return fill(prior ? 'earlier' : 'witnessed');
  if (new RegExp(ui.goal, 'iu').test(text)) return fill('motivation');
  if (event && !prior) return `${t(event)} ${t(npc.support)}`;
  return t(prior || state.trust >= 65 ? npc.support : npc.voice);
}

export const aiNotices = {
  disabled: 'Demo mode: using the authored story.',
  rate_limited: 'Live AI is at its usage limit. You can keep playing with the scripted story.',
  unavailable: 'Live AI couldn’t respond. You can keep playing with the scripted story.',
};

export function aiEnabled(env) {
  return Boolean(env.OPENAI_API_KEY?.trim()) && env.PARALLEL_LIFE_AI_ENABLED !== '0';
}

const reserveSql = `WITH wanted(bucket, start, cap) AS (VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?))
  INSERT INTO ai_usage (bucket, window_start, calls)
  SELECT bucket, start, 1 FROM wanted
  WHERE NOT EXISTS (
    SELECT 1 FROM wanted AS w JOIN ai_usage AS u ON w.bucket = u.bucket
    WHERE u.window_start > w.start OR (u.window_start = w.start AND u.calls >= w.cap)
  )
  ON CONFLICT (bucket) DO UPDATE SET window_start = excluded.window_start,
    calls = CASE WHEN ai_usage.window_start = excluded.window_start THEN ai_usage.calls + 1 ELSE 1 END
  RETURNING bucket, calls`;

async function reserve(env, owner) {
  if (!aiEnabled(env)) return 'disabled';
  const seconds = Math.floor(Date.now() / 1000);
  const minute = seconds - seconds % 60;
  const day = seconds - seconds % 86400;
  const { guest_minute, global_minute, global_day } = policy.limits;
  try {
    const { results } = await env.DB.prepare(reserveSql)
      .bind(`guest:${owner}`, minute, guest_minute, 'global:minute', minute, global_minute, 'global:day', day, global_day).all();
    if (results.length !== 3) return 'rate_limited';
    if (results.some(({ bucket, calls }) => bucket === 'global:day' && calls === 1)) {
      try {
        await env.DB.prepare('DELETE FROM ai_usage WHERE window_start < ?').bind(day - 86400).run();
      } catch {
        console.info('parallel_life_ai', { result: 'usage_cleanup_failed' });
      }
    }
    return null;
  } catch {
    return 'unavailable';
  }
}

export function aiScene(scene) {
  const { index, title, body, when, location, npcs, last_event } = scene;
  return { index, title, body, when, location, npcs, last_event, choices: scene.choices.map(([label]) => label) };
}

export function aiConversation(messages, latest) {
  const recent = messages.slice(-6).map(({ role, text, locale = 'en' }) => ({ role, text, locale }));
  const terms = new Set(latest.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu));
  const older = messages.slice(0, -6).flatMap(({ role, text, locale = 'en' }, index) => role === 'player'
    ? [{ index, text, locale, score: [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu))].filter((term) => terms.has(term)).length }]
    : []);
  const selected = older.sort((a, b) => b.score - a.score || b.index - a.index).slice(0, 4).sort((a, b) => a.index - b.index);
  return { recent, earlier_player_statements: selected.map(({ text, locale }) => ({ text: [...text].slice(0, 160).join(''), locale })) };
}

function validateOutput(result, fields) {
  if (!result || typeof result !== 'object' || Array.isArray(result) ||
      Object.keys(result).length !== Object.keys(fields).length) return null;
  const data = {};
  for (const [field, [min, max]] of Object.entries(fields)) {
    if (!Object.hasOwn(result, field) || typeof result[field] !== 'string') return null;
    const value = result[field].trim();
    const length = [...value].length;
    if (length < min || length > max) return null;
    data[field] = value;
  }
  return data;
}

export async function generateAi(env, owner, kind, context, locale = 'en', translate = false) {
  const blocked = await reserve(env, owner);
  if (blocked) {
    console.info('parallel_life_ai', { kind, result: blocked });
    return { reason: blocked };
  }
  const { fields, tokens } = policy.outputs[kind];
  const start = Date.now();
  let status = 'invalid_output', data, usage;
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(policy.timeout_ms),
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_MODEL?.trim() || policy.model, store: false, max_output_tokens: tokens,
        instructions: `${policy.base_rules} Write all output in ${localePolicy[locale].language}. Conversation history can be multilingual. ${translate ? policy.translation : policy.instructions[kind]}`,
        input: JSON.stringify(context),
        text: { format: { type: 'json_schema', name: kind, strict: true,
          schema: { type: 'object', properties: Object.fromEntries(Object.keys(fields).map((field) => [field, { type: 'string' }])),
            required: Object.keys(fields), additionalProperties: false } } },
      }),
    });
    if (!response.ok) status = `http_${response.status}`;
    else {
      const result = await response.json();
      usage = result?.usage;
      const content = result?.status === 'completed' && Array.isArray(result.output)
        ? result.output.flatMap((item) => item?.type === 'message' && Array.isArray(item.content) ? item.content : [])
        : [];
      const texts = content.filter((item) => item?.type === 'output_text');
      if (texts.length === 1 && !content.some((item) => item?.type === 'refusal')) {
        data = validateOutput(JSON.parse(texts[0].text), fields);
        if (data) status = 'live';
      }
    }
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') status = 'timeout';
    else if (!(error instanceof SyntaxError)) status = 'transport_error';
  }
  console.info('parallel_life_ai', { kind, result: status, ms: Date.now() - start,
    input_tokens: Number.isInteger(usage?.input_tokens) ? usage.input_tokens : undefined,
    output_tokens: Number.isInteger(usage?.output_tokens) ? usage.output_tokens : undefined });
  return data ? { data } : { reason: 'unavailable' };
}
