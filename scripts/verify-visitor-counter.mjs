import assert from 'node:assert/strict';
import fs from 'node:fs';

const values = new Map();
const localStorage = {
  getItem(key) {
    return values.has(key) ? values.get(key) : null;
  },
  setItem(key, value) {
    values.set(key, String(value));
  },
  removeItem(key) {
    values.delete(key);
  },
};

globalThis.localStorage = localStorage;
globalThis.window = {
  location: {
    hostname: '127.0.0.1',
    origin: 'http://127.0.0.1:4173',
  },
  localStorage,
  addEventListener() {},
  POCKETBASE_URL: '',
};

const pbModule = await import('../js/pb.js');
let createdSessions = 0;

pbModule.pb.collection = collectionName => {
  if (collectionName === 'visitor_sessions') {
    return {
      async getList(_page, _perPage, options) {
        return { totalItems: options.filter ? 4 : 30 };
      },
      async create() {
        createdSessions += 1;
        return { id: `session-${createdSessions}` };
      },
    };
  }

  if (collectionName === 'site_settings') {
    return {
      async getFirstListItem() {
        throw { status: 404 };
      },
    };
  }

  throw new Error(`Unexpected collection: ${collectionName}`);
};

const ownerStats = await pbModule.getVisitorDisplayStats('2026-07-20');
assert.equal(createdSessions, 0, 'loading owner counter stats must not create a visitor session');
assert.equal(ownerStats.realTotal, 30);
assert.equal(ownerStats.realToday, 4);

await pbModule.recordVisitAndGetStats();
assert.equal(createdSessions, 1, 'a guest visit must still create a visitor session');

const siteSource = fs.readFileSync(new URL('../js/site.js', import.meta.url), 'utf8');
assert.match(
  siteSource,
  /const isOwnerMode = isLoggedIn\(\);[\s\S]*if \(!isOwnerMode\)[\s\S]*recordVisitAndGetStats\(\)[\s\S]*const stats = await getVisitorDisplayStats\(\);/,
  'owner mode must load counter stats without recording a visit',
);

console.log('Visitor counter regression checks passed (6 assertions).');
