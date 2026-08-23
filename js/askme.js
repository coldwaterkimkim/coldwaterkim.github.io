import {
  cmsErrorMessage,
  escapeHtml,
  formatDate,
  isLoggedIn,
  pb,
} from './pb.js';
import {
  ASK_ME_DELETED_COPY,
  askMeEntryBody,
  askMeExcerpt,
  askMePageItems,
} from './askme-logic.mjs';

const PAGE_SIZE = 10;
const RECEIPT_STORAGE_KEY = 'cwk_askme_receipts_v1';
const SUBMIT_NOTICE_KEY = 'cwk_askme_submit_notice';
const COUNT_REVEAL_AT = 850;

const forms = Array.from(document.querySelectorAll('[data-askme-form]'));
const entries = document.getElementById('askMeEntries');
const homePreview = document.getElementById('homeAskMePreview');
const pagination = document.getElementById('askMePagination');
const privateLookupForm = document.getElementById('askMePrivateLookupForm');
const lookupStatus = document.getElementById('askMeLookupStatus');
const ownedQuestions = new Map();
let currentPage = 1;
let target = readTargetFromHash();
let pendingDeletedTarget = null;

forms.forEach(bindQuestionForm);
bindPrivateLookup();

if (entries) {
  initializeAskMePage();
}

if (homePreview) {
  loadHomeAskMePreview();
}

function bindQuestionForm(form) {
  const questionInput = form.querySelector('[data-askme-question]');
  const privateInput = form.querySelector('[data-askme-private]');
  const passwordFields = form.querySelector('[data-askme-password-fields]');
  const passwordInput = form.querySelector('[data-askme-password]');
  const passwordConfirm = form.querySelector('[data-askme-password-confirm]');
  const count = form.querySelector('[data-askme-count]');

  const syncPrivateFields = () => {
    const enabled = Boolean(privateInput?.checked);
    if (passwordFields) passwordFields.hidden = !enabled;
    if (passwordInput) passwordInput.required = enabled;
    if (passwordConfirm) passwordConfirm.required = enabled;
    if (!enabled) {
      if (passwordInput) passwordInput.value = '';
      if (passwordConfirm) passwordConfirm.value = '';
    }
  };

  const syncCharacterCount = () => {
    if (!questionInput || !count) return;
    const length = Array.from(questionInput.value).length;
    count.hidden = length < COUNT_REVEAL_AT;
    count.textContent = `${length} / 1000`;
  };

  privateInput?.addEventListener('change', syncPrivateFields);
  questionInput?.addEventListener('input', syncCharacterCount);
  syncPrivateFields();
  syncCharacterCount();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const question = questionInput?.value.trim() || '';
    const isPrivate = Boolean(privateInput?.checked);
    const password = passwordInput?.value || '';
    const passwordConfirmation = passwordConfirm?.value || '';

    if (!question) {
      setFormStatus(form, '질문을 입력해주세요.', true);
      questionInput?.focus();
      return;
    }
    if (isPrivate && !password.trim()) {
      setFormStatus(form, '비공개 질문의 비밀번호를 입력해주세요.', true);
      passwordInput?.focus();
      return;
    }
    if (isPrivate && password !== passwordConfirmation) {
      setFormStatus(form, '비밀번호가 서로 다릅니다.', true);
      passwordConfirm?.focus();
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    setFormStatus(form, '질문을 보내는 중...');

    try {
      const result = await pb.send('/api/cwk/ask/questions', {
        method: 'POST',
        body: {
          question,
          is_private: isPrivate,
          password: isPrivate ? password : '',
          website: form.querySelector('[data-askme-honeypot]')?.value || '',
        },
      });
      if (!result?.id || !result?.sequence || !result?.receipt_token) {
        form.reset();
        syncPrivateFields();
        syncCharacterCount();
        setFormStatus(form, '질문을 남겼습니다.');
        return;
      }

      saveReceipt({
        id: result.id,
        sequence: result.sequence,
        token: result.receipt_token,
      });
      writeSessionValue(SUBMIT_NOTICE_KEY, `${result.asker_name || `${result.sequence}번째 질문`}으로 남겼습니다.`);
      window.location.assign(buildReceiptUrl(result));
    } catch (error) {
      setFormStatus(form, `질문을 남기지 못했습니다: ${cmsErrorMessage(error)}`, true);
      if (submitButton) submitButton.disabled = false;
    }
  });
}

