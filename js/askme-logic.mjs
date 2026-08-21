export const ASK_ME_PENDING_COPY = '답변을 기다리고 있는 질문입니다. 답변 후 공개 예정입니다.';
export const ASK_ME_PRIVATE_COPY = '질문자가 질문을 공개하고 싶지 않아하네염. 간이 작은가 봐염. 이해해주세염.';
export const ASK_ME_DELETED_COPY = '주인장이 삭제한 질문입니다. 뭔가 마음에 안들었나보죠?';

export function askMeEntryBody(entry = {}) {
  if (entry.status === 'private') return ASK_ME_PRIVATE_COPY;
  if (entry.status === 'pending') return ASK_ME_PENDING_COPY;
  return String(entry.question || '').trim();
}

export function askMeExcerpt(value, limit) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const characters = Array.from(text);
  const maximum = Math.max(1, Number(limit) || 1);
  return characters.length > maximum
    ? `${characters.slice(0, maximum).join('').trimEnd()}…`
    : text;
}

export function askMePageItems(currentPage, totalPages, radius = 2) {
  const current = Math.max(1, Number(currentPage) || 1);
  const total = Math.max(0, Number(totalPages) || 0);
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set([1, total]);
  for (let page = current - radius; page <= current + radius; page += 1) {
    if (page >= 1 && page <= total) pages.add(page);
  }
  return Array.from(pages).sort((a, b) => a - b);
}
