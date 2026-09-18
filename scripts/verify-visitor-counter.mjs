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
let deletedSessions = 0;

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
      async getFirstListItem() {
        return { id: 'guest-session' };
      },
      async delete(recordId) {
        assert.equal(recordId, 'guest-session');
        deletedSessions += 1;
      },
    };
  }

  if (collectionName === 'analytics_events') {
    return {
      async getFullList() {
        return [];
      },
      async delete() {},
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

await pbModule.excludeCurrentVisitorSession();
assert.equal(deletedSessions, 1, 'owner login must remove the active pre-login guest session');
assert.equal(localStorage.getItem('cwk_visitor_session'), null, 'removed owner session must be cleared locally');

const runtimeSource = fs.readFileSync(new URL('../js/public-runtime.js', import.meta.url), 'utf8');
assert.match(runtimeSource, /isLoggedIn\(\) \? excludeCurrentVisitorSession\(\) : recordVisitAndGetStats\(\)/,
  'owner runtime removes a pre-login session while only guest runtime records a visit');
assert.doesNotMatch(runtimeSource, /querySelector\(['"](?:#visitor|\.counter)/,
  'visitor tracking must not depend on a retired banner or counter element');
assert.match(runtimeSource, /initAnonymousAnalytics\(\)/, 'explicit public startup retains anonymous analytics');

console.log('Visitor counter regression checks passed (11 assertions).');
