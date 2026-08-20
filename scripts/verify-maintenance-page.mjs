import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
const failures = [];
let assertions = 0;

function check(condition, message) {
  assertions += 1;
  if (!condition) failures.push(message);
}

const [html, css, pageScript, gateScript, caddyfile, packageJson] = await Promise.all([
  read('maintenance.html'),
  read('css/maintenance.css'),
  read('js/maintenance-page.js'),
  read('js/maintenance-gate.js'),
  read('deploy/imac/Caddyfile'),
  read('package.json'),
]);

check(html.includes('잠시 공사중입니다!'), 'maintenance title is missing');
check(html.includes('뚝딱뚝딱하는 중'), 'owner status copy is missing');
check(!html.includes('저장된 글과 사진은 안전합니다'), 'removed reassurance copy returned');
check(html.includes('maintenance-worker.gif'), 'repair animation is missing');
check(pageScript.includes('maintenance-worker-glare.gif'), 'glare reaction is missing');
check(pageScript.includes('거 참. 공사중이라니까여?'), 'first joke dialog is missing');
check(pageScript.includes('알겠어여...') || html.includes('알겠어여...'), 'dialog confirmation copy is missing');
check(pageScript.includes('recoveryIntervalMs = 5000'), 'automatic recovery polling is missing');
check(pageScript.includes('returnUrl.origin === window.location.origin'), 'same-origin recovery guard is missing');
check(gateScript.includes("fetch('/api/health'"), 'public health gate is missing');
check(gateScript.includes("window.location.replace(destination.href)"), 'maintenance redirect is missing');
check(css.includes('@media (max-width: 640px)'), 'mobile maintenance layout is missing');
check(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion fallback is missing');
check(caddyfile.includes('handle_errors'), 'Caddy error handler is missing');
check(caddyfile.includes('rewrite * /maintenance.html'), 'Caddy maintenance rewrite is missing');
check(JSON.parse(packageJson).scripts['qa:maintenance'], 'maintenance QA script is not registered');

const publicHtmlFiles = [
  'index.html',
  'posts/index.html',
  'posts/view.html',
  'daily/index.html',
  'daily/view.html',
  'album/index.html',
  'programs/index.html',
  'programs/view.html',
  'nasajab/index.html',
  'guestbook.html',
  'askme.html',
  'about.html',
];

for (const file of publicHtmlFiles) {
  const source = await read(file);
  check(source.includes('/js/maintenance-gate.js'), `${file} does not load the maintenance gate`);
}

if (failures.length > 0) {
  console.error(`Maintenance QA failed (${failures.length}/${assertions})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Maintenance QA passed (${assertions} assertions).`);
