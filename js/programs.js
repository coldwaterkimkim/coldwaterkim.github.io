import { isLoggedIn } from './pb.js';
import {
  TOOL_BY_ID,
  TOOL_CATEGORIES,
  TOOLS,
  runLocalTool,
  safeOutputFilename,
  validateToolInput,
} from './program-tools-catalog.mjs';

const el = id => document.getElementById(id);
const directory = el('programToolDirectory');
const workbench = el('programToolWorkbench');
const title = el('programToolTitle');
const engineBadge = el('programToolEngineBadge');
const description = el('programToolDescription');
const dropzone = el('programToolDropzone');
const fileInput = el('programToolFileInput');
const acceptText = el('programToolAcceptText');
const filesWrap = el('programToolFilesWrap');
const filesBody = el('programToolFiles');
const optionsRoot = el('programToolOptions');
const runButton = el('programToolRun');
const cancelButton = el('programToolCancel');
const resetButton = el('programToolReset');
const status = el('programToolStatus');
const progress = el('programToolProgress');
const result = el('programToolResult');

let selectedTool = null;
let selectedFiles = [];
let running = false;
let abortCurrent = null;
let resultUrl = '';

const s = (name, label, choices) => ({ name, label, type: 'select', choices });
const n = (name, label, min, max, step, value) => ({ name, label, type: 'number', min, max, step, value });
const t = (name, label, placeholder, value = '') => ({ name, label, type: 'text', placeholder, value });
const p = (name, label, placeholder) => ({ name, label, type: 'password', placeholder });
const c = (name, label, checked = true) => ({ name, label, type: 'checkbox', checked });

const OPTIONS = Object.freeze({
  'pdf-to-pptx': [n('scale', '페이지 해상도 배율', 1, 3, 0.5, 2)],
  'pdf-to-images': [s('format', '형식', [['png', 'PNG'], ['jpeg', 'JPG']]), n('scale', '해상도 배율', 0.5, 4, 0.5, 2), n('quality', 'JPG 품질', 0.1, 1, 0.05, 0.9)],
  'pdf-organize': [t('pageSpec', '남길 페이지', '예: 1-3,5,8-6 (비우면 전체)'), s('rotation', '전체 회전', [['0', '안 함'], ['90', '오른쪽 90°'], ['180', '180°'], ['270', '왼쪽 90°']])],
  'images-to-pdf': [s('pageSize', '종이 크기', [['image', '이미지에 맞춤'], ['a4', 'A4'], ['letter', 'Letter']]), s('fit', '배치', [['contain', '전체 보이기'], ['cover', '종이 가득 채우기']])],
  'pdf-page-number': [n('start', '시작 번호', 1, 9999, 1, 1), s('position', '위치', [['bottom', '아래'], ['top', '위']]), s('align', '정렬', [['center', '가운데'], ['right', '오른쪽'], ['left', '왼쪽']])],
  'pdf-watermark': [t('text', '문구', 'CONFIDENTIAL', 'CONFIDENTIAL'), n('opacity', '투명도', 0.05, 1, 0.05, 0.25), n('angle', '기울기', -90, 90, 1, -35)],
  'pdf-crop': [n('margin', '모든 방향 여백 (pt)', 0, 300, 1, 24)],
  'pdf-nup': [s('perPage', '한 장에', [['2', '2페이지'], ['4', '4페이지']]), s('orientation', '종이 방향', [['landscape', '가로'], ['portrait', '세로']])],
  'pdf-sanitize': [c('removeAnnotations', '주석 제거'), c('flatten', '폼 평탄화')],
  'pdf-redact-raster': [t('page', '적용 페이지', '예: 1', '1'), t('rect', '가릴 영역', 'x,y,width,height (0~1)', '0.1,0.1,0.8,0.1'), n('scale', '출력 해상도 배율', 1, 3, 0.5, 2)],
  'pdf-compare': [s('format', '결과', [['html', '비교 보고서 HTML'], ['json', '차이 데이터 JSON']])],
  'pdf-ocr': [s('language', '인식 언어', [['kor+eng', '한국어 + 영어'], ['kor', '한국어'], ['eng', '영어']])],
  'pdf-compress': [s('quality', '압축 강도', [['balanced', '균형'], ['strong', '강하게'], ['light', '약하게']])],
  'pdf-protect': [p('password', '열기 암호', '8자 이상 권장')],
  'pdf-unlock': [p('password', '현재 암호', 'PDF 암호')],
  'image-convert': [s('format', '결과 형식', [['jpeg', 'JPG'], ['png', 'PNG'], ['webp', 'WebP']]), n('quality', '품질', 0.1, 1, 0.05, 0.9)],
  'image-compress': [n('maxSizeMB', '목표 용량 (MB)', 0.05, 20, 0.05, 1), n('maxWidthOrHeight', '긴 변 최대 (px)', 320, 12000, 10, 2560)],
  'image-resize': [n('width', '가로 (px)', 1, 20000, 1, 1920), n('height', '세로 (px)', 1, 20000, 1, 1080), c('keepAspect', '비율 유지')],
  'image-center-crop': [n('width', '가로 (px)', 1, 20000, 1, 1080), n('height', '세로 (px)', 1, 20000, 1, 1080)],
  'image-rotate': [s('angle', '회전', [['90', '오른쪽 90°'], ['180', '180°'], ['270', '왼쪽 90°']])],
  'image-watermark': [t('text', '문구', 'coldwaterkim', 'coldwaterkim'), n('opacity', '투명도', 0.05, 1, 0.05, 0.35)],
  'sheet-convert': [s('format', '결과 형식', [['xlsx', 'XLSX'], ['csv', 'CSV'], ['json', 'JSON'], ['html', 'HTML'], ['markdown', 'Markdown']])],
  'sheet-merge': [s('mode', '합치는 방법', [['rows', '행으로 이어 붙이기'], ['sheets', '파일별 시트 만들기']])],
  'sheet-compare': [c('ignoreWhitespace', '앞뒤 공백 무시')],
  'sheet-clean': [c('dedupe', '중복 행 제거'), c('removeBlank', '빈 행 제거')],
  'sheet-select-columns': [t('columns', '남길 열', '쉼표로 구분: 이름,이메일,금액')],
});

