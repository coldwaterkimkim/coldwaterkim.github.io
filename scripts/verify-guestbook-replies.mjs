import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = JSON.parse(fs.readFileSync(new URL('../pb_schema.json', import.meta.url), 'utf8'));
const migrationSource = fs.readFileSync(new URL('../pb_migrations/1785942000_add_guestbook_owner_reply.js', import.meta.url), 'utf8');
const pbSource = fs.readFileSync(new URL('../js/pb.js', import.meta.url), 'utf8');
const siteSource = fs.readFileSync(new URL('../js/site.js', import.meta.url), 'utf8');
const guestbookPage = fs.readFileSync(new URL('../guestbook.html', import.meta.url), 'utf8');
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
check(siteSource.includes('class="guestbook-preview-reply"'), 'home preview includes the owner reply when present');
check(siteSource.includes('escapeHtml(ownerReply)'), 'home preview escapes owner reply content');
check(siteSource.includes("guestbookEntries.querySelectorAll('.guestbook-reply-form')"), 'reply form submit behavior is wired');
check(siteSource.includes("guestbookEntries.querySelectorAll('.reply-delete-btn')"), 'reply delete behavior is wired');
check(guestbookPage.includes('<label for="message"><b>메시지</b></label>'), 'the public message textarea has a visible associated label');
check(/id="guestbookSubmitStatus"[^>]*role="status"[^>]*aria-live="polite"/.test(guestbookPage), 'guestbook submit feedback is announced to assistive technology');
check(siteSource.includes("if (guestbookForm.dataset.guestbookSubmitting === 'true') return;"), 'duplicate guestbook submits are ignored before asynchronous work starts');
check(/function setGuestbookSubmitting\(isSubmitting\)[\s\S]*submitButton\.disabled = isSubmitting;[\s\S]*submitButton\.setAttribute\('aria-busy', String\(isSubmitting\)\)/.test(siteSource), 'guestbook submit exposes and disables its complete in-flight state');
check(/setGuestbookSubmitting\(true\);[\s\S]*try \{[\s\S]*await addGuestbookEntry\(name, message\);[\s\S]*await loadGuestbook\(guestbookEntries\);[\s\S]*\} finally \{[\s\S]*setGuestbookSubmitting\(false\);/.test(siteSource), 'guestbook retry is restored only after the full submit and refresh finishes');
check(cssSource.includes('.guestbook-owner-reply'), 'owner reply has a dedicated retro nested style');
check(cssSource.includes('#guestbook-preview-table {\n  table-layout: fixed;'), 'home preview uses a fixed table layout for a bounded text column');
check(cssSource.includes('.guestbook-preview-reply'), 'home preview reply has a dedicated compact style');
check(cssSource.includes('text-overflow: ellipsis'), 'home preview reply adapts to the available width with an ellipsis');

console.log(`Guestbook reply QA passed (${assertions} assertions).`);
