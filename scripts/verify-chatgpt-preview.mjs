// Shared editor/public preview: no network, saved content, or browser session required.
import assert from 'node:assert/strict';
import { chatGptPreviewHtml } from '../js/chatgpt-preview.js';

assert.ok(process.env.CWK_DOM_PARSER_MODULE, 'Set CWK_DOM_PARSER_MODULE to the linkedom ESM entry.');
const { parseHTML } = await import(process.env.CWK_DOM_PARSER_MODULE);
const sharedUrl = 'https://chatgpt.com/share/01234567-89ab-cdef-0123-456789abcdef';
const render = embed => parseHTML(`<html><body>${chatGptPreviewHtml(embed)}</body></html>`).document;
const embed = {
  type: 'chatgpt',
  url: `${sharedUrl}?tracking=discard#fragment`,
  snapshot: {
    title: '생각을 이어가는 대화',
    messages: [
      { role: 'user', text: '첫 질문 **강조**' },
      { role: 'assistant', text: '첫 답변\n\n- 첫 항목\n- 둘째 항목' },
      { role: 'system', text: '이 메시지는 공개 대화가 아님' },
      { role: 'assistant', text: '   ' },
      { role: 'user', text: '다음 질문' },
      { role: 'assistant', text: `마지막 답변 ${'긴 문장 '.repeat(120)}끝까지 표시` },
    ],
  },
};
const doc = render(embed);
const messages = [...doc.querySelectorAll('.cwk-chat-message')];
assert.equal(messages.length, 4, 'Render every normalized turn, not only the first snippet.');
assert.ok(messages[0].classList.contains('is-user'));
assert.ok(messages[1].classList.contains('is-assistant'));
assert.ok(messages[2].classList.contains('is-user'));
assert.ok(messages[3].classList.contains('is-assistant'));
assert.match(messages[3].textContent, /끝까지 표시/, 'Long messages must remain readable through scrolling.');
assert.ok(messages[0].querySelector('strong'), 'Render safe Markdown formatting.');
assert.equal(messages[1].querySelectorAll('li').length, 2);
assert.ok(doc.querySelector('header.cwk-chat-header'));
assert.ok(doc.querySelector('footer.cwk-chat-footer'));
const scroll = doc.querySelector('.cwk-chat-scroll');
assert.equal(scroll?.getAttribute('tabindex'), '0', 'The conversation scroll region must be keyboard reachable.');
assert.equal(scroll.querySelectorAll('.cwk-chat-message').length, 4);
assert.equal(scroll.contains(doc.querySelector('.cwk-chat-header')), false);
assert.equal(scroll.contains(doc.querySelector('.cwk-chat-footer')), false);
const originalLink = doc.querySelector('.cwk-chat-footer a');
assert.equal(originalLink?.getAttribute('href'), sharedUrl, 'Original conversation link must be canonical.');
assert.equal(originalLink.getAttribute('target'), '_blank');
assert.match(originalLink.getAttribute('rel'), /noopener/);

const hostile = render({ ...embed, snapshot: {
  title: '<img src=x onerror="alert(1)">',
  messages: [{ role: 'user', text: '<script>alert(1)</script><img src=x onerror="alert(1)">\n[bad](javascript:alert%281%29)\n![remote](https://example.invalid/track.png)' }],
} });
assert.equal(hostile.querySelectorAll('script, iframe, img').length, 0, 'Untrusted HTML or remote images must not become active elements.');
for (const el of hostile.querySelectorAll('*')) {
  for (const attribute of el.attributes) assert.doesNotMatch(attribute.name, /^on/i);
}
for (const link of hostile.querySelectorAll('a')) assert.doesNotMatch(link.getAttribute('href') || '', /^\s*(javascript|data):/i);

for (const url of ['javascript:alert(1)', 'https://evil.invalid/share/01234567-89ab-cdef', 'https://chatgpt.com/not-share/0123456789abcdef']) {
  const invalid = render({ ...embed, url });
  assert.equal(invalid.querySelector('.cwk-chat-footer a'), null, 'Never expose an invalid original-share destination.');
}
for (const snapshot of [undefined, null, { title: '제목만', messages: [] }]) {
  const empty = render({ type: 'chatgpt', url: sharedUrl, snapshot });
  assert.equal(empty.querySelectorAll('.cwk-chat-message').length, 0);
  assert.ok(empty.querySelector('.cwk-chat-scroll')?.textContent.trim(), 'Empty snapshots should explain the missing preview.');
  assert.equal(empty.querySelector('.cwk-chat-footer a')?.getAttribute('href'), sharedUrl);
}
console.log('ChatGPT preview DOM passed: all turns, role styling, safe Markdown, canonical original link, keyboard scroll region, and empty fallback.');
console.log('Scope: DOM behavior only. Square sizing, nested scrolling, and responsive appearance require browser QA.');