async function initializeAskMePage() {
  const notice = takeSessionValue(SUBMIT_NOTICE_KEY);
  if (notice && forms[0]) setFormStatus(forms[0], notice);

  if (target?.id && target?.receiptToken) {
    saveReceipt({ id: target.id, sequence: target.sequence, token: target.receiptToken });
    try {
      const owned = await readOwnedQuestion({ id: target.id, receipt_token: target.receiptToken });
      ownedQuestions.set(owned.id, owned);
      target.sequence = Number(owned.sequence) || target.sequence;
      if (owned.deleted) {
        pendingDeletedTarget = owned;
      } else {
        currentPage = await pageForSequence(owned.sequence);
      }
    } catch (error) {
      if (forms[0]) setFormStatus(forms[0], `내 질문을 열지 못했습니다: ${cmsErrorMessage(error)}`, true);
    }
  } else if (target?.sequence) {
    currentPage = await pageForSequence(target.sequence);
  }

  await loadAskMeEntries();
}

async function loadAskMeEntries() {
  if (!entries) return;
  entries.innerHTML = '<p>불러오는 중...</p>';

  try {
    const result = isLoggedIn()
      ? await pb.collection('ask_questions').getList(currentPage, PAGE_SIZE, {
        filter: "deleted_at = ''",
        sort: '-sequence',
      })
      : await pb.collection('ask_question_feed').getList(currentPage, PAGE_SIZE, { sort: '-sequence' });

    const boundedPage = Math.min(Math.max(1, currentPage), Math.max(1, result.totalPages || 1));
    if (boundedPage !== currentPage) {
      currentPage = boundedPage;
      await loadAskMeEntries();
      return;
    }
    if (!result.items.length && !pendingDeletedTarget) {
      entries.innerHTML = '<p>아직 질문이 없습니다. 첫 질문을 남겨주세요!</p>';
      renderPagination(result.totalPages || 0);
      return;
    }

    const rendered = result.items.map(item => isLoggedIn()
      ? renderOwnerEntry(item)
      : renderPublicEntry(item)).join('');
    entries.innerHTML = pendingDeletedTarget
      ? `${renderDeletedOwnedEntry(pendingDeletedTarget)}${rendered}`
      : rendered;
    renderPagination(result.totalPages || 0);
    bindOwnerActions();
    bindPublicActions();
    await revealStoredQuestions(result.items);
    focusTargetQuestion();
  } catch (error) {
    entries.innerHTML = `<p>${escapeHtml(cmsErrorMessage(error))}</p>`;
    if (pagination) pagination.innerHTML = '';
  }
}

async function loadHomeAskMePreview() {
  homePreview.innerHTML = '<tr><td colspan="2">불러오는 중...</td></tr>';

  try {
    const result = await pb.collection('ask_question_feed').getList(1, 3, { sort: '-sequence' });
    homePreview.innerHTML = result.items.length
      ? result.items.map(renderHomePreviewEntry).join('')
      : '<tr><td colspan="2">아직 질문이 없습니다.</td></tr>';
  } catch {
    homePreview.innerHTML = '<tr><td colspan="2">질문 목록을 불러오지 못했습니다.</td></tr>';
  }
}

