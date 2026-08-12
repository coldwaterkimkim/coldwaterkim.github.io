import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const post = read('posts/view.html');
const daily = read('daily/view.html');
const server = read('deploy/imac/pocketbase-custom/seo_renderer.go');
const caddy = read('deploy/imac/Caddyfile');
const robots = read('public/robots.txt');

assert.match(post, /data-legacy-viewer/);
assert.match(daily, /data-legacy-viewer/);
assert.match(post, /CWK:SSR_CONTENT_START/);
assert.match(daily, /CWK:SSR_CONTENT_START/);
assert.match(server, /status='published'/);
assert.match(server, /BlogPosting/);
assert.match(server, /twitter:title/);
assert.match(server, /\/sitemap\.xml/);
assert.ok(!server.includes('User-Agent') && !server.includes('Googlebot'), 'all visitors and bots must receive the same public HTML');
assert.match(caddy, /handle \/posts\/\*\//);
assert.match(caddy, /handle \/daily\/\*\//);
assert.match(robots, /User-agent: \*/);
assert.match(robots, /Allow: \//);
assert.match(robots, /Sitemap: https:\/\/coldwaterkim\.com\/sitemap\.xml/);

console.log('SEO QA passed: 14 assertions');
