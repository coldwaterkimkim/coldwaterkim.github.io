import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASK_ME_PENDING_COPY,
  ASK_ME_PRIVATE_COPY,
  askMeEntryBody,
  askMePageItems,
} from '../js/askme-logic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const html = read('askme.html');
const pageScript = read('js/askme.js');
const css = read('css/askme.css');
const schema = JSON.parse(read('pb_schema.json'));
const serverSource = read('deploy/imac/pocketbase-custom/ask_me.go');
const migrationName = fs.readdirSync(path.join(root, 'pb_migrations'))
  .find(name => name.endsWith('.js') && read(path.join('pb_migrations', name)).includes('ask_question_feed'));
assert.ok(migrationName, 'Ask Me migration must create the public feed');
const migration = read(path.join('pb_migrations', migrationName));
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

check(html.includes('궁금한 게 있다면 남겨주세요. 답변은 제가 하고 싶은 것만 할겁니다ㅋ'), 'agreed Ask Me introduction copy is missing');
check(html.includes('id="askMeQuestion"'), 'question textarea is missing');
check(html.includes('id="askMePrivate"'), 'optional private checkbox is missing');
check(!/닉네임|이메일|카테고리|첨부파일/.test(html), 'minimal form must not add optional visitor fields');
check(!html.includes('>궁금한 것<'), 'question field must not have a visible label');
check(html.includes('aria-label="질문"'), 'unlabelled textarea still needs an accessible name');
check(html.includes('/js/maintenance-gate.js'), 'Ask Me must participate in maintenance recovery');
check(html.includes('class="entry-gate-disabled"'), 'Ask Me must preserve the disabled entry gate contract');
check(css.includes('.askme-form-controls'), 'minimal Ask Me form styles are missing');
check(css.includes('@media (max-width: 640px)'), 'Ask Me mobile styles are missing');

check(askMeEntryBody({ status: 'pending', question: 'secret' }) === ASK_ME_PENDING_COPY, 'pending question must render only the waiting copy');
check(askMeEntryBody({ status: 'private', question: 'secret' }) === ASK_ME_PRIVATE_COPY, 'private question must render only the privacy copy');
check(askMeEntryBody({ status: 'answered', question: '공개 질문' }) === '공개 질문', 'answered public question must render its actual text');
assert.deepEqual(askMePageItems(1, 3), [1, 2, 3], 'short archive uses direct page numbers');
assert.deepEqual(askMePageItems(6, 12), [1, 4, 5, 6, 7, 8, 12], 'long archive keeps bounded page links');
assertions += 2;

check(pageScript.includes("sort: '-sequence'"), 'question feed must stay in newest-question-first sequence order');
check(!/sort:\s*['"]-answered_at/.test(pageScript), 'answer time must never reorder questions');
check(pageScript.includes("pb.send('/api/cwk/ask/questions'"), 'visitor submission must use the protected custom endpoint');
check(pageScript.includes("pb.collection('ask_question_feed')"), 'visitors must read only the redacted public view');
check(pageScript.includes("pb.collection('ask_questions')"), 'OWNER must read and answer from the private source collection');
check(pageScript.includes('answered_at: new Date().toISOString()'), 'OWNER answer save must include its timestamp');
check(pageScript.includes('다음 ▶'), 'retro next-page control is missing');

const collections = new Map(schema.collections.map(collection => [collection.name, collection]));
const questions = collections.get('ask_questions');
const counters = collections.get('ask_question_counters');
const feed = collections.get('ask_question_feed');
check(Boolean(questions && counters && feed), 'schema must include private questions, counter, and public feed');
check(questions.listRule === "@request.auth.id != ''" && questions.viewRule === "@request.auth.id != ''", 'raw questions must be OWNER-only');
check(questions.createRule === null, 'visitors must not bypass the custom submission endpoint');
check(counters.listRule === null && counters.viewRule === null, 'counter must not be publicly readable');
check(feed.listRule === '' && feed.viewRule === '', 'redacted feed must be publicly readable');
check(/\b(case|iif)\b/i.test(migration) && migration.includes('ask_question_feed'), 'public feed must redact with a SQL projection');
check(/trim\s*\(\s*coalesce/i.test(migration), 'answer publication must require nonblank text');
check(migration.includes('CREATE UNIQUE INDEX') && migration.includes('sequence'), 'question sequence needs a unique database index');
check(serverSource.includes('/api/cwk/ask/questions'), 'custom Ask Me POST route is missing');
check(serverSource.includes('RunInTransaction'), 'sequence allocation and question save must be transactional');
for (const label of [
  '너무 일찍 깬',
  '정신 차리는',
  '배고픈',
  '딴짓 중인',
  '할 말 생긴',
  '오늘이 아쉬운',
  '잠 안 자는',
  '진짜 안 자는',
]) {
  check(serverSource.includes(label), `${label} time-band nickname is missing`);
}

const navFiles = [
  'index.html',
  'about.html',
  'guestbook.html',
  'askme.html',
  'all/index.html',
  'all/view.html',
  'posts/index.html',
  'posts/view.html',
  'daily/index.html',
  'daily/view.html',
  'album/index.html',
  'programs/index.html',
  'programs/view.html',
  'nasajab/index.html',
];
for (const file of navFiles) {
  check(read(file).includes('>Ask Me</a>'), `${file} navigation is missing Ask Me`);
}
check((read('index.html').match(/>Ask Me<\/a>/g) || []).length === 1, 'home must receive only the navigation link, not an Ask Me preview');

console.log(`Ask Me QA passed (${assertions} assertions).`);
