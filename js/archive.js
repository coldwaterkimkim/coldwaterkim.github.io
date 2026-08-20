import {
  cmsErrorMessage,
  formatDate,
  getAnsweredGuestbookEntry,
  getAnsweredGuestbookSummaryTimeline,
  getPublishedDailySummaryTimeline,
  getPublishedNasajabSummaryTimeline,
  getPublishedPostSummaryTimeline,
  getPublishedProgramSummaryTimeline,
} from './pb.js';
import { buildArchiveEntries } from './archive-logic.mjs';

initArchiveList();
initGuestbookReplyDetail();

async function initArchiveList() {
  const tbody = document.querySelector('#archive-list');
  if (!tbody || tbody.dataset.archiveReady === 'true') return;
  tbody.dataset.archiveReady = 'true';

  try {
    const [posts, daily, programs, nasajab, guestbook] = await Promise.all([
      getPublishedPostSummaryTimeline(),
      getPublishedDailySummaryTimeline(),
      getPublishedProgramSummaryTimeline(),
      getPublishedNasajabSummaryTimeline(),
      getAnsweredGuestbookSummaryTimeline(),
    ]);
    const entries = buildArchiveEntries({ posts, daily, programs, nasajab, guestbook });

    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="3">아직 공개된 글이 없습니다.</td></tr>';
      return;
    }

    tbody.replaceChildren(...entries.map(archiveRow));
  } catch (error) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = cmsErrorMessage(error);
    row.append(cell);
    tbody.replaceChildren(row);
  }
}

function archiveRow(entry) {
  const row = document.createElement('tr');
  const titleCell = document.createElement('td');
  const link = document.createElement('a');
  link.href = entry.url;
  link.textContent = entry.title;
  titleCell.append(link);

  const categoryCell = document.createElement('td');
  categoryCell.className = 'archive-category-cell';
  categoryCell.textContent = entry.categoryLabel;

  const dateCell = document.createElement('td');
  dateCell.className = 'date-cell';
  dateCell.align = 'right';
  dateCell.textContent = formatDate(entry.date);

  row.append(categoryCell, titleCell, dateCell);
  return row;
}

async function initGuestbookReplyDetail() {
  const root = document.querySelector('#archive-guestbook-detail');
  if (!root || root.dataset.archiveReady === 'true') return;
  root.dataset.archiveReady = 'true';

  const id = new URLSearchParams(window.location.search).get('id') || '';
  if (!/^[A-Za-z0-9]{15}$/.test(id)) {
    renderDetailError(root, '올바른 방명록 항목을 찾지 못했습니다.');
    return;
  }

  try {
    const entry = await getAnsweredGuestbookEntry(id);
    if (!entry) {
      renderDetailError(root, '아직 주인장 답글이 없거나 항목을 찾지 못했습니다.');
      return;
    }

    const title = `${String(entry.name || '').trim() || '익명의 누군가'}: 방명록`;
    const heading = root.querySelector('[data-archive-title]');
    const date = root.querySelector('[data-archive-date]');
    const body = root.querySelector('[data-archive-body]');
    heading.textContent = title;
    date.textContent = formatDate(entry.display_date || entry.created);
    body.textContent = String(entry.owner_reply || '').trim();
    document.title = `${title} — coldwaterkim`;
  } catch (error) {
    renderDetailError(root, cmsErrorMessage(error));
  }
}

function renderDetailError(root, message) {
  const heading = root.querySelector('[data-archive-title]');
  const date = root.querySelector('[data-archive-date]');
  const body = root.querySelector('[data-archive-body]');
  heading.textContent = '방명록 답글';
  date.textContent = '';
  body.textContent = message;
}
