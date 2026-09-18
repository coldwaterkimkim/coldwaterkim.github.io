import {displayDate} from './display-date.mjs';
import {getGuestbookEntries,addGuestbookEntry,saveGuestbookReply,clearGuestbookReply,isLoggedIn,deleteGuestbookEntry,guestbookDisplayDate,sortGuestbookEntriesForDisplay,trackAnalyticsEvent,analyticsPageKey,escapeHtml,cmsErrorMessage} from './pb.js';
export function initGuestbookPage(scope = document) {
  const guestbookForm = scope.querySelector('#guestbookForm');
  const guestbookEntries = scope.querySelector('#guestbookEntries');
  if (!guestbookForm || !guestbookEntries) return;
  if (guestbookForm.dataset.guestbookReady === 'true') return;
  guestbookForm.dataset.guestbookReady = 'true';
  const submitButton = guestbookForm.querySelector('button[type="submit"]');
  const submitStatus = guestbookForm.querySelector('#guestbookSubmitStatus');
  const messageInput = guestbookForm.querySelector('#message');
  const messageCount = guestbookForm.querySelector('#guestbookMessageCount');
  const updateMessageCount = () => { if (messageCount) messageCount.textContent = String(messageInput?.value.length || 0); };
  messageInput?.addEventListener('input', updateMessageCount);
  updateMessageCount();

  function setGuestbookSubmitting(isSubmitting) {
    guestbookForm.dataset.guestbookSubmitting = String(isSubmitting);
    guestbookForm.setAttribute('aria-busy', String(isSubmitting));
    guestbookForm.querySelectorAll('button, input, select, textarea').forEach(control => {
      control.disabled = isSubmitting;
    });
    if (submitButton) {
      submitButton.setAttribute('aria-busy', String(isSubmitting));
    }
  }

  function setGuestbookSubmitStatus(message = '') {
    if (submitStatus) submitStatus.textContent = message;
  }

  guestbookForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (guestbookForm.dataset.guestbookSubmitting === 'true') return;

    const nameEl = guestbookForm.querySelector('#guestName');
    const messageEl = guestbookForm.querySelector('#message');
    const message = messageEl?.value.trim() || '';

    if (!message) {
      alert('메시지를 입력해주세요.');
      return;
    }

    setGuestbookSubmitting(true);
    setGuestbookSubmitStatus('방명록을 남기는 중...');

    try {
      const typedName = nameEl?.value.trim() || '';
      const name = typedName || await nextGuestbookName();
      await addGuestbookEntry(name, message);
      trackAnalyticsEvent('guestbook_complete', {
        pageKey: analyticsPageKey(),
        action: 'submit'
      }).catch(error => console.warn('Anonymous analytics failed:', cmsErrorMessage(error)));
      guestbookForm.reset();
      updateMessageCount();
      await loadGuestbook(guestbookEntries);
      setGuestbookSubmitStatus('방명록을 남겼습니다.');
    } catch (e) {
      setGuestbookSubmitStatus('작성에 실패했습니다. 다시 시도해주세요.');
      alert('방명록 작성 실패: ' + cmsErrorMessage(e));
    } finally {
      setGuestbookSubmitting(false);
    }
  });

  loadGuestbook(guestbookEntries);
}