const FALLBACK_DESCRIPTIONS = Object.freeze({
  'pdf-merge': '여러 PDF를 현재 순서대로 한 파일로 합칩니다.',
  'pdf-organize': '필요한 페이지만 골라 순서와 방향을 정리합니다.',
  'images-to-pdf': '여러 이미지를 한 개의 PDF로 묶습니다.',
  'pdf-to-images': 'PDF 페이지를 PNG 또는 JPG로 꺼냅니다.',
  'pdf-page-number': '모든 페이지에 번호를 넣습니다.',
  'pdf-watermark': '반복 워터마크를 넣습니다.',
  'pdf-crop': '페이지 바깥 여백을 잘라냅니다.',
  'pdf-nup': '2쪽 또는 4쪽을 종이 한 장에 배치합니다.',
  'pdf-sanitize': '문서 정보와 주석을 제거합니다.',
  'pdf-compare': '두 PDF의 다른 부분을 표시합니다.',
  'pdf-compress': '화질과 용량의 균형을 잡아 압축합니다.',
  'pdf-protect': '열기 암호를 넣습니다.',
  'pdf-unlock': '알고 있는 암호를 제거합니다.',
  'pdf-repair': '깨진 PDF 구조를 다시 써서 복구합니다.',
  'pdf-grayscale': '인쇄하기 좋은 흑백 PDF로 바꿉니다.',
  'pdf-to-text': 'PDF의 글자를 TXT로 꺼냅니다.',
  'image-convert': 'JPG, PNG, WebP 사이를 일괄 변환합니다.',
  'image-compress': '여러 이미지의 용량을 한꺼번에 줄입니다.',
  'image-resize': '여러 이미지의 가로·세로 크기를 통일합니다.',
  'image-center-crop': '지정 크기에 맞춰 가운데를 잘라냅니다.',
  'image-rotate': '여러 이미지를 같은 각도로 돌립니다.',
  'image-watermark': '여러 이미지에 같은 글자 워터마크를 넣습니다.',
  'image-strip-metadata': 'EXIF와 위치정보 없이 새 이미지로 저장합니다.',
  'sheet-convert': 'XLSX, CSV, JSON, HTML, Markdown 표로 바꿉니다.',
  'sheet-merge': '여러 파일을 행 또는 시트 단위로 합칩니다.',
  'sheet-split': '통합 문서의 각 시트를 개별 파일로 나눕니다.',
  'sheet-compare': '두 표의 추가·삭제·변경 셀을 찾습니다.',
  'sheet-clean': '중복과 빈 행열, 불필요한 공백을 정리합니다.',
  'sheet-select-columns': '필요한 열만 골라 새 파일로 만듭니다.',
  'sheet-transpose': '행과 열을 서로 뒤집습니다.',
  'sheet-extract-media': '엑셀 안에 박힌 이미지를 꺼냅니다.',
  'sheet-sanitize': '작성자와 문서 속성 등 메타데이터를 제거합니다.',
});

