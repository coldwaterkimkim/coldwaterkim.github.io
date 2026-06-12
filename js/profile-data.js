export const ABOUT_PROFILE_DOCUMENT_VERSION = 2;

const DEFAULT_PROFILE_ROWS = [
  {
    key: 'real_name',
    aboutLabel: '본명',
    sidebarLabel: '본명',
    value: '김찬수',
  },
  {
    key: 'birth',
    aboutLabel: '출생',
    sidebarLabel: '출생',
    value: '2000년 11월 12일 08:51',
  },
  {
    key: 'nationality',
    aboutLabel: '국적',
    sidebarLabel: '국적',
    value: '대한민국',
  },
  {
    key: 'body',
    aboutLabel: '신체',
    sidebarLabel: '신체',
    value: '178cm 73kg',
  },
  {
    key: 'education',
    aboutLabel: '학력',
    sidebarLabel: '학력',
    value: [
      '<a class="profile-school-link" href="https://namu.wiki/w/%EC%84%9C%EC%9A%B8%EA%B0%80%EC%96%91%EC%B4%88%EB%93%B1%ED%95%99%EA%B5%90" target="_blank" rel="noopener noreferrer">가양초등학교</a>',
      '<a class="profile-school-link" href="https://namu.wiki/w/%EC%84%9C%EC%9A%B8%EC%A0%95%EA%B3%A1%EC%B4%88%EB%93%B1%ED%95%99%EA%B5%90" target="_blank" rel="noopener noreferrer">정곡초등학교</a>',
      '<a class="profile-school-link" href="https://namu.wiki/w/%EC%82%BC%EC%A0%95%EC%A4%91%ED%95%99%EA%B5%90(%EC%84%9C%EC%9A%B8)" target="_blank" rel="noopener noreferrer">삼정중학교</a>',
      '<a class="profile-school-link" href="https://namu.wiki/w/%EB%A7%88%ED%8F%AC%EA%B3%A0%EB%93%B1%ED%95%99%EA%B5%90" target="_blank" rel="noopener noreferrer">마포고등학교</a>',
      '<a class="profile-school-link" href="https://namu.wiki/w/%EC%84%B1%EA%B7%A0%EA%B4%80%EB%8C%80%ED%95%99%EA%B5%90" target="_blank" rel="noopener noreferrer">성균관대학교</a>',
    ].join('<br>'),
  },
  {
    key: 'military',
    aboutLabel: '병역',
    sidebarLabel: '병역',
    value: '<a class="profile-service-link" href="https://namu.wiki/w/%EC%A0%9C3%EB%B3%B4%EB%B3%91%EC%82%AC%EB%8B%A8" target="_blank" rel="noopener noreferrer">육군 만기전역</a>',
  },
  {
    key: 'links',
    aboutLabel: '링크',
    sidebarLabelHtml: 'Social<br>Media',
    value: '<a href="https://www.instagram.com/coldwater.kim/" target="_blank" rel="noopener noreferrer">Instagram</a> · <a href="https://x.com/coldwater_kimi" target="_blank" rel="noopener noreferrer">X</a> · <a href="https://open.spotify.com/user/31trg7txlc52iyxoypybf4bljdeu" target="_blank" rel="noopener noreferrer">Spotify</a> · <a href="https://github.com/coldwaterkimkim" target="_blank" rel="noopener noreferrer">GitHub</a>',
    sidebarValue: '<a class="profile-social-link" href="https://www.instagram.com/coldwater.kim/" target="_blank" rel="noopener noreferrer" title="Instagram" aria-label="Instagram"><img class="profile-social-icon" src="https://www.google.com/s2/favicons?sz=32&amp;domain=instagram.com" alt="Instagram"></a> <a class="profile-social-link" href="https://x.com/coldwater_kimi" target="_blank" rel="noopener noreferrer" title="X" aria-label="X"><img class="profile-social-icon" src="https://x.com/favicon.ico" alt="X"></a> <a class="profile-social-link" href="https://open.spotify.com/user/31trg7txlc52iyxoypybf4bljdeu" target="_blank" rel="noopener noreferrer" title="Spotify" aria-label="Spotify"><img class="profile-social-icon" src="https://www.google.com/s2/favicons?sz=32&amp;domain=spotify.com" alt="Spotify"></a> <a class="profile-social-link" href="https://github.com/coldwaterkimkim" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub"><img class="profile-social-icon" src="https://github.com/favicon.ico" alt="GitHub"></a>',
  },
  {
    key: 'email',
    aboutLabel: 'Email',
    sidebarLabel: 'Email',
    value: '<a href="mailto:ckstn1112@gmail.com?subject=Hello%20from%20your%20site">ckstn1112@gmail.com</a>',
    showInSidebar: false,
  },
];

