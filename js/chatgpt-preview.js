import { normalizeChatGptSnapshot, chatGptShareInfo } from './chatgpt-embeds.mjs';
import { renderChatGptMarkdown } from './chatgpt-markdown.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const logo = '<i class="ph ph-open-ai-logo" aria-hidden="true"></i>';
// Shared snapshots retain raw source markers, but their opaque IDs aren't readable citations.
const readableText = text => text.replace(/\uE200cite\uE202[^\uE201]*\uE201/g, ' [출처: 원문 참고]');

// Read-only, saved conversation. This never embeds or impersonates a live ChatGPT session.
export function chatGptPreviewHtml(embed) {
  const snapshot = normalizeChatGptSnapshot(embed?.snapshot);
  const share = chatGptShareInfo(embed?.url);
  const messages = snapshot?.messages || [];
  return `<section class="cwk-chat-preview" aria-label="ChatGPT 공유 대화">
    <header class="cwk-chat-header"><div class="cwk-chat-brand">${logo}<strong>ChatGPT</strong><span>공유 대화</span></div><h3>${escape(snapshot?.title || 'ChatGPT 공유 대화')}</h3></header>
    <div class="cwk-chat-scroll" tabindex="0" role="region" aria-label="저장된 질문과 답변 · 스크롤하여 읽기">${messages.length ? messages.map(message => `<article class="cwk-chat-message is-${message.role}">${message.role === 'assistant' ? `<div class="cwk-chat-speaker">${logo}<strong>ChatGPT</strong></div>` : '<span class="cwk-chat-sr">내 질문</span>'}<div class="cwk-chat-text">${renderChatGptMarkdown(readableText(message.text))}</div></article>`).join('') : '<p class="cwk-chat-empty">저장된 대화 내용이 없어. 원문에서 확인해줘.</p>'}</div>
    <footer class="cwk-chat-footer">${share ? `<a href="${escape(share.url)}" target="_blank" rel="noopener noreferrer">ChatGPT에서 대화 보기 <i class="ph ph-arrow-up-right" aria-hidden="true"></i></a>` : '<span>유효한 공유 링크가 없어.</span>'}<small>chatgpt.com · 저장된 대화</small></footer>
  </section>`;
}