renderDirectory();
bindWorkbench();

function renderDirectory() {
  if (!directory) return;
  directory.replaceChildren(...TOOL_CATEGORIES.map(category => {
    const section = document.createElement('section');
    section.className = 'file-tool-category';
    section.dataset.toolCategory = category.id;
    const heading = document.createElement('h3');
    heading.className = 'file-tool-category-title';
    heading.textContent = category.label;
    const table = document.createElement('table');
    table.className = 'file-tool-directory-table';
    Object.assign(table, { border: '1', cellSpacing: '0', cellPadding: '5', width: '100%' });
    table.innerHTML = '<thead><tr bgcolor="#f0f0f0"><th align="left">작업</th><th align="left">설명</th><th>처리</th></tr></thead>';
    const tbody = document.createElement('tbody');
    TOOLS.filter(item => item.category === category.id).forEach(item => tbody.append(toolRow(item)));
    table.append(tbody);
    section.append(heading, table);
    return section;
  }));
}

function toolRow(tool) {
  const row = document.createElement('tr');
  row.dataset.toolId = tool.id;
  const name = document.createElement('td');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-tool-link';
  button.dataset.selectTool = tool.id;
  button.textContent = tool.label;
  name.append(button);
  const detail = document.createElement('td');
  detail.textContent = tool.description || FALLBACK_DESCRIPTIONS[tool.id] || '파일을 골라 바로 처리합니다.';
  const engine = document.createElement('td');
  engine.className = 'file-tool-engine-cell';
  engine.textContent = tool.engine === 'local' ? '🖥 브라우저' : '🍎 아이맥';
  row.append(name, detail, engine);
  return row;
}

function bindWorkbench() {
  directory?.addEventListener('click', event => {
    const button = event.target.closest('[data-select-tool]');
    if (button) selectTool(button.dataset.selectTool);
  });
  fileInput?.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = '';
  });
  for (const name of ['dragenter', 'dragover']) dropzone?.addEventListener(name, event => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', event => {
    if (event.relatedTarget instanceof Node && dropzone.contains(event.relatedTarget)) return;
    dropzone.classList.remove('is-dragover');
  });
  dropzone?.addEventListener('drop', event => {
    event.preventDefault();
    dropzone.classList.remove('is-dragover');
    addFiles(event.dataTransfer?.files);
  });
  filesBody?.addEventListener('click', event => {
    const button = event.target.closest('[data-file-action]');
    if (!button || running) return;
    const index = Number.parseInt(button.dataset.fileIndex, 10);
    if (!Number.isInteger(index)) return;
    if (button.dataset.fileAction === 'remove') selectedFiles.splice(index, 1);
    if (button.dataset.fileAction === 'up' && index > 0) [selectedFiles[index - 1], selectedFiles[index]] = [selectedFiles[index], selectedFiles[index - 1]];
    if (button.dataset.fileAction === 'down' && index < selectedFiles.length - 1) [selectedFiles[index + 1], selectedFiles[index]] = [selectedFiles[index], selectedFiles[index + 1]];
    renderFiles();
  });
  runButton?.addEventListener('click', runSelectedTool);
  cancelButton?.addEventListener('click', () => abortCurrent?.());
  resetButton?.addEventListener('click', resetWorkbench);
}