function renderHomePreviewEntry(entry) {
  const sequence = Number(entry.sequence) || 0;
  const body = askMeEntryBody(entry);
  const answered = entry.status === 'answered' && body && String(entry.answer || '').trim();
  const status = entry.status === 'pending'
    ? ' · 답변 대기'
    : entry.status === 'private' ? ' · 비공개' : '';
  const mine = getReceipt(entry.id) ? ' <span class="askme-mine-mark">[내 질문]</span>' : '';
  const href = `askme.html#question=${encodeURIComponent(sequence)}`;

  return `
    <tr class="home-askme-preview-row">
      <td colspan="2">
        <a class="home-askme-preview-link" href="${href}" aria-label="${sequence}번째 질문 보기">
          <span class="meta"><b>${escapeHtml(questionLabel(entry))}</b>${mine} · ${escapeHtml(formatDate(entry.created))}${status}</span>
          <span class="home-askme-preview-question${answered ? '' : ' askme-placeholder'}">${answered ? '<b>Q.</b> ' : ''}${escapeHtml(askMeExcerpt(body, 80))}</span>
          ${answered ? `
            <span class="guestbook-owner-reply askme-answer home-askme-preview-answer">
              <span><b>A.</b> ${escapeHtml(askMeExcerpt(entry.answer, 120))}</span>
              <span class="guestbook-owner-reply-meta">— coldwaterkim${entry.answered_at ? ` · ${escapeHtml(formatDate(entry.answered_at))}` : ''}</span>
            </span>
          ` : ''}
        </a>
      </td>
    </tr>
  `;
}

function renderPublicEntry(entry) {
  const body = askMeEntryBody(entry);
  const answer = String(entry.answer || '').trim();
  const answered = entry.status === 'answered' && body && answer;
  const receipt = getReceipt(entry.id);
  const mine = receipt ? ' <span class="askme-mine-mark">[내 질문]</span>' : '';
  const unlock = entry.status === 'private' && !receipt ? renderPasswordUnlock() : '';

  return `
    <article id="question-${Number(entry.sequence) || ''}" class="entry askme-entry" data-ask-me-id="${escapeHtml(entry.id)}" data-ask-me-sequence="${Number(entry.sequence) || ''}">
      <div class="meta"><b>${escapeHtml(questionLabel(entry))}</b>${mine} · ${escapeHtml(formatDate(entry.created))}</div>
      <div class="askme-question${answered ? '' : ' askme-placeholder'}">${answered ? '<b>Q.</b> ' : ''}${escapeHtml(body)}</div>
      ${answered ? renderAnswer(answer, entry.answered_at) : ''}
      ${unlock}
      ${receipt ? renderReceiptTools(entry, receipt) : ''}
    </article>
  `;
}

function renderOwnerEntry(entry) {
  const answer = String(entry.answer || '').trim();
  const privacy = entry.is_private ? ' · <b>[비공개]</b>' : '';
  return `
    <article id="question-${Number(entry.sequence) || ''}" class="entry askme-entry askme-entry-owner" data-ask-me-id="${escapeHtml(entry.id)}" data-ask-me-sequence="${Number(entry.sequence) || ''}">
      <div class="meta"><b>${escapeHtml(questionLabel(entry))}</b> · ${escapeHtml(formatDate(entry.created))}${privacy}</div>
      <div class="askme-question"><b>Q.</b> ${escapeHtml(entry.question || '')}</div>
      ${answer ? renderAnswer(answer, entry.answered_at) : ''}
      <div class="guestbook-reply-actions"><button type="button" class="askme-question-edit-toggle">[질문 수정]</button> <button type="button" class="askme-answer-toggle">[${answer ? '답변 수정' : '답변하기'}]</button>${answer ? ' <button type="button" class="askme-answer-clear">[답변 지우기]</button>' : ''} <button type="button" class="askme-delete">[질문 삭제]</button></div>
      <form class="guestbook-reply-form askme-question-edit-form" hidden>
        <textarea rows="4" maxlength="1000" aria-label="질문 수정" required>${escapeHtml(entry.question || '')}</textarea>
        <div><button type="submit">[저장]</button> <button type="button" class="askme-question-edit-cancel">[취소]</button></div>
      </form>
      <form class="guestbook-reply-form askme-answer-form" hidden>
        <textarea rows="4" maxlength="3000" aria-label="답변" required>${escapeHtml(answer)}</textarea>
        <div><button type="submit">[저장]</button> <button type="button" class="askme-answer-cancel">[취소]</button></div>
      </form>
    </article>
  `;
}

