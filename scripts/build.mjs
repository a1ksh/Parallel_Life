import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const files = [
  ['/', 'index.html', 'text/html;charset=utf-8'],
  ['/style.css', 'style.css', 'text/css;charset=utf-8'],
  ['/game.js', 'game.js', 'text/javascript;charset=utf-8'],
  ['/scenarios.js', 'scenarios.js', 'text/javascript;charset=utf-8'],
  ['/hero.jpg', 'hero.jpg', 'image/jpeg'],
];

const assets = await Promise.all(files.map(async ([path, file, type]) => {
  const binary = type.startsWith('image/');
  const body = await readFile(new URL(`public/${file}`, root), binary ? 'base64' : 'utf8');
  return [path, { type, body, binary }];
}));
const scenarios = (await readFile(new URL('public/scenarios.js', root), 'utf8')).replace('export const scenarios', 'const scenarios');
const server = (await readFile(new URL('server/index.js', root), 'utf8'))
  .replace(/^import .*;\r?\n/, '').replace('export async function handleApi', 'async function handleApi');

const worker = `
${scenarios}
${server}
const assets = new Map(${JSON.stringify(assets)});
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return handleApi(request, env, pathname);
    const asset = assets.get(pathname === '/index.html' ? '/' : pathname);
    if (!asset) return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    const body = asset.binary ? Uint8Array.from(atob(asset.body), char => char.charCodeAt(0)) : asset.body;
    return new Response(request.method === 'HEAD' ? null : body, {
      headers: { 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff' },
    });
  },
};
`;

await mkdir(new URL('dist/server/', root), { recursive: true });
await writeFile(new URL('dist/server/index.js', root), worker);
