import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASK_ME_DELETED_COPY,
  ASK_ME_PENDING_COPY,
  ASK_ME_PRIVATE_COPY,
  askMeEntryBody,
  askMePageItems,
} from '../js/askme-logic.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const homeHtml = read('index.html');
const html = read('askme.html');
const pageScript = read('js/askme.js');
const css = read('css/askme.css');
const schema = JSON.parse(read('pb_schema.json'));
const serverSource = read('deploy/imac/pocketbase-custom/ask_me.go');
const migrations = fs.readdirSync(path.join(root, 'pb_migrations'))
  .filter(name => name.endsWith('.js'))
  .map(name => ({ name, source: read(path.join('pb_migrations', name)) }))
  .filter(({ source }) => /ask_questions|ask_question_feed/.test(source));
assert.ok(migrations.length >= 2, 'Ask Me must keep its initial and additive migrations');
const migrationSource = migrations.map(({ source }) => source).join('\n');
const createMigration = migrations.find(({ source }) => source.includes('name: "ask_questions"'))?.source || '';
const receiptMigration = migrations.find(({ source }) => source.includes('receipt_token_hash'))?.source || '';
assert.ok(createMigration, 'Ask Me initial collection migration is missing');
assert.ok(receiptMigration, 'Ask Me receipt/privacy additive migration is missing');
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
check(html.includes('<h1>???</h1>'), 'Ask Me page heading must use the agreed question-mark copy');
check(html.includes('placeholder="질문이 있다면"'), 'Ask Me page question placeholder is missing');
check(homeHtml.includes('placeholder="질문이 있다면"'), 'home question placeholder is missing');
check(!`${homeHtml}\n${html}`.includes('평소 궁금했지만 물어보지 못한 것'), 'retired question placeholder must not remain');
const recentTableAt = homeHtml.indexOf('id="recent-all-table"');
const homeAskMeAt = homeHtml.indexOf('class="home-recent-table home-askme-table"');
const albumTableAt = homeHtml.indexOf('id="recent-album-table"');
check(recentTableAt >= 0 && recentTableAt < homeAskMeAt && homeAskMeAt < albumTableAt, 'home Ask Me form must sit between the recent-post and album tables');
check(homeHtml.includes('<th align="left">Ask Me</th>'), 'home Ask Me table heading is missing');
check(homeHtml.includes('<a href="askme.html">질문 목록</a>'), 'home Ask Me list link is missing');
for (const [name, source] of [['Ask Me page', html], ['home', homeHtml]]) {
  check(source.includes('data-askme-password-fields hidden'), `${name} private password fields must start hidden`);
  check(source.includes('data-askme-password-confirm'), `${name} private form needs password confirmation`);
}
check(pageScript.includes("privateInput?.addEventListener('change', syncPrivateFields)"), 'private checkbox must toggle its password fields');
check(pageScript.includes('passwordFields.hidden = !enabled'), 'private password visibility must follow the checkbox');
check(pageScript.includes('password !== passwordConfirmation'), 'private passwords must be confirmed before submission');
const passwordInputs = [...`${homeHtml}\n${html}`.matchAll(/<input\b[^>]*type="password"[^>]*>/g)].map(match => match[0]);
check(passwordInputs.length >= 5, 'private create and lookup password controls are missing');
check(passwordInputs.every(input => !/\b(?:min|max|minlength|maxlength|pattern)\s*=/.test(input)), 'password inputs must not impose min, max, or pattern limits');
check(html.includes('/js/maintenance-gate.js'), 'Ask Me must participate in maintenance recovery');
check(html.includes('class="entry-gate-disabled"'), 'Ask Me must preserve the disabled entry gate contract');
check(css.includes('.askme-form-controls'), 'minimal Ask Me form styles are missing');
check(css.includes('@media (max-width: 640px)'), 'Ask Me mobile styles are missing');
check(css.includes('.home-askme-table td'), 'home Ask Me must use the same table-cell grammar as adjacent sections');
check(!css.includes('.home-askme {'), 'home Ask Me must not regress to a standalone card wrapper');
check(css.includes('border: 2px outset var(--cwk-border-soft);'), 'home submit button must keep its legacy bevel');
check(css.includes('.askme-form--home input[type="checkbox"]'), 'home private checkbox must use the compact legacy treatment');
check(css.includes('.askme-form--home .askme-status:empty'), 'empty home status must not reserve card-like whitespace');