function renderPasswordUnlock() {
  return `
    <details class="askme-private-unlock">
      <summary>비밀번호로 보기</summary>
      <form data-private-unlock>
        <label>비밀번호 <input type="password" autocomplete="current-password" required></label>
        <button type="submit">[내 질문 보기]</button>
        <span class="askme-inline-status" role="status"></span>
      </form>
    </details>
  `;
}

function renderReceiptTools(entry, receipt) {
  const url = buildReceiptUrl({
    id: entry.id,
    sequence: entry.sequence,
    receipt_token: receipt.token,
  });
  return `<div class="askme-receipt-tools"><button type="button" data-copy-receipt="${escapeHtml(url)}">[ 내 질문 링크 복사 ]</button> <span role="status"></span></div>`;
}

function renderDeletedOwnedEntry(entry) {
  const receipt = getReceipt(entry.id);
  return `
    <article id="question-${Number(entry.sequence) || ''}" class="entry askme-entry askme-entry-deleted" data-ask-me-id="${escapeHtml(entry.id)}" data-ask-me-sequence="${Number(entry.sequence) || ''}">
      <div class="meta"><b>${escapeHtml(questionLabel(entry))}</b> <span class="askme-mine-mark">[내 질문]</span>${entry.created ? ` · ${escapeHtml(formatDate(entry.created))}` : ''}</div>
      <div class="askme-deleted-copy">${escapeHtml(ASK_ME_DELETED_COPY)}</div>
      ${receipt ? renderReceiptTools(entry, receipt) : ''}
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

  entries.querySelectorAll('.askme-question-edit-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const questionForm = button.closest('.askme-entry')?.querySelector('.askme-question-edit-form');
      if (!questionForm) return;
      questionForm.hidden = !questionForm.hidden;
      if (!questionForm.hidden) questionForm.querySelector('textarea')?.focus();
    });
  });

  entries.querySelectorAll('.askme-question-edit-cancel').forEach(button => {
    button.addEventListener('click', () => {
      const questionForm = button.closest('.askme-question-edit-form');
      if (questionForm) questionForm.hidden = true;
    });
  });

  entries.querySelectorAll('.askme-question-edit-form').forEach(questionForm => {
    questionForm.addEventListener('submit', async event => {
      event.preventDefault();
      const entry = questionForm.closest('.askme-entry');
      const question = questionForm.querySelector('textarea')?.value.trim() || '';
      const submitButton = questionForm.querySelector('button[type="submit"]');
      if (!entry || !question) return;
      if (submitButton) submitButton.disabled = true;
      try {
        await pb.collection('ask_questions').update(entry.dataset.askMeId, { question });
        await loadAskMeEntries();
      } catch (error) {
        alert(`질문 수정 실패: ${cmsErrorMessage(error)}`);
        if (submitButton) submitButton.disabled = false;
      }
    });
  });

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
    answerForm.addEventListener('submit', async event => {
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

  entries.querySelectorAll('.askme-delete').forEach(button => {
    button.addEventListener('click', async () => {
      const entry = button.closest('.askme-entry');
      if (!entry || !confirm('이 질문을 삭제하시겠습니까? 질문과 답변 원문은 지워집니다.')) return;
      button.disabled = true;
      try {
        await pb.send(`/api/cwk/ask/questions/${encodeURIComponent(entry.dataset.askMeId)}`, { method: 'DELETE' });
        await loadAskMeEntries();
      } catch (error) {
        alert(`질문 삭제 실패: ${cmsErrorMessage(error)}`);
        button.disabled = false;
      }
    });
  });
}

function bindPublicActions() {
  if (!entries || isLoggedIn()) return;

  entries.querySelectorAll('[data-private-unlock]').forEach(form => {
    if (form.dataset.unlockBound) return;
    form.dataset.unlockBound = 'true';
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const entry = form.closest('.askme-entry');
      const password = form.querySelector('input[type="password"]')?.value || '';
      const status = form.querySelector('[role="status"]');
      if (!entry || !password.trim()) return;
      try {
        const owned = await readOwnedQuestion({ id: entry.dataset.askMeId, password });
        ownedQuestions.set(owned.id, owned);
        revealOwnedQuestion(entry, owned);
        if (status) status.textContent = '';
      } catch (error) {
        if (status) status.textContent = cmsErrorMessage(error);
      }
    });
  });

  entries.querySelectorAll('[data-copy-receipt]').forEach(button => {
    if (button.dataset.copyBound) return;
    button.dataset.copyBound = 'true';
    button.addEventListener('click', () => copyReceiptLink(button));
  });
}

async function revealStoredQuestions(items) {
  if (isLoggedIn() || !entries) return;
  await Promise.all(items.map(async item => {
    const receipt = getReceipt(item.id);
    if (!receipt) return;
    const element = entries.querySelector(`[data-ask-me-id="${cssEscape(item.id)}"]`);
    if (!element) return;
    try {
      const owned = ownedQuestions.get(item.id) || await readOwnedQuestion({
        id: item.id,
        receipt_token: receipt.token,
      });
      ownedQuestions.set(item.id, owned);
      revealOwnedQuestion(element, owned);
    } catch {
      removeReceipt(item.id);
      element.outerHTML = renderPublicEntry(item);
    }
  }));
  bindPublicActions();
}

function revealOwnedQuestion(element, owned) {
  if (!element || !owned) return;
  const question = element.querySelector('.askme-question');
  if (!question) return;
  if (owned.deleted) {
    question.innerHTML = `<span class="askme-deleted-copy">${escapeHtml(ASK_ME_DELETED_COPY)}</span>`;
    element.querySelector('.askme-answer')?.remove();
  } else {
    question.classList.remove('askme-placeholder');
    question.innerHTML = `<b>Q.</b> ${escapeHtml(owned.question || '')}`;
    element.querySelector('.askme-answer')?.remove();
    if (String(owned.answer || '').trim()) {
      question.insertAdjacentHTML('afterend', renderAnswer(owned.answer, owned.answered_at));
    }
  }
  element.querySelector('.askme-private-unlock')?.remove();
  if (!element.querySelector('.askme-mine-mark')) {
    element.querySelector('.meta b')?.insertAdjacentHTML('afterend', ' <span class="askme-mine-mark">[내 질문]</span>');
  }
}

function bindPrivateLookup() {
  privateLookupForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const sequence = Number(document.getElementById('askMeLookupSequence')?.value || 0);
    const password = document.getElementById('askMeLookupPassword')?.value || '';
    if (!sequence || !password.trim()) return;
    setLookupStatus('질문을 찾는 중...');
    try {
      const owned = await readOwnedQuestion({ sequence, password });
      ownedQuestions.set(owned.id, owned);
      target = { id: owned.id, sequence: Number(owned.sequence), receiptToken: '' };
      if (owned.deleted) {
        pendingDeletedTarget = owned;
      } else {
        pendingDeletedTarget = null;
        currentPage = await pageForSequence(owned.sequence);
      }
      history.replaceState(null, '', `#question=${encodeURIComponent(owned.sequence)}`);
      await loadAskMeEntries();
      const element = entries?.querySelector(`[data-ask-me-id="${cssEscape(owned.id)}"]`);
      if (element && !owned.deleted) revealOwnedQuestion(element, owned);
      focusTargetQuestion();
      setLookupStatus('');
    } catch (error) {
      setLookupStatus(cmsErrorMessage(error), true);
    }
  });
}

