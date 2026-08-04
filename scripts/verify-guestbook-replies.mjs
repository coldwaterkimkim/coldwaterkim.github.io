import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = JSON.parse(fs.readFileSync(new URL('../pb_schema.json', import.meta.url), 'utf8'));
const migrationSource = fs.readFileSync(new URL('../pb_migrations/1785942000_add_guestbook_owner_reply.js', import.meta.url), 'utf8');
const pbSource = fs.readFileSync(new URL('../js/pb.js', import.meta.url), 'utf8');
const siteSource = fs.readFileSync(new URL('../js/site.js', import.meta.url), 'utf8');
const cssSource = fs.readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
let assertions = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
}

const guestbook = schema.collections.find(collection => collection.name === 'guestbook');
const ownerReply = guestbook?.fields.find(field => field.name === 'owner_reply');
const ownerRepliedAt = guestbook?.fields.find(field => field.name === 'owner_replied_at');

check(ownerReply?.type === 'text' && ownerReply.max === 1000, 'owner reply is an optional bounded text field');
check(ownerRepliedAt?.type === 'date', 'owner reply timestamp is stored separately');
check(guestbook?.createRule?.includes('@request.body.owner_reply:isset = false'), 'public creates cannot inject an owner reply');
check(guestbook?.createRule?.includes('@request.body.owner_replied_at:isset = false'), 'public creates cannot inject an owner reply timestamp');
check(guestbook?.createRule?.includes('@request.body.display_date:isset = false'), 'public creates cannot forge the initial display date');
check(guestbook?.updateRule === "@request.auth.id != ''", 'guestbook updates require owner authentication');
check(migrationSource.includes('new TextField({'), 'migration adds the reply field');
check(migrationSource.includes('new DateField({'), 'migration adds the reply timestamp');
check(migrationSource.includes('collection.updateRule = null'), 'migration rollback restores locked guestbook updates');
check(pbSource.includes('export async function saveGuestbookReply'), 'PocketBase helper can save a reply');
check(pbSource.includes('export async function clearGuestbookReply'), 'PocketBase helper can clear a reply');
check(siteSource.includes('class="guestbook-owner-reply"'), 'public rendering includes the nested owner reply');
check(siteSource.includes("const isAdmin = isLoggedIn()"), 'reply controls are gated by owner authentication');
check(siteSource.includes('linkify(escapeHtml(replyMessage))'), 'reply content is escaped before linkification');
check(siteSource.includes("guestbookEntries.querySelectorAll('.guestbook-reply-form')"), 'reply form submit behavior is wired');
check(siteSource.includes("guestbookEntries.querySelectorAll('.reply-delete-btn')"), 'reply delete behavior is wired');
check(cssSource.includes('.guestbook-owner-reply'), 'owner reply has a dedicated retro nested style');

console.log(`Guestbook reply QA passed (${assertions} assertions).`);
