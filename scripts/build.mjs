import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const fileTypes = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8', '.jpg': 'image/jpeg', '.txt': 'text/plain;charset=utf-8',
  '.json': 'application/json;charset=utf-8', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

async function files(directory, prefix = '') {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) found.push(...await files(new URL(`${entry.name}/`, directory), path + '/'));
    else found.push(path);
  }
  return found;
}

async function packAssets(directory, paths, prefix) {
  return Promise.all(paths.map(async (file) => {
    const type = fileTypes[extname(file)] ?? 'application/octet-stream';
    const data = await readFile(new URL(file, directory));
    return [prefix + file, { type, packed: gzipSync(data).toString('base64') }];
  }));
}

const frontend = new URL('frontend/out/', root);
const assets = [
  ...await packAssets(frontend, await files(frontend), '/'),
  ...await packAssets(new URL('public/', root), ['index.html', 'game.js', 'scenarios.js', 'style.css', 'hero.jpg'], '/legacy/'),
];
const catalog = JSON.parse(await readFile(new URL('backend/app/scenarios/catalog.json', root), 'utf8'));
const opportunities = JSON.parse(await readFile(new URL('backend/app/scenarios/opportunities.json', root), 'utf8'));
const aftermaths = JSON.parse(await readFile(new URL('backend/app/scenarios/aftermaths.json', root), 'utf8'));
const decisionLab = JSON.parse(await readFile(new URL('backend/app/scenarios/decision-lab.json', root), 'utf8'));
for (const scenario of catalog) {
  Object.assign(scenario, decisionLab[scenario.id]);
  for (const path of scenario.paths) path.beats.push({ when: 'Year 3', ...aftermaths[scenario.id][path.id] });
}
const source = async (file) => (await readFile(new URL(file, root), 'utf8')).replace(/^import .*;\r?\n/gm, '');
const policy = JSON.parse(await readFile(new URL('backend/app/services/ai-policy.json', root), 'utf8'));
const localePolicy = JSON.parse(await readFile(new URL('backend/app/services/locale-policy.json', root), 'utf8'));
const kk = JSON.parse(await readFile(new URL('backend/app/scenarios/kk.json', root), 'utf8'));
const ru = JSON.parse(await readFile(new URL('backend/app/scenarios/ru.json', root), 'utf8'));
const worker = `
const catalog = ${JSON.stringify(catalog)};
const opportunities = ${JSON.stringify(opportunities)};
const policy = ${JSON.stringify(policy)};
const localePolicy = ${JSON.stringify(localePolicy)};
const kk = ${JSON.stringify(kk)};
const ru = ${JSON.stringify(ru)};
${await source('server/ai.js')}
${await source('server/sites-api.js')}
const assets = new Map(${JSON.stringify(assets)});
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleApi(request, env, pathname);
    if (pathname === '/legacy') return new Response(null, { status: 308, headers: { Location: '/legacy/' } });
    if (pathname === '/legacy/api/status') return Response.json({ ai: false, character: false });
    // Next percent-encodes bracketed segments in emitted JS and static export asset URLs.
    let assetPath;
    try { assetPath = decodeURIComponent(pathname); }
    catch { return new Response('Not found', { status: 404 }); }
    const asset = assets.get(assetPath.endsWith('/') ? assetPath + 'index.html' : assetPath) ??
      (['/en', '/kk', '/ru'].includes(assetPath) ? assets.get(assetPath + '/index.html') : undefined);
    if (!asset) return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    const body = request.method === 'HEAD' ? null : new Blob([
      Uint8Array.from(atob(asset.packed), char => char.charCodeAt(0)),
    ]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(body, {
      headers: {
        'Content-Type': asset.type,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': pathname.startsWith('/_next/static/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      },
    });
  },
};
`;
await mkdir(new URL('dist/server/', root), { recursive: true });
await writeFile(new URL('dist/server/index.js', root), worker);