function selectTool(id) {
  const tool = TOOL_BY_ID.get(id);
  if (!tool || running) return;
  selectedTool = tool;
  selectedFiles = [];
  clearResult();
  directory.querySelectorAll('[data-tool-id]').forEach(row => row.classList.toggle('is-selected', row.dataset.toolId === id));
  title.textContent = tool.label;
  engineBadge.textContent = tool.engine === 'local' ? '🖥 브라우저 처리' : '🍎 아이맥 처리';
  engineBadge.dataset.engine = tool.engine;
  description.textContent = tool.description || FALLBACK_DESCRIPTIONS[tool.id] || '파일을 골라 바로 처리합니다.';
  fileInput.accept = tool.accept.join(',');
  fileInput.multiple = tool.maxFiles !== 1;
  acceptText.textContent = `${acceptLabel(tool.accept)} · 최대 ${tool.maxFiles}개`;
  renderOptions(tool);
  renderFiles();
  setStatus(tool.engine === 'server' && !isLoggedIn() ? '이 도구는 OWNER 로그인 뒤 사용할 수 있어.' : '파일을 넣어줘.');
  workbench?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function addFiles(fileList) {
  if (!selectedTool) return setStatus('먼저 위 표에서 도구를 골라줘.', 'error');
  const incoming = Array.from(fileList || []);
  const accepted = incoming.filter(file => fileMatchesTool(file, selectedTool));
  if (accepted.length !== incoming.length) setStatus('이 도구에서 받을 수 없는 파일은 뺐어.', 'error');
  for (const file of accepted) {
    if (selectedFiles.length >= selectedTool.maxFiles) break;
    selectedFiles.push(file);
  }
  if (selectedFiles.length) setStatus(`${selectedFiles.length}개 파일 준비됨.`);
  renderFiles();
}

function renderFiles() {
  if (!filesBody) return;
  filesWrap.hidden = selectedFiles.length === 0;
  filesBody.replaceChildren(...selectedFiles.map((file, index) => {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    const controls = document.createElement('span');
    controls.className = 'file-tool-order-controls';
    controls.append(action('↑', 'up', index, index === 0), action('↓', 'down', index, index === selectedFiles.length - 1));
    name.append(controls, document.createTextNode(safeOutputFilename(file.name, `파일 ${index + 1}`)));
    const size = document.createElement('td');
    size.className = 'file-tool-size-cell';
    size.textContent = formatBytes(file.size);
    const remove = document.createElement('td');
    remove.className = 'file-tool-remove-cell';
    remove.append(action('×', 'remove', index));
    row.append(name, size, remove);
    return row;
  }));
  updateRunButton();
}

function renderOptions(tool) {
  const schemas = OPTIONS[tool.id] || [];
  optionsRoot.replaceChildren();
  optionsRoot.hidden = schemas.length === 0;
  if (!schemas.length) return;
  const heading = document.createElement('b');
  heading.textContent = '옵션';
  const grid = document.createElement('div');
  grid.className = 'file-tool-options-grid';
  schemas.forEach(schema => grid.append(optionControl(schema)));
  optionsRoot.append(heading, grid);
}

function optionControl(schema) {
  const label = document.createElement('label');
  label.className = `file-tool-option${schema.type === 'checkbox' ? ' file-tool-option--check' : ''}`;
  const caption = document.createElement('span');
  caption.textContent = schema.label;
  const input = schema.type === 'select' ? document.createElement('select') : document.createElement('input');
  input.dataset.toolOption = schema.name;
  if (schema.type === 'select') schema.choices.forEach(([value, text]) => input.add(new Option(text, value)));
  else {
    input.type = schema.type;
    if (schema.placeholder) input.placeholder = schema.placeholder;
    for (const key of ['min', 'max', 'step']) if (schema[key] !== undefined) input[key] = String(schema[key]);
    if (schema.type === 'checkbox') input.checked = schema.checked;
    else input.value = String(schema.value ?? '');
  }
  label.append(...(schema.type === 'checkbox' ? [input, caption] : [caption, input]));
  return label;
}

async function runSelectedTool() {
  if (!selectedTool || running) return;
  try {
    validateToolInput(selectedTool.id, selectedFiles);
    if (selectedTool.engine === 'server' && !isLoggedIn()) {
      const next = encodeURIComponent(`${window.location.pathname}?tool=${selectedTool.id}`);
      result.hidden = false;
      result.innerHTML = `<b>OWNER 전용 도구야.</b> <a href="/admin/login.html?next=${next}">로그인하고 계속하기</a>`;
      return setStatus('로그인이 필요해.', 'error');
    }
    setRunning(true);
    clearResult();
    progress.hidden = false;
    progress.value = 2;
    const options = collectOptions();
    let output;
    if (selectedTool.engine === 'local') {
      output = await runLocalTool(selectedTool.id, selectedFiles, normalizeOptions(selectedTool.id, options), updateProgress);
    } else {
      const server = await import('./program-tools-server.mjs');
      const controller = new AbortController();
      abortCurrent = () => controller.abort();
      output = await server.runServerToolClient(selectedTool.id, selectedFiles, options, {
        signal: controller.signal,
        onProgress: updateProgress,
      });
    }
    showResult(output);
    setStatus(output.summary || '작업 끝. 결과를 내려받아.', 'success');
    progress.value = 100;
  } catch (error) {
    setStatus(error?.name === 'AbortError' ? '작업을 취소했어. 임시 파일도 정리 중이야.' : (error?.message || '작업에 실패했어.'), 'error');
  } finally {
    setRunning(false);
    abortCurrent = null;
    setTimeout(() => { if (!running) progress.hidden = true; }, 900);
  }
}

function normalizeOptions(toolId, options) {
  if (toolId === 'pdf-redact-raster') {
    const [x, y, width, height] = String(options.rect || '').split(',').map(Number);
    options.redactions = [{ page: Number(options.page) || 1, x, y, width, height, unit: 'ratio', color: '#000000' }];
    delete options.page;
    delete options.rect;
  }
  return options;
}

function updateProgress(update = {}) {
  const total = Math.max(1, Number(update.total) || 1);
  const completed = Math.max(0, Number(update.completed) || 0);
  progress.value = Math.min(95, Math.max(3, Math.round((completed / total) * 95)));
  if (update.message) setStatus(update.message);
}

function showResult(output) {
  clearResult();
  resultUrl = URL.createObjectURL(output.blob);
  const link = document.createElement('a');
  link.className = 'file-tool-download';
  link.href = resultUrl;
  link.download = safeOutputFilename(output.filename, 'result.bin');
  link.textContent = `⬇ ${link.download} 내려받기 (${formatBytes(output.blob.size)})`;
  result.replaceChildren(link);
  result.hidden = false;
}

function collectOptions() {
  const values = {};
  optionsRoot?.querySelectorAll('[data-tool-option]').forEach(input => {
    if (input.type === 'checkbox') values[input.dataset.toolOption] = input.checked;
    else if (input.type === 'number') values[input.dataset.toolOption] = Number(input.value);
    else values[input.dataset.toolOption] = input.value.trim();
  });
  return values;
}

function resetWorkbench() {
  if (running) return;
  selectedFiles = [];
  clearResult();
  progress.hidden = true;
  progress.value = 0;
  renderFiles();
  setStatus(selectedTool ? '파일을 넣어줘.' : '도구를 골라줘.');
}

function clearResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = '';
  result.hidden = true;
  result.replaceChildren();
}