async function loadGuestbook(guestbookEntries) {
  if (!guestbookEntries) return;
  guestbookEntries.innerHTML = '<p>불러오는 중...</p>';

  try {
    const result = await getGuestbookEntries(1, 200);
    const entries = sortGuestbookEntriesForDisplay(result.items);

    if (entries.length === 0) {
      guestbookEntries.innerHTML = '<p>아직 방명록이 없습니다. 첫 번째로 인사해주세요!</p>';
      return;
    }

    const isAdmin = isLoggedIn();

    guestbookEntries.innerHTML = entries.map(entry => {
      const dateLabel = displayDate(guestbookDisplayDate(entry));
      const metaPrefix = dateLabel ? `[${dateLabel}] ` : '';
      const replyMessage = String(entry.owner_reply || '').trim();
      const replyDate = displayDate(entry.owner_replied_at);
      const deleteBtn = isAdmin
        ? `<button class="del-btn" data-id="${entry.id}" style="font-size:10px; color:red; border:1px solid red; background:white; cursor:pointer; margin-left:5px;">[삭제]</button>`
        : '';
      const replyBlock = replyMessage
        ? `
          <div class="guestbook-owner-reply">
            <div class="guestbook-owner-reply-meta">↳ <b>coldwaterkim의 답글</b>${replyDate ? ` · ${replyDate}` : ''}</div>
            <div>${linkify(escapeHtml(replyMessage))}</div>
            ${isAdmin ? `
              <div class="guestbook-reply-actions">
                <button type="button" class="reply-toggle-btn">[답글 수정]</button>
                <button type="button" class="reply-delete-btn" data-id="${entry.id}">[답글 삭제]</button>
              </div>
            ` : ''}
          </div>
        `
        : isAdmin
          ? '<div class="guestbook-reply-actions"><button type="button" class="reply-toggle-btn">[답글 달기]</button></div>'
          : '';
      const replyForm = isAdmin
        ? `
          <form class="guestbook-reply-form" data-id="${entry.id}" hidden>
            <label><b>coldwaterkim의 답글</b></label>
            <textarea rows="3" maxlength="1000" required>${escapeHtml(replyMessage)}</textarea>
            <div>
              <button type="submit">[저장]</button>
              <button type="button" class="reply-cancel-btn">[취소]</button>
            </div>
          </form>
        `
        : '';

      return `
        <div class="entry" data-guestbook-entry-id="${entry.id}">
          <div class="meta">
            ${metaPrefix}by <b>${escapeHtml(entry.name)}</b>
            ${deleteBtn}
          </div>
          <div>${linkify(escapeHtml(entry.message))}</div>
          ${replyBlock}
          ${replyForm}
        </div>
      `;
    }).join('');

    // 삭제 버튼 이벤트
    if (isAdmin) {
      guestbookEntries.querySelectorAll('.del-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('이 방명록을 삭제하시겠습니까?')) return;
          try {
            await deleteGuestbookEntry(btn.dataset.id);
            loadGuestbook(guestbookEntries);
          } catch (e) {
            alert('삭제 실패: ' + cmsErrorMessage(e));
          }
        });
      });

      guestbookEntries.querySelectorAll('.reply-toggle-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const form = btn.closest('.entry')?.querySelector('.guestbook-reply-form');
          if (!form) return;
          form.hidden = !form.hidden;
          if (!form.hidden) form.querySelector('textarea')?.focus();
        });
      });

      guestbookEntries.querySelectorAll('.reply-cancel-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const form = btn.closest('.guestbook-reply-form');
          if (form) form.hidden = true;
        });
      });

      guestbookEntries.querySelectorAll('.guestbook-reply-form').forEach(form => {
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const textarea = form.querySelector('textarea');
          const submitBtn = form.querySelector('button[type="submit"]');
          const message = textarea?.value.trim() || '';
          if (!message) {
            alert('답글 내용을 입력해주세요.');
            return;
          }

          if (submitBtn) submitBtn.disabled = true;
          try {
            await saveGuestbookReply(form.dataset.id, message);
            loadGuestbook(guestbookEntries);
          } catch (e) {
            alert('답글 저장 실패: ' + cmsErrorMessage(e));
            if (submitBtn) submitBtn.disabled = false;
          }
        });
      });

      guestbookEntries.querySelectorAll('.reply-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('이 답글을 삭제하시겠습니까?')) return;
          btn.disabled = true;
          try {
            await clearGuestbookReply(btn.dataset.id);
            loadGuestbook(guestbookEntries);
          } catch (e) {
            alert('답글 삭제 실패: ' + cmsErrorMessage(e));
            btn.disabled = false;
          }
        });
      });
    }
  } catch (e) {
    guestbookEntries.innerHTML = `<p>${escapeHtml(cmsErrorMessage(e))}</p>`;
  }
}

async function nextGuestbookName() {
  const result = await getGuestbookEntries(1, 200);
  const maxNumber = result.items.reduce((max, entry) => {
    const match = String(entry.name || '').match(/^익명의 누군가(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `익명의 누군가${maxNumber + 1}`;
}
// URL 링크 변환
function linkify(str) {
  return str.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}