async function readOwnedQuestion(body) {
  return await pb.send('/api/cwk/ask/questions/read', { method: 'POST', body });
}

async function pageForSequence(sequence) {
  const n = Number(sequence);
  if (!Number.isFinite(n) || n < 1) return 1;
  try {
    const newer = await pb.collection('ask_question_feed').getList(1, 1, {
      filter: `sequence > ${n}`,
      fields: 'id',
    });
    return Math.floor((newer.totalItems || 0) / PAGE_SIZE) + 1;
  } catch {
    return 1;
  }
}

function focusTargetQuestion() {
  if (!target?.sequence || !entries) return;
  const element = document.getElementById(`question-${target.sequence}`);
  if (!element) return;
  element.classList.remove('is-askme-target');
  requestAnimationFrame(() => element.classList.add('is-askme-target'));
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      target = null;
      pendingDeletedTarget = null;
      loadAskMeEntries();
      document.querySelector('.visitor-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function pageButton(page, label) {
  return `<button type="button" data-page="${page}">${escapeHtml(label)}</button>`;
}

function questionLabel(entry) {
  const sequence = Number(entry?.sequence) || 0;
  return entry?.asker_name || `${sequence}번째 질문`;
}

function readTargetFromHash() {
  const values = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const sequence = Number(values.get('question') || 0);
  const id = values.get('id') || '';
  const receiptToken = values.get('receipt') || '';
  return sequence || id ? { sequence, id, receiptToken } : null;
}

function buildReceiptUrl(result) {
  const url = new URL('/askme.html', window.location.origin);
  url.hash = new URLSearchParams({
    question: String(result.sequence),
    id: String(result.id),
    receipt: String(result.receipt_token || result.token || ''),
  }).toString();
  return url.href;
}

function getReceipt(id) {
  return readReceipts()[id] || null;
}

function saveReceipt(receipt) {
  if (!receipt?.id || !receipt?.token) return;
  const receipts = readReceipts();
  receipts[receipt.id] = {
    sequence: Number(receipt.sequence) || 0,
    token: String(receipt.token),
  };
  try {
    localStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(receipts));
  } catch {
    // 저장소가 막힌 환경에서도 현재 URL의 receipt fragment로 열람할 수 있다.
  }
}

