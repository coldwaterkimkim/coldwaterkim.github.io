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

// The public Ask Me UI is retired; its data/privacy contracts remain supported.
check(html.includes('서비스 종료 안내'), 'old Ask Me URL must retain its service-ended notice');
check(html.includes('href="/"'), 'old Ask Me URL must provide a working archive entrance');
check(!html.includes('js/askme.js'), 'retired controller must not be loaded');
check(!homeHtml.includes('data-askme-form'), 'home must not restore the retired submission form');
check(homeHtml.includes('id="records-app"'), 'home must retain the shared records application');

check(ASK_ME_PENDING_COPY === '답변을 기다리고 있는 질문입니다. 답변 후 공개 예정입니다.', 'pending copy changed unexpectedly');
check(ASK_ME_DELETED_COPY === '주인장이 삭제한 질문입니다. 뭔가 마음에 안들었나보죠?', 'deleted copy changed unexpectedly');
check(askMeEntryBody({ status: 'pending', question: 'secret' }) === ASK_ME_PENDING_COPY, 'pending question must render only the waiting copy');
check(askMeEntryBody({ status: 'private', question: 'secret' }) === ASK_ME_PRIVATE_COPY, 'private question must render only the privacy copy');
check(askMeEntryBody({ status: 'answered', question: '공개 질문' }) === '공개 질문', 'answered public question must render its actual text');
assert.deepEqual(askMePageItems(1, 3), [1, 2, 3], 'short archive uses direct page numbers');
assert.deepEqual(askMePageItems(6, 12), [1, 4, 5, 6, 7, 8, 12], 'long archive keeps bounded page links');
assertions += 2;

check(serverSource.includes('return fmt.Sprintf("%d번째 질문", sequence)'), 'server must preserve sequence-based question labels');
check(serverSource.includes('e.Router.DELETE(askQuestionDeletePath, service.softDeleteQuestion)'), 'retained OWNER delete route is missing');
check(serverSource.includes('Bind(apis.RequireAuth("users", core.CollectionNameSuperusers))'), 'retained OWNER delete route must require authentication');

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
check(serverSource.includes('displaySequence := len(activeQuestions) + 1'), 'new question labels must exclude deleted questions');
check(serverSource.includes('findActiveAskQuestionByDisplaySequence(service.app, request.Sequence)'), 'private lookup must use the visible active-question number');
check(serverSource.includes('renumberActiveAskQuestionNames(txApp)'), 'deletion must close visible question-number gaps');

console.log(`Ask Me QA passed (${assertions} assertions).`);
