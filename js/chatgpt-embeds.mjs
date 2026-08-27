const CHATGPT_SHARE_HOST = 'chatgpt.com';
const CHATGPT_SHARE_PATH_RE = /^\/share\/([a-zA-Z0-9_-]{16,128})\/?$/;

export function chatGptShareInfo(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch (_error) {
    return null;
  }

  const match = url.pathname.match(CHATGPT_SHARE_PATH_RE);
  if (url.protocol !== 'https:' || url.hostname !== CHATGPT_SHARE_HOST || !match) {
    return null;
  }

  const canonicalUrl = `https://${CHATGPT_SHARE_HOST}/share/${match[1]}`;
  return {
    id: match[1],
    url: canonicalUrl,
  };
}

export function normalizeChatGptSnapshot(value) {
  let source = value;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (_error) {
      return null;
    }
  }
  if (!source || typeof source !== 'object') return null;

  const title = String(source.title || '').trim().slice(0, 200) || 'ChatGPT 공유 대화';
  const messages = Array.from(source.messages || [])
    .map(message => ({
      role: message?.role === 'user' ? 'user' : message?.role === 'assistant' ? 'assistant' : '',
      text: String(message?.text || '').trim().slice(0, 100_000),
    }))
    .filter(message => message.role && message.text)
    .slice(0, 200);

  return messages.length ? { title, messages } : null;
}

export function serializeChatGptSnapshot(value) {
  const snapshot = normalizeChatGptSnapshot(value);
  return snapshot ? JSON.stringify(snapshot) : '';
}