function setRunning(value) {
  running = value;
  fileInput.disabled = value;
  resetButton.disabled = value;
  cancelButton.hidden = !value || selectedTool?.engine !== 'server';
  dropzone.classList.toggle('is-disabled', value);
  updateRunButton();
}

function updateRunButton() {
  const enough = selectedTool && selectedFiles.length >= (selectedTool.minFiles || 1);
  runButton.disabled = running || !enough;
  runButton.textContent = running ? '작업 중...' : '작업 시작';
}

function setStatus(message, type = 'info') {
  status.textContent = message;
  status.dataset.type = type;
}

function fileMatchesTool(file, tool) {
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return tool.accept.some(raw => {
    const accept = raw.toLowerCase();
    if (accept.startsWith('.')) return name.endsWith(accept);
    if (accept.endsWith('/*')) return type.startsWith(accept.slice(0, -1));
    return type === accept;
  });
}

function action(text, kind, index, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-tool-small-button';
  button.dataset.fileAction = kind;
  button.dataset.fileIndex = String(index);
  button.textContent = text;
  button.disabled = disabled;
  button.setAttribute('aria-label', kind === 'remove' ? '파일 빼기' : kind === 'up' ? '위로 옮기기' : '아래로 옮기기');
  return button;
}

function acceptLabel(values) {
  return Array.from(new Set(values.map(value => value.replace('image/*', '이미지').replace('application/pdf', 'PDF').replace(/^\./, '').toUpperCase()))).slice(0, 8).join(' · ');
}

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const requestedTool = new URLSearchParams(window.location.search).get('tool');
if (requestedTool && TOOL_BY_ID.has(requestedTool)) selectTool(requestedTool);
window.addEventListener('pagehide', clearResult, { once: true });
