import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

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

const publicHtmlFiles = ['index.html','records/index.html','album/index.html','guestbook.html','about.html','all/view.html'];
for (const file of publicHtmlFiles) {
  const source = await read(file);
  check(source.includes('/js/maintenance-gate.js'), `${file} does not load the maintenance gate`);
}
for (const file of ['page-view.html','posts/index.html','daily/index.html','all/index.html']) {
  const source = await read(file);
  check(source.includes('http-equiv="refresh"') && source.includes('url=/#'), `${file} must redirect to the health-gated feed`);
}
for (const file of ['posts/view.html','daily/view.html']) {
  const source = await read(file);
  check(source.includes('redirect'), `${file} must resolve old record URLs instead of running a removed viewer`);
}
const nasajabRedirect = await read('nasajab/index.html');
check(nasajabRedirect.includes('location.hash') && nasajabRedirect.includes('/#record/') && nasajabRedirect.includes('encodeURIComponent'), 'nasajab old hashes must preserve their individual record identity');
const nasajabScript = nasajabRedirect.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
for (const [hash, expected] of [['', '/#nasajab'], ['#abc123', '/#record/nasajab%3Aabc123'], ['#nasa%20item', '/#record/nasajab%3Anasa%20item'], ['#%broken', '/#nasajab']]) {
  let target; const link = {};
  vm.runInNewContext(nasajabScript, {decodeURIComponent, encodeURIComponent, location:{hash,replace:value=>target=value}, document:{getElementById:()=>link}});
  check(target === expected && link.href === expected, `nasajab legacy fragment ${hash} must resolve safely`);
}

for (const file of ['programs/index.html','programs/view.html','askme.html']) {
  const source = await read(file);
  check(source.includes('서비스는 종료') && source.includes('noindex'), `${file} must remain an independent retired-service notice`);
  check(!source.includes('maintenance-gate.js'), `${file} retired notice must not depend on a healthy backend`);
}

if (failures.length > 0) {
  console.error(`Maintenance QA failed (${failures.length}/${assertions})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Maintenance QA passed (${assertions} assertions).`);
