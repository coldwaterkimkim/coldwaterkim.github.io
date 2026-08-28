import MarkdownIt from 'markdown-it';
import { normalizeChatGptSnapshot } from './chatgpt-embeds.mjs';

const markdown = new MarkdownIt({
  html: false,
  breaks: true,
  linkify: true,
  typographer: false,
});

const defaultLinkOpen = markdown.renderer.rules.link_open
  || ((tokens, index, options, _env, renderer) => renderer.renderToken(tokens, index, options));

markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, index, options, env, renderer);
};

// Do not turn Markdown images into silent third-party requests from visitors.
// Keep their label and destination as an ordinary, user-clicked link instead.
markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const rawUrl = token.attrGet('src') || '';
  const label = renderer.renderInlineAsText(token.children || [], options, env).trim() || '이미지';
  const escapedLabel = markdown.utils.escapeHtml(`[이미지: ${label}]`);
  if (!markdown.validateLink(rawUrl)) return escapedLabel;

  const href = markdown.utils.escapeHtml(markdown.normalizeLink(rawUrl));
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapedLabel}</a>`;
};

export function renderChatGptMarkdown(value = '') {
  const source = String(value || '').trim();
  return source ? markdown.render(source) : '';
}

export function decorateChatGptMarkdown(scope = document) {
  const root = scope || document;
  root.querySelectorAll('[data-cwk-chatgpt-embed="true"], .cwk-chatgpt-embed').forEach(embed => {
    const snapshot = normalizeChatGptSnapshot(embed.getAttribute('data-cwk-chatgpt-snapshot') || '');
    if (!snapshot) return;

    const messages = Array.from(embed.querySelectorAll('.cwk-chatgpt-message'));
    snapshot.messages.forEach((message, index) => {
      const target = messages[index]?.querySelector('.cwk-chatgpt-message-text');
      if (!target) return;
      target.innerHTML = renderChatGptMarkdown(message.text);
      target.dataset.cwkMarkdownRendered = 'true';
    });
  });
}
