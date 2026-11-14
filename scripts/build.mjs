import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { gzipSync } from 'node:zlib';

const root = new URL('../', import.meta.url);
const fileTypes = {
  '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8', '.jpg': 'image/jpeg', '.txt': 'text/plain;charset=utf-8',
  '.json': 'application/json;charset=utf-8', '.woff2': 'font/woff2',
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
const api = (await readFile(new URL('server/sites-api.js', root), 'utf8')).replace(/^import .*;\r?\n/, '');
const worker = `
const catalog = ${JSON.stringify(catalog)};
const opportunities = ${JSON.stringify(opportunities)};
${api}
const assets = new Map(${JSON.stringify(assets)});
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleApi(request, env, pathname);
    if (pathname === '/legacy') return new Response(null, { status: 308, headers: { Location: '/legacy/' } });
    if (pathname === '/legacy/api/status') return Response.json({ ai: false, character: false });
    const asset = assets.get(pathname.endsWith('/') ? pathname + 'index.html' : pathname);
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
