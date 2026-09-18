import { chatGptPreviewHtml } from './chatgpt-preview.js';
import '../css/chatgpt-preview.css';
import '@phosphor-icons/web/regular';
import { orderedRecordContent, recordTitle, stableOccurrenceId, safeMediaUrl } from './records-v2-model.mjs';
import { preferredTransferFiles, uniqueTransferFiles } from './editor-file-transfer.mjs';
import '../css/content-record-editor.css';
import { imageCropStyle } from './image-crop.mjs';

const previewUrl = value => String(value || '').startsWith('blob:') ? String(value) : safeMediaUrl(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const FiX='x', FiArrowLeft='arrow-left', FiChevronLeft='caret-left', FiChevronRight='caret-right', FiImage='image', FiVideo='video', FiMessageSquare='chat-text', FiFile='file', FiPlus='plus', FiArrowUp='arrow-up', FiArrowDown='arrow-down', FiCrop='crop', FiUploadCloud='cloud-arrow-up';
const icon = name => `<i class="ph ph-${name}" aria-hidden="true"></i>`;
const mediaLabel = item => item?.type === 'chatgpt' ? 'ChatGPT' : item?.type === 'youtube' ? 'YouTube' : ({image:'사진',video:'영상',audio:'오디오',file:'파일'}[item?.kind] || '콘텐츠');
const mediaIcon = item => icon(item?.type === 'chatgpt' ? 'open-ai-logo' : item?.type === 'youtube' || item?.kind === 'video' ? FiVideo : item?.kind === 'image' ? FiImage : FiFile);
const categoryOptions = value => [['daily','나으 하루'],['nasajab','나를 사로잡은 것들']].map(([id,label]) => `<option value="${id}" ${value === id ? 'selected' : ''}>${label}</option>`).join('');

/** Owner content composer. Data and upload/save authority remain with the caller. */
export function mountContentEditor(host, { draft, onChange, onClose, onSave, uploadFiles, resolveLink, editPhoto, onCategoryChange, onBusy, onDelete, legacyPreview = '', initialStep } = {}) {
  if (!host || !draft) throw new Error('편집할 기록을 찾지 못했어.');
  draft.body = String(draft.body || ''); draft.title = recordTitle(draft); draft.titleExplicit = true;
  draft.attachments ||= []; draft.embeds ||= []; draft.contentOrder ||= [];
  let step = initialStep || (draft.id || draft.body || draft.title || orderedRecordContent(draft).length || legacyPreview ? 'write' : 'select');
  let selected = orderedRecordContent(draft)[0]?.id || '', busy = false, destroyed = false, error = '', status = '', linkValue = '', dragId = '';
  let settingsOpen = globalThis.matchMedia?.('(min-width: 981px)').matches ?? true;
  const abort = new AbortController();
  const root = document.createElement('section'); root.className = 'content-editor'; root.setAttribute('aria-label','콘텐츠형 기록 편집기');
  host.replaceChildren(root);
  const items = () => orderedRecordContent(draft);
  const changed = () => { status = '저장하지 않은 변경사항'; onChange?.(draft); updateState(); };
  function updateState() {
    root.setAttribute('aria-busy', String(busy));
    root.querySelectorAll('button,input,textarea,select').forEach(el => { el.disabled = busy || el.dataset.unavailable === 'true' || (['draft','publish'].includes(el.dataset.action) && (!draft.recordDate || (!draft.body.trim() && !items().length && !legacyPreview))); });
    const msg = root.querySelector('[data-status]'); if (msg) msg.textContent = status;
    const err = root.querySelector('[data-error]'); if (err) { err.textContent = error; err.hidden = !error; }
  }
  function fail(value) { if (destroyed) return; error = value?.message || String(value); status = ''; updateState(); }
  async function operation(label, fn) {
    if (busy || destroyed) return;
    busy = true; onBusy?.(true); error = ''; status = label; updateState();
    try { await fn(); }
    catch (e) { fail(e); }
    finally { if (!destroyed) { busy = false; onBusy?.(false); updateState(); } }
  }
  const button = (action, label, symbol, cls = '', extra = '') => `<button type="button" class="ce-button ${cls}" data-action="${action}" ${extra}>${symbol ? icon(symbol) : ''}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
  function thumbnail(item) {
    const url = previewUrl(item.kind === 'image' ? item.url : item.posterUrl);
    return url ? `<img src="${esc(url)}" alt="" loading="lazy">` : `<span class="ce-media-icon">${mediaIcon(item)}</span>`;
  }
  function list(selection = false) {
    const all = items();
    return `<div class="ce-list ${selection ? 'ce-selection-list' : ''}" aria-label="선택한 콘텐츠">${all.map((item,i) => `<article class="ce-item ${selected === item.id ? 'is-selected' : ''}" data-item="${esc(item.id)}" draggable="true"><button type="button" class="ce-item-select" data-action="select" data-id="${esc(item.id)}" aria-pressed="${selected === item.id}"><span class="ce-number">${i+1}</span><span class="ce-thumb">${thumbnail(item)}</span><span class="ce-item-name">${esc(item.snapshot?.title || item.name || mediaLabel(item))}<small>${esc(mediaLabel(item))}</small></span></button><div class="ce-item-actions">${button('up','',FiArrowUp,'ce-icon-button',`data-id="${esc(item.id)}" aria-label="${i+1}번 콘텐츠 앞으로 이동" ${i===0?'data-unavailable="true"':''}`)}${button('down','',FiArrowDown,'ce-icon-button',`data-id="${esc(item.id)}" aria-label="${i+1}번 콘텐츠 뒤로 이동" ${i===all.length-1?'data-unavailable="true"':''}`)}${button('remove','',FiX,'ce-icon-button',`data-id="${esc(item.id)}" aria-label="${i+1}번 콘텐츠 제거"`)}</div></article>`).join('') || '<div class="ce-empty">아직 선택한 콘텐츠가 없어.<br>사진·영상이나 링크를 추가해봐.</div>'}</div>`;
  }
  function settings() {
    return `<details class="ce-settings" ${settingsOpen?'open':''}><summary>기록 설정</summary><div class="ce-settings-fields"><label>카테고리<select name="category">${categoryOptions(draft.category)}</select></label><label>기록 날짜<input name="recordDate" type="date" value="${esc(String(draft.recordDate || '').slice(0,10))}" required></label></div></details>`;
  }
  function preview(item, index, count) {
    let content = '';
    const url = previewUrl(item.url);
    if (item.kind === 'image') {
      const styles = imageCropStyle(item.crop || {});
      content = styles ? `<div class="ce-crop-frame" style="aspect-ratio:${esc(styles.frame.aspectRatio)};width:${Math.min(1, Number(styles.frame.aspectRatio))*100}%"><img src="${esc(url)}" alt="${esc(item.name || '선택한 사진')}" style="width:${esc(styles.image.width)};height:auto;left:${esc(styles.image.left)};top:${esc(styles.image.top)}"></div>` : `<img src="${esc(url)}" alt="${esc(item.name || '선택한 사진')}">`;
    }
    else if (item.kind === 'video') content = `<video src="${esc(previewUrl(item.playbackUrl) || url)}" ${item.posterUrl ? `poster="${esc(previewUrl(item.posterUrl))}"` : ''} controls playsinline preload="metadata"></video>`;
    else if (item.kind === 'audio') content = `<audio src="${esc(url)}" controls preload="metadata"></audio>`;
    else if (item.type === 'chatgpt') content = chatGptPreviewHtml(item);
    else content = `<div class="ce-link-preview">${mediaIcon(item)}<strong>${esc(item.snapshot?.title || item.name || mediaLabel(item))}</strong><p>${esc(item.type === 'chatgpt' ? '공유한 대화도 하나의 콘텐츠로 기록해.' : item.type === 'youtube' ? '공유한 영상을 기록해.' : '첨부한 파일')}</p><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${item.type ? '원본 열기' : '파일 열기'}</a></div>`;
    return `<div class="ce-preview ${item.type === 'chatgpt' ? 'ce-preview-chat' : ''} ${item.kind === 'image' || item.kind === 'video' ? 'ce-preview-media' : ''}">${content}<span class="ce-counter">${index+1} / ${count}</span>${count>1 ? button('previous','',FiChevronLeft,'ce-preview-previous',`aria-label="이전 콘텐츠" ${index===0?'data-unavailable="true"':''}`)+button('next-item','',FiChevronRight,'ce-preview-next',`aria-label="다음 콘텐츠" ${index===count-1?'data-unavailable="true"':''}`) : ''}</div>${item.kind === 'image' && editPhoto ? button('crop','사진 자르기',FiCrop,'ce-crop') : ''}`;
  }
  function render() {
    if (destroyed) return;
    const all = items(); if (!all.some(item => item.id === selected)) selected = all[0]?.id || '';
    const index = all.findIndex(item => item.id === selected), item = all[index], textOnly = !all.length;
    root.classList.toggle('ce-selecting', step === 'select'); root.classList.toggle('ce-text-only', step === 'write' && textOnly);
    root.innerHTML = `<header class="ce-header"><div class="ce-heading">${button(step === 'select' ? 'close' : 'back','',step === 'select' ? FiX : FiArrowLeft,'ce-icon-button',`aria-label="${step === 'select' ? '편집기 닫기' : '콘텐츠 선택으로 돌아가기'}"`)}<h2>${step === 'select' ? '새 기록' : textOnly ? '글만 쓰기' : '기록 작성'}</h2></div>${step === 'write' ? `<div class="ce-save-actions"><span class="ce-step-caption">2 / 2</span>${button('draft','임시 저장')}${button('publish','게시',null,'ce-primary')}${button('close','',FiX,'ce-icon-button','aria-label="편집기 닫기"')}</div>` : ''}</header><div class="ce-feedback"><span data-status role="status">${esc(status)}</span><p data-error role="alert" ${error?'':'hidden'}>${esc(error)}</p></div><input type="file" data-file-input accept="image/*,video/*" multiple hidden>${step === 'select' ? `<div class="ce-stepper"><strong>1 선택</strong><span>2 작성</span></div><div class="ce-selection-category"><label>카테고리<select name="category">${categoryOptions(draft.category)}</select></label></div><div class="ce-selection-body"><section class="ce-add-panel"><div class="ce-dropzone" data-dropzone><span class="ce-drop-icons">${icon(FiImage)}${icon(FiVideo)}</span><h3>사진·영상 선택</h3><p>파일을 끌어놓거나 아래 버튼으로 추가해.</p>${button('files','파일 선택',FiImage)}</div><label class="ce-link-label" for="ce-link-input">ChatGPT · YouTube 링크 추가</label><div class="ce-link-input"><input id="ce-link-input" name="link" type="url" placeholder="https://chatgpt.com/share/…" value="${esc(linkValue)}">${button('link','추가')}</div></section><section class="ce-selected-panel"><h3>선택한 콘텐츠 ${all.length}개</h3><p class="ce-hint">드래그하거나 화살표로 순서를 바꿔.</p>${list(true)}</section></div><footer class="ce-selection-footer">${button('text','콘텐츠 없이 글만 쓰기',null,'ce-text-link',all.length?'data-unavailable="true" title="선택한 콘텐츠를 제거하면 글만 쓸 수 있어."':'')}${button('write',`다음${all.length ? ` · ${all.length}개` : ''}`,null,'ce-primary',all.length?'':'data-unavailable="true"')}</footer>` : `<div class="ce-writing-body ${textOnly ? 'ce-text-layout' : ''}">${textOnly ? `<section class="ce-text-fields"><label>제목 <span class="ce-muted">· 선택</span><input name="title" placeholder="제목 없이 남겨도 좋아" value="${esc(draft.title)}"></label><label>본문 <span class="ce-muted">· 필수</span><textarea name="body" class="ce-body-text" placeholder="어떤 하루를 보냈어?" required>${esc(draft.body)}</textarea></label></section><aside class="ce-text-aside">${settings()}<p class="ce-hint">제목은 비워도 괜찮아.<br>본문은 꼭 작성해줘.</p>${button('back','사진·영상·링크 추가',FiImage)}</aside>` : `<section class="ce-content-column"><div class="ce-section-heading"><h3>콘텐츠 (${all.length})</h3>${button('back','추가 · 순서 변경',FiPlus)}</div>${list()}</section><section class="ce-preview-column"><h3>선택한 콘텐츠 미리보기</h3>${preview(item,index,all.length)}</section><label class="ce-global-text">기록 전체에 대한 글<textarea name="body" placeholder="이 기록에 대한 이야기를 남겨봐.">${esc(draft.body)}</textarea></label><label class="ce-caption-text">이 ${esc(mediaLabel(item))}에 대한 글 <span class="ce-muted">· ${index+1} / ${all.length}</span><textarea name="caption" placeholder="이 콘텐츠에 대한 이야기를 남겨봐.">${esc(item.comment)}</textarea></label><div class="ce-writing-settings">${settings()}</div><div class="ce-mobile-add">${button('back','콘텐츠 추가 · 순서 변경',FiPlus)}</div>`}${legacyPreview ? `<details class="ce-legacy"><summary>기존 본문 확인</summary><div data-legacy-preview></div></details>` : ''}</div>`}`;
    const legacyHost = root.querySelector('[data-legacy-preview]');
    if (legacyHost) {
      const value = typeof legacyPreview === 'function' ? legacyPreview() : legacyPreview;
      if (value instanceof Node) legacyHost.replaceChildren(value);
      else legacyHost.innerHTML = String(value || '');
    }
    if (onDelete && draft.id && step === 'write') {
      const deletion = document.createElement('button'); deletion.type='button'; deletion.className='ce-button ce-delete'; deletion.dataset.action='delete'; deletion.textContent='기록 삭제';
      root.querySelector('.ce-writing-settings,.ce-text-aside')?.append(deletion);
    }
    root.querySelector('.ce-settings')?.addEventListener('toggle',event=>{settingsOpen=event.target.open;});
    updateState();
  }
  async function addFiles(files) {
    const selectedFiles = uniqueTransferFiles(files); if (!selectedFiles.length) return;
    await operation('콘텐츠 업로드 중…', async () => {
      if (!uploadFiles) throw new Error('업로드 연결을 찾지 못했어.');
      const result = await uploadFiles(selectedFiles, { onProgress: value => { if (!destroyed) { status = typeof value === 'string' ? value : '콘텐츠 업로드 중…'; updateState(); } } });
      if (destroyed) return;
      for (const attachment of Array.from(result || [])) { attachment.id ||= stableOccurrenceId(); draft.attachments.push(attachment); draft.contentOrder.push(attachment.id); selected = attachment.id; }
      if (result?.errors?.length) error = result.errors.map(e => `${e.file?.name || '파일'}: ${e.error?.message || e.message || '업로드 실패'}`).join('\n');
      changed(); render();
    });
  }
  async function addLink() {
    if (busy || destroyed) return;
    const url = linkValue.trim(); if (!url) { fail(new Error('추가할 공유 링크를 입력해줘.')); return; }
    await operation('공유 링크 확인 중…', async () => {
      if (!resolveLink) throw new Error('공유 링크 연결을 찾지 못했어.');
      const embed = await resolveLink(url); if (destroyed) return;
      if (!embed) throw new Error('ChatGPT 또는 YouTube 공유 링크를 확인해줘.');
      if (draft.embeds.some(item => item.url === embed.url)) throw new Error('이미 추가한 공유 링크야.');
      embed.id ||= stableOccurrenceId(); draft.embeds.push(embed); draft.contentOrder.push(embed.id); selected = embed.id; linkValue = ''; changed(); render();
    });
  }
  function reorder(id, target) { const order = items().map(item => item.id), from = order.indexOf(id); if (from<0 || target<0 || target>=order.length) return; order.splice(from,1); order.splice(target,0,id); draft.contentOrder = order; changed(); render(); }
  async function save(saveStatus) {
    if (!draft.body.trim() && !items().length && !legacyPreview) { fail(new Error('본문을 입력해줘. 제목은 비워도 괜찮아.')); root.querySelector('[name="body"]')?.focus(); return; }
    if (!['daily','nasajab'].includes(draft.category) || !draft.recordDate) { fail(new Error('카테고리와 기록 날짜를 선택해줘.')); return; }
    await operation(saveStatus === 'published' ? '게시 중…' : '임시 저장 중…', async () => {
      if (!onSave) throw new Error('저장 연결을 찾지 못했어.');
      const saved = await onSave(saveStatus); if (destroyed) return;
      if (saved) Object.assign(draft,saved); status = saveStatus === 'published' ? '게시했어.' : '임시 저장했어.'; error = ''; render();
    });
  }
  root.addEventListener('input', event => {
    const el = event.target;
    if (el.name === 'link') { linkValue = el.value; return; }
    if (['title','body','recordDate'].includes(el.name)) { draft[el.name] = el.value; changed(); }
    if (el.name === 'caption') { const item = items().find(item => item.id === selected); if (item) { item.comment = el.value; changed(); } }
  }, {signal:abort.signal});
  root.addEventListener('change', event => {
    if (event.target.matches('[data-file-input]')) { const files = Array.from(event.target.files || []); event.target.value = ''; void addFiles(files); }
    if (event.target.name === 'category') { draft.category = event.target.value; onCategoryChange?.(draft.category); changed(); }
  }, {signal:abort.signal});
  root.addEventListener('keydown', event => { if (event.target.name === 'link' && event.key === 'Enter') { event.preventDefault(); void addLink(); } }, {signal:abort.signal});
  root.addEventListener('click', event => {
    const control = event.target.closest('[data-action]'); if (!control || busy || control.disabled) return;
    const action = control.dataset.action, id = control.dataset.id;
    if (action === 'close') onClose?.();
    else if (action === 'back') { step = 'select'; error = ''; render(); root.scrollIntoView({block:'start'}); }
    else if (action === 'text' || action === 'write') { step = 'write'; error = ''; render(); root.scrollIntoView({block:'start'}); }
    else if (action === 'delete') void operation('삭제 중…', () => onDelete?.());
    else if (action === 'files') root.querySelector('[data-file-input]').click();
    else if (action === 'link') void addLink();
    else if (action === 'select') { selected = id; render(); }
    else if (action === 'previous' || action === 'next-item') { const all = items(), at = all.findIndex(item => item.id === selected); selected = all[at + (action === 'previous' ? -1 : 1)]?.id || selected; render(); }
    else if (action === 'up' || action === 'down') reorder(id,items().findIndex(item => item.id === id) + (action === 'up' ? -1 : 1));
    else if (action === 'remove') { draft.attachments = draft.attachments.filter(item => item.id !== id); draft.embeds = draft.embeds.filter(item => item.id !== id); draft.contentOrder = draft.contentOrder.filter(value => value !== id); changed(); render(); }
    else if (action === 'draft' || action === 'publish') void save(action === 'publish' ? 'published' : 'draft');
    else if (action === 'crop') void operation('사진 편집 중…',async () => { const item = items().find(item => item.id === selected); const changes = await editPhoto?.(item); if (destroyed) return; if (changes) { Object.assign(item,changes); changed(); } else status = ''; render(); });
  }, {signal:abort.signal});
  root.addEventListener('dragstart', event => { if (busy) { event.preventDefault(); return; } dragId = event.target.closest('[data-item]')?.dataset.item || ''; if (dragId) { event.dataTransfer.setData('text/plain',dragId); event.dataTransfer.effectAllowed = 'move'; } }, {signal:abort.signal});
  root.addEventListener('dragover', event => { if (!busy && (dragId || Array.from(event.dataTransfer?.types || []).includes('Files'))) { event.preventDefault(); root.classList.add('ce-drag-over'); } }, {signal:abort.signal});
  root.addEventListener('dragend', () => { dragId = ''; root.classList.remove('ce-drag-over'); }, {signal:abort.signal});
  root.addEventListener('drop', event => { root.classList.remove('ce-drag-over'); if (busy) return; const files = preferredTransferFiles(event.dataTransfer); if (files.length) { event.preventDefault(); void addFiles(files); } else if (dragId) { event.preventDefault(); const target = event.target.closest('[data-item]')?.dataset.item; if (target) reorder(dragId,items().findIndex(item=>item.id===target)); dragId = ''; } }, {signal:abort.signal});
  root.addEventListener('paste', event => { if (busy) return; const files = preferredTransferFiles(event.clipboardData); if (files.length) { event.preventDefault(); void addFiles(files); } }, {signal:abort.signal});
  render();
  return { destroy() { destroyed = true; abort.abort(); root.remove(); if (busy) onBusy?.(false); }, refresh() { render(); }, setBusy(value) { busy = !!value; onBusy?.(busy); updateState(); } };
}