function removeReceipt(id) {
  const receipts = readReceipts();
  delete receipts[id];
  try {
    localStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(receipts));
  } catch {
    // 저장소를 사용할 수 없으면 제거도 생략한다.
  }
}

function readReceipts() {
  try {
    const value = JSON.parse(localStorage.getItem(RECEIPT_STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

async function copyReceiptLink(button) {
  const url = button.dataset.copyReceipt;
  const status = button.parentElement?.querySelector('[role="status"]');
  try {
    await navigator.clipboard.writeText(url);
    if (status) status.textContent = '복사했습니다.';
  } catch {
    const field = document.createElement('textarea');
    field.value = url;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.left = '-10000px';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    if (status) status.textContent = copied ? '복사했습니다.' : '주소창의 링크를 복사해주세요.';
  }
}

function setFormStatus(form, message, isError = false) {
  const status = form.querySelector('[data-askme-status]');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function setLookupStatus(message, isError = false) {
  if (!lookupStatus) return;
  lookupStatus.textContent = message;
  lookupStatus.classList.toggle('is-error', isError);
}

function writeSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // 세션 저장소가 막혀도 제출과 redirect는 계속된다.
  }
}

function takeSessionValue(key) {
  try {
    const value = sessionStorage.getItem(key) || '';
    sessionStorage.removeItem(key);
    return value;
  } catch {
    return '';
  }
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
