import assert from 'node:assert/strict';
import fs from 'node:fs';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};
globalThis.window = {
  location: { hostname: '127.0.0.1', origin: 'https://coldwaterkim.com', pathname: '/', search: '', hash: '' },
  localStorage: globalThis.localStorage,
  addEventListener() {},
  POCKETBASE_URL: '',
};
globalThis.document = { referrer: '' };

const { analyticsPageKey, classifyAnalyticsSource } = await import('../js/pb.js');
assert.equal(classifyAnalyticsSource('', { origin: 'https://coldwaterkim.com', search: '' }), 'direct');
assert.equal(classifyAnalyticsSource('https://www.google.com/search?q=x', { origin: 'https://coldwaterkim.com', search: '' }), 'search');
assert.equal(classifyAnalyticsSource('https://chatgpt.com/c/secret', { origin: 'https://coldwaterkim.com', search: '' }), 'chatgpt');
assert.equal(classifyAnalyticsSource('', { origin: 'https://coldwaterkim.com', search: '?utm_source=instagram&utm_campaign=private' }), 'instagram');
assert.equal(analyticsPageKey({ pathname: '/posts/hello/', search: '', hash: '' }), 'post:hello');
assert.equal(analyticsPageKey({ pathname: '/daily/2026-08-12/', search: '', hash: '' }), 'daily:2026-08-12');

const migration = fs.readFileSync(new URL('../pb_migrations/1786453200_create_analytics_events.js', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../js/pb.js', import.meta.url), 'utf8');
assert.match(migration, /createRule: "@request\.auth\.id = ''"/);
assert.match(migration, /listRule: "@request\.auth\.id != ''"/);
assert.ok(!migration.includes('referrer') && !migration.includes('utm_source') && !migration.includes('visitor_id'), 'schema must not store raw identity or referrer data');
assert.match(source, /if \(isLoggedIn\(\)\) return false;/);
assert.match(source, /analytics_events'[\s\S]*session_key = \{:sessionKey\}[\s\S]*delete\(event\.id\)/);
assert.match(source, /eventType === 'session_start' \? '' : options\.pageKey/, 'session_start dedupe must not vary by page');

console.log('Analytics QA passed: 12 assertions');
