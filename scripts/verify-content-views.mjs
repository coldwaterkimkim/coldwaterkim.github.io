import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  CONTENT_VIEW_KINDS,
  contentViewHashSeed,
  contentViewKey,
  recordContentViewWithAdapter
} from '../js/content-views.mjs';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

assert.deepEqual(CONTENT_VIEW_KINDS, ['post', 'daily', 'program', 'nasajab']);
assert.equal(contentViewKey('post', 'abc123'), 'post:abc123');
assert.equal(contentViewKey(' DAILY ', '2026-08-25'), 'daily:2026-08-25');
assert.equal(contentViewKey('unknown', 'abc123'), '');
assert.equal(contentViewKey('post', ''), '');
assert.equal(
  contentViewHashSeed('post', 'visitor', 'abc123', 42),
  'cwk-post-view-v1:visitor:abc123:42',
  '글방의 기존 dedupe hash 계약을 유지해야 함'
);
assert.equal(
  contentViewHashSeed('nasajab', 'visitor', 'item123', 42),
  'cwk-content-view-v1:visitor:nasajab:item123:42'
);

function mockAdapter(overrides = {}) {
  const created = [];
  const saved = [];
  return {
    created,
    saved,
    loggedIn: false,
    sessions: {},
    visitorId: 'visitor',
    sessionBucket: 42,
    dayKey: '2026-08-25',
    expiresAt: 123456,
    hash: async seed => `hash:${seed}`,
    create: async payload => created.push(payload),
    saveSessions: sessions => saved.push(structuredClone(sessions)),
    ...overrides
  };
}

const perKindAdapter = mockAdapter();
for (const kind of CONTENT_VIEW_KINDS) {
  assert.equal(await recordContentViewWithAdapter({ kind, id: 'same-id', published: true }, perKindAdapter), true);
}
assert.deepEqual(
  perKindAdapter.created.map(payload => payload.content_key),
  ['post:same-id', 'daily:same-id', 'program:same-id', 'nasajab:same-id'],
  'collection이 달라도 같은 id를 서로 다른 콘텐츠로 기록해야 함'
);

const dedupeAdapter = mockAdapter();
assert.equal(await recordContentViewWithAdapter({ kind: 'daily', id: '2026-08-25', published: true }, dedupeAdapter), true);
assert.equal(await recordContentViewWithAdapter({ kind: 'daily', id: '2026-08-25', published: true }, dedupeAdapter), false);
assert.equal(dedupeAdapter.created.length, 1, '같은 콘텐츠는 같은 30분 세션에 한 번만 생성해야 함');

for (const target of [
  { kind: 'post', id: 'draft', published: false },
  { kind: 'program', id: 'private', published: false }
]) {
  const adapter = mockAdapter();
  assert.equal(await recordContentViewWithAdapter(target, adapter), false);
  assert.equal(adapter.created.length, 0);
}
const ownerAdapter = mockAdapter({ loggedIn: true });
assert.equal(await recordContentViewWithAdapter({ kind: 'nasajab', id: 'owner', published: true }, ownerAdapter), false);
assert.equal(ownerAdapter.created.length, 0, 'OWNER 조회는 생성하면 안 됨');

const duplicateAdapter = mockAdapter({
  create: async () => {
    throw { status: 400, response: { data: { view_key: { code: 'validation_not_unique' } } } };
  }
});
assert.equal(await recordContentViewWithAdapter({ kind: 'post', id: 'duplicate', published: true }, duplicateAdapter), true);
assert.equal(duplicateAdapter.saved.length, 1, '실제 unique 충돌은 이미 집계된 세션으로 저장해야 함');

const validationAdapter = mockAdapter({
  create: async () => {
    throw { status: 400, response: { data: { content_key: { code: 'validation_required' } } } };
  }
});
assert.equal(await recordContentViewWithAdapter({ kind: 'post', id: 'invalid', published: true }, validationAdapter), false);
assert.equal(validationAdapter.saved.length, 0, '일반 validation 400은 세션 성공으로 저장하면 안 됨');

const schema = JSON.parse(read('pb_schema.json'));
const views = schema.collections.find(collection => collection.name === 'post_views');
assert.ok(views, 'post_views schema가 있어야 함');
for (const fieldName of ['content_kind', 'content_key', 'content_slug']) {
  assert.ok(views.fields.some(field => field.name === fieldName), `${fieldName} 필드가 있어야 함`);
}
assert.deepEqual(views.fields.find(field => field.name === 'content_kind').values, CONTENT_VIEW_KINDS);
assert.equal(views.fields.find(field => field.name === 'content_key').required, true);
assert.ok(views.indexes.some(index => index.includes('idx_post_views_content_key')));

const migration = read('pb_migrations/1787670000_generalize_post_views.js');
assert.match(migration, /content_kind = 'post'/, '기존 글방 조회를 post로 backfill해야 함');
assert.match(migration, /content_key = 'post:' \|\| post_id/, '기존 글방 조회 키를 보존해야 함');
assert.match(migration, /content_kind.*required = true/s, 'backfill 뒤 필수 필드로 고정해야 함');
assert.match(migration, /DELETE FROM post_views\s+WHERE content_kind != 'post'/, 'rollback은 범용 행이 기존 글방 집계를 오염시키지 않게 제거해야 함');

const pbSource = read('js/pb.js');
assert.match(pbSource, /filter: pb\.filter\('content_key = \{:contentKey\}'/, 'OWNER 집계는 범용 키로 조회해야 함');
assert.match(pbSource, /Object\.prototype\.hasOwnProperty\.call\(counts, key\) \? counts\[key\] : undefined/, '집계 조회 실패를 실제 0으로 위장하면 안 됨');

const dailyIndex = read('daily/index.html');
const dailyView = read('daily/view.html');
assert.match(dailyIndex, /views-col-head/);
assert.match(dailyIndex, /kind: 'daily', id: day\.dayKey/);
assert.match(dailyView, /recordContentView\(\{ kind: 'daily', id: dayKey/);
assert.match(dailyView, /현재 하루 조회수/);

const programs = read('js/programs.js');
const programDetail = read('js/program-detail.js');
assert.match(programs, /kind: 'program', id: program\.id/);
assert.match(programDetail, /recordContentView\(\{/);
assert.match(programDetail, /published: program\?\.is_public === true/);

const nasajab = read('js/nasajab.js');
assert.match(nasajab, /kind: 'nasajab', id: item\.id/);
assert.match(nasajab, /recordNasajabViewAfterEntry\(featured\)/);
assert.match(nasajab, /!ownerMode && !demoMode/, 'OWNER와 demo mode에서는 나사잡을 집계하지 않아야 함');

console.log('content view verification passed');