const DEFAULT_ROWS_BY_KEY = new Map(DEFAULT_PROFILE_ROWS.map(row => [row.key, row]));

export function defaultAboutProfileRows() {
  return DEFAULT_PROFILE_ROWS.map(row => ({
    key: row.key,
    label: row.aboutLabel,
    value: row.value,
  }));
}

export function normalizeAboutProfileRows(rows, options = {}) {
  const savedRows = normalizeSavedRows(rows);
  if (!savedRows.length) return defaultAboutProfileRows();

  return options.mergeDefaults
    ? mergeRowsWithDefaults(savedRows)
    : savedRows;
}

export function sidebarProfileRowsFromDocument(doc) {
  const version = Number(doc?.profileSchemaVersion || 0);
  const rows = normalizeAboutProfileRows(doc?.profileRows, {
    mergeDefaults: version < ABOUT_PROFILE_DOCUMENT_VERSION,
  });

  return rows
    .map(toSidebarRow)
    .filter(Boolean);
}

export function defaultSidebarProfileRows() {
  return defaultAboutProfileRows()
    .map(toSidebarRow)
    .filter(Boolean);
}

export function renderProfileDetailTables(root = document, rows = defaultSidebarProfileRows()) {
  root.querySelectorAll('.profile-detail-table').forEach((table) => {
    table.innerHTML = rows.map(profileRowHtml).join('');
  });
}

function normalizeSavedRows(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map(row => {
      const fallback = findDefaultRow(row);
      const key = cleanText(row?.key) || fallback?.key || '';
      const label = cleanText(row?.label) || fallback?.aboutLabel || '';
      const value = cleanHtml(row?.value) || fallback?.value || '';

      return {
        key,
        label,
        value,
      };
    })
    .filter(row => row.label || row.value);
}

function mergeRowsWithDefaults(savedRows) {
  const rows = [];
  const usedKeys = new Set();

  DEFAULT_PROFILE_ROWS.forEach((defaultRow) => {
    const saved = savedRows.find(row => profileRowMatches(row, defaultRow));
    rows.push({
      key: defaultRow.key,
      label: saved?.label || defaultRow.aboutLabel,
      value: defaultRow.value,
    });
    usedKeys.add(defaultRow.key);
  });

  savedRows.forEach((row) => {
    const defaultRow = findDefaultRow(row);
    if (defaultRow && usedKeys.has(defaultRow.key)) return;
    rows.push(row);
  });

  return rows;
}

function toSidebarRow(row) {
  const defaultRow = findDefaultRow(row);
  if (defaultRow?.showInSidebar === false) return null;
  if (!defaultRow && normalizedLabel(row.label) === 'email') return null;

  return {
    label: defaultRow?.sidebarLabel || row.label,
    labelHtml: defaultRow?.sidebarLabelHtml || '',
    value: sidebarValueForRow(row, defaultRow),
  };
}

function sidebarValueForRow(row, defaultRow) {
  if (!defaultRow) return row.value || '';
  if (defaultRow.sidebarValue && (!row.value || row.value === defaultRow.value)) {
    return defaultRow.sidebarValue;
  }

  return row.value || defaultRow.value || '';
}

function profileRowHtml(row) {
  const label = row.labelHtml || escapeHtml(row.label || '');

  return `
    <tr>
      <th>${label}</th>
      <td>${row.value || ''}</td>
    </tr>
  `;
}

function findDefaultRow(row) {
  const key = cleanText(row?.key);
  if (key && DEFAULT_ROWS_BY_KEY.has(key)) return DEFAULT_ROWS_BY_KEY.get(key);

  const label = normalizedLabel(row?.label);
  return DEFAULT_PROFILE_ROWS.find(defaultRow => (
    normalizedLabel(defaultRow.aboutLabel) === label
    || normalizedLabel(defaultRow.sidebarLabel) === label
    || normalizedLabel(defaultRow.sidebarLabelHtml) === label
  )) || null;
}

function profileRowMatches(row, defaultRow) {
  return row.key === defaultRow.key
    || normalizedLabel(row.label) === normalizedLabel(defaultRow.aboutLabel)
    || normalizedLabel(row.label) === normalizedLabel(defaultRow.sidebarLabel)
    || normalizedLabel(row.label) === normalizedLabel(defaultRow.sidebarLabelHtml);
}

function normalizedLabel(value) {
  return cleanText(String(value || '').replace(/<br\s*\/?>/gi, ' '))
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanHtml(value) {
  return String(value || '').trim();
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value || '');
  return div.innerHTML;
}
