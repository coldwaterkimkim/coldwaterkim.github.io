import {
  cmsErrorMessage,
  escapeHtml,
  formatDate,
  isLoggedIn,
  pb,
} from './pb.js';
import { askMeEntryBody, askMePageItems } from './askme-logic.mjs';

const PAGE_SIZE = 10;
const form = document.getElementById('askMeForm');
const questionInput = document.getElementById('askMeQuestion');
const privateInput = document.getElementById('askMePrivate');
const honeypotInput = document.getElementById('askMeWebsite');
const formStatus = document.getElementById('askMeFormStatus');
const entries = document.getElementById('askMeEntries');
const pagination = document.getElementById('askMePagination');
let currentPage = 1;

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const question = questionInput?.value.trim() || '';
  if (!question) {
    setFormStatus('질문을 입력해주세요.', true);
    questionInput?.focus();
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  setFormStatus('질문을 보내는 중...');

  try {
    await pb.send('/api/cwk/ask/questions', {
      method: 'POST',
      body: {
        question,
        is_private: Boolean(privateInput?.checked),
        website: honeypotInput?.value || '',
      },
    });
    form.reset();
    setFormStatus('질문을 남겼습니다.');
    currentPage = 1;
    await loadAskMeEntries();
  } catch (error) {
    setFormStatus(`질문을 남기지 못했습니다: ${cmsErrorMessage(error)}`, true);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

async function loadAskMeEntries() {
  if (!entries) return;
  entries.innerHTML = '<p>불러오는 중...</p>';

  try {
    const result = isLoggedIn()
      ? await pb.collection('ask_questions').getList(currentPage, PAGE_SIZE, { sort: '-sequence' })
      : await pb.collection('ask_question_feed').getList(currentPage, PAGE_SIZE, { sort: '-sequence' });

    currentPage = Math.min(Math.max(1, currentPage), Math.max(1, result.totalPages || 1));
    if (!result.items.length) {
      entries.innerHTML = '<p>아직 질문이 없습니다. 첫 질문을 남겨주세요!</p>';
      renderPagination(result.totalPages || 0);
      return;
    }

    entries.innerHTML = result.items.map(item => isLoggedIn()
      ? renderOwnerEntry(item)
      : renderPublicEntry(item)).join('');
    renderPagination(result.totalPages || 0);
    bindOwnerActions();
  } catch (error) {
    entries.innerHTML = `<p>${escapeHtml(cmsErrorMessage(error))}</p>`;
    if (pagination) pagination.innerHTML = '';
  }
}

function renderPublicEntry(entry) {
  const body = askMeEntryBody(entry);
  const answer = String(entry.answer || '').trim();
  const answered = entry.status === 'answered' && body && answer;

  return `
    <article class="entry askme-entry" data-ask-me-id="${escapeHtml(entry.id)}">
      <div class="meta"><b>${escapeHtml(entry.asker_name || `질문자 ${entry.sequence}`)}</b> · ${escapeHtml(formatDate(entry.created))}</div>
      <div class="askme-question${answered ? '' : ' askme-placeholder'}">${answered ? '<b>Q.</b> ' : ''}${escapeHtml(body)}</div>
      ${answered ? renderAnswer(answer, entry.answered_at) : ''}
    </article>
  `;
}

function renderOwnerEntry(entry) {
  const answer = String(entry.answer || '').trim();
  const privacy = entry.is_private ? ' · <b>[비공개]</b>' : '';
  return `
    <article class="entry askme-entry askme-entry-owner" data-ask-me-id="${escapeHtml(entry.id)}">
      <div class="meta"><b>${escapeHtml(entry.asker_name || `질문자 ${entry.sequence}`)}</b> · ${escapeHtml(formatDate(entry.created))}${privacy}</div>
      <div class="askme-question"><b>Q.</b> ${escapeHtml(entry.question || '')}</div>
      ${answer ? renderAnswer(answer, entry.answered_at) : ''}
      <div class="guestbook-reply-actions"><button type="button" class="askme-answer-toggle">[${answer ? '답변 수정' : '답변하기'}]</button>${answer ? ' <button type="button" class="askme-answer-clear">[답변 지우기]</button>' : ''}</div>
      <form class="guestbook-reply-form askme-answer-form" hidden>
        <textarea rows="4" maxlength="3000" aria-label="답변" required>${escapeHtml(answer)}</textarea>
        <div><button type="submit">[저장]</button> <button type="button" class="askme-answer-cancel">[취소]</button></div>
      </form>
    </article>
  `;
}

function renderAnswer(answer, answeredAt) {
  return `
    <div class="guestbook-owner-reply askme-answer">
      <div><b>A.</b> ${escapeHtml(answer)}</div>
      <div class="guestbook-owner-reply-meta">— coldwaterkim${answeredAt ? ` · ${escapeHtml(formatDate(answeredAt))}` : ''}</div>
    </div>
  `;
}

function bindOwnerActions() {
  if (!isLoggedIn() || !entries) return;

  entries.querySelectorAll('.askme-answer-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const answerForm = button.closest('.askme-entry')?.querySelector('.askme-answer-form');
      if (!answerForm) return;
      answerForm.hidden = !answerForm.hidden;
      if (!answerForm.hidden) answerForm.querySelector('textarea')?.focus();
    });
  });

  entries.querySelectorAll('.askme-answer-cancel').forEach(button => {
    button.addEventListener('click', () => {
      const answerForm = button.closest('.askme-answer-form');
      if (answerForm) answerForm.hidden = true;
    });
  });

  entries.querySelectorAll('.askme-answer-form').forEach(answerForm => {
    answerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const entry = answerForm.closest('.askme-entry');
      const answer = answerForm.querySelector('textarea')?.value.trim() || '';
      const submitButton = answerForm.querySelector('button[type="submit"]');
      if (!entry || !answer) return;
      if (submitButton) submitButton.disabled = true;
      try {
        await pb.collection('ask_questions').update(entry.dataset.askMeId, {
          answer,
          answered_at: new Date().toISOString(),
        });
        await loadAskMeEntries();
      } catch (error) {
        alert(`답변 저장 실패: ${cmsErrorMessage(error)}`);
        if (submitButton) submitButton.disabled = false;
      }
    });
  });

  entries.querySelectorAll('.askme-answer-clear').forEach(button => {
    button.addEventListener('click', async () => {
      const entry = button.closest('.askme-entry');
      if (!entry || !confirm('이 답변을 지우시겠습니까?')) return;
      button.disabled = true;
      try {
        await pb.collection('ask_questions').update(entry.dataset.askMeId, {
          answer: '',
          answered_at: '',
        });
        await loadAskMeEntries();
      } catch (error) {
        alert(`답변 삭제 실패: ${cmsErrorMessage(error)}`);
        button.disabled = false;
      }
    });
  });
}

function renderPagination(totalPages) {
  if (!pagination || totalPages <= 1) {
    if (pagination) pagination.innerHTML = '';
    return;
  }

  const pages = askMePageItems(currentPage, totalPages);
  const parts = ['['];
  if (currentPage > 1) parts.push(pageButton(currentPage - 1, '◀ 이전'));
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) parts.push('<span>…</span>');
    parts.push(page === currentPage
      ? `<b aria-current="page">${page}</b>`
      : pageButton(page, String(page)));
  });
  if (currentPage < totalPages) parts.push(pageButton(currentPage + 1, '다음 ▶'));
  parts.push(']');
  pagination.innerHTML = parts.join(' ');
  pagination.querySelectorAll('button[data-page]').forEach(button => {
    button.addEventListener('click', () => {
      currentPage = Number(button.dataset.page);
      loadAskMeEntries();
      document.querySelector('.visitor-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function pageButton(page, label) {
  return `<button type="button" data-page="${page}">${escapeHtml(label)}</button>`;
}

function setFormStatus(message, isError = false) {
  if (!formStatus) return;
  formStatus.textContent = message;
  formStatus.classList.toggle('is-error', isError);
}

loadAskMeEntries();