check(ASK_ME_PENDING_COPY === '답변을 기다리고 있는 질문입니다. 답변 후 공개 예정입니다.', 'pending copy changed unexpectedly');
check(ASK_ME_DELETED_COPY === '주인장이 삭제한 질문입니다. 뭔가 마음에 안들었나보죠?', 'deleted copy changed unexpectedly');
check(askMeEntryBody({ status: 'pending', question: 'secret' }) === ASK_ME_PENDING_COPY, 'pending question must render only the waiting copy');
check(askMeEntryBody({ status: 'private', question: 'secret' }) === ASK_ME_PRIVATE_COPY, 'private question must render only the privacy copy');
check(askMeEntryBody({ status: 'answered', question: '공개 질문' }) === '공개 질문', 'answered public question must render its actual text');
assert.deepEqual(askMePageItems(1, 3), [1, 2, 3], 'short archive uses direct page numbers');
assert.deepEqual(askMePageItems(6, 12), [1, 4, 5, 6, 7, 8, 12], 'long archive keeps bounded page links');
assertions += 2;

check(pageScript.includes("sort: '-sequence'"), 'question feed must stay in newest-question-first sequence order');
check(!/sort:\s*['"]-answered_at/.test(pageScript), 'answer time must never reorder questions');
check(pageScript.includes('const PAGE_SIZE = 10'), 'question pagination must keep ten entries per page');
check(pageScript.includes("pb.send('/api/cwk/ask/questions'"), 'visitor submission must use the protected custom endpoint');
check(pageScript.includes("pb.collection('ask_question_feed')"), 'visitors must read only the redacted public view');
check(pageScript.includes("pb.collection('ask_questions')"), 'OWNER must read and answer from the private source collection');
check(pageScript.includes('answered_at: new Date().toISOString()'), 'OWNER answer save must include its timestamp');
check(pageScript.includes('다음 ▶'), 'retro next-page control is missing');
check(pageScript.includes('return entry?.asker_name || `${sequence}번째 질문`'), 'question labels must fall back to the permanent sequence number');
check(serverSource.includes('return fmt.Sprintf("%d번째 질문", sequence)'), 'server must assign the sequence-based question label');
for (const removedCopy of [
  '너무 일찍 깬',
  '정신 차리는',
  '배고픈 질문자',
  '딴짓 중인',
  '할 말 생긴',
  '오늘이 아쉬운',
  '잠 안 자는',
  '진짜 안 자는',
]) {
  check(!serverSource.includes(removedCopy) && !pageScript.includes(removedCopy), `${removedCopy} time-band copy must stay removed`);
}

check(pageScript.includes("const RECEIPT_STORAGE_KEY = 'cwk_askme_receipts_v1'"), 'receipt ownership must persist in localStorage');
check(pageScript.includes('localStorage.setItem(RECEIPT_STORAGE_KEY'), 'receipt token must be written to localStorage');
check(pageScript.includes('url.hash = new URLSearchParams'), 'receipt URL must keep credentials in the fragment');
check(pageScript.includes('receipt: String(result.receipt_token || result.token ||'), 'receipt fragment must include the returned token');
check(pageScript.includes('data-copy-receipt'), 'owned questions need a receipt-link copy button');
check(pageScript.includes('navigator.clipboard.writeText(url)'), 'receipt-link copy button must use the clipboard API');
check(pageScript.includes('window.location.assign(buildReceiptUrl(result))'), 'successful submission must redirect to its receipt URL');
check(pageScript.includes("pb.send('/api/cwk/ask/questions/read'"), 'private question lookup must use the protected read endpoint');
check(pageScript.includes('const sequence = Number(document.getElementById(\'askMeLookupSequence\')'), 'private lookup must accept a question sequence');
check(pageScript.includes("document.getElementById('askMeLookupPassword')"), 'private lookup must accept its password');
check(pageScript.includes('readOwnedQuestion({ sequence, password })'), 'private lookup must submit sequence and password together');
check(pageScript.includes('class="askme-delete"'), 'OWNER question delete button is missing');
check(pageScript.includes('pb.send(`/api/cwk/ask/questions/${encodeURIComponent(entry.dataset.askMeId)}`'), 'OWNER delete must use the custom delete endpoint');
check(serverSource.includes('e.Router.DELETE(askQuestionDeletePath, service.softDeleteQuestion)'), 'OWNER delete route is missing');
check(serverSource.includes('Bind(apis.RequireAuth("users", core.CollectionNameSuperusers))'), 'OWNER delete route must require authentication');

const collections = new Map(schema.collections.map(collection => [collection.name, collection]));
const questions = collections.get('ask_questions');
const counters = collections.get('ask_question_counters');
const feed = collections.get('ask_question_feed');
check(Boolean(questions && counters && feed), 'schema must include private questions, counter, and public feed');
check(questions.listRule === "@request.auth.id != ''" && questions.viewRule === "@request.auth.id != ''", 'raw questions must be OWNER-only');
check(questions.createRule === null, 'visitors must not bypass the custom submission endpoint');
check(counters.listRule === null && counters.viewRule === null, 'counter must not be publicly readable');
check(feed.listRule === '' && feed.viewRule === '', 'redacted feed must be publicly readable');
check(/\b(case|iif)\b/i.test(migrationSource) && migrationSource.includes('ask_question_feed'), 'public feed must redact with a SQL projection');
check(/trim\s*\(\s*coalesce/i.test(migrationSource), 'answer publication must require nonblank text');
check(createMigration.includes('CREATE UNIQUE INDEX') && createMigration.includes('sequence'), 'question sequence needs a unique database index');
check(receiptMigration.includes('WHERE q.deleted = FALSE'), 'deleted questions must be excluded from the public feed');
check(feed.viewQuery.includes('WHERE q.deleted = FALSE'), 'schema public feed must exclude deleted questions');
check(feed.viewQuery.includes("iif(q.is_private=FALSE AND trim(COALESCE(q.answer,''))!='',q.question,'')"), 'public feed must redact pending and private question text');
check(!feed.fields.some(field => /password|token|hash/i.test(field.name)), 'public feed must not expose password or receipt fields');
for (const fieldName of ['receipt_token_hash', 'private_password_hash']) {
  const field = questions.fields.find(candidate => candidate.name === fieldName);
  check(Boolean(field?.hidden), `${fieldName} must be a hidden private-source field`);
}
check(receiptMigration.includes('pattern: "^[a-f0-9]{64}$"'), 'receipt tokens must be stored as SHA-256 hex hashes');
check(serverSource.includes('record.Set("receipt_token_hash", receiptHash)'), 'raw receipt tokens must not be stored');
check(serverSource.includes('record.Set("private_password_hash", passwordHash)'), 'raw private passwords must not be stored');
check(!/record\.Set\("(?:password|receipt_token)"/.test(serverSource), 'raw password or receipt token fields must never be persisted');
check(serverSource.includes('record.Set("question", "")') && serverSource.includes('record.Set("answer", "")'), 'deletion must erase raw question and answer text');
check(serverSource.includes('/api/cwk/ask/questions'), 'custom Ask Me POST route is missing');
check(serverSource.includes('RunInTransaction'), 'sequence allocation and question save must be transactional');

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
check((homeHtml.match(/>Ask Me<\/a>/g) || []).length === 1, 'home navigation must contain one Ask Me link');

console.log(`Ask Me QA passed (${assertions} assertions).`);
