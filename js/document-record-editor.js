import { preferredTransferFiles, uniqueTransferFiles } from './editor-file-transfer.mjs';

const mounts = new WeakMap();

/** Document editing adapter; persistence and upload authorization belong to the caller. */
export async function mountDocumentEditor(host, {
  html: initialHtml = '', onChange, uploadFiles, onBusy, onError,
} = {}) {
  if (!(host instanceof HTMLElement)) throw new Error('본문 편집 영역을 찾지 못했어.');
  mounts.get(host)?.();
  let editor, destroyed = false, initializing = true, changed = false;
  let baseline = '', activity = 0;
  const original = String(initialHtml || '');
  const events = new AbortController();
  const container = document.createElement('div');
  container.className = 'document-record-editor';
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.hidden = true;
  input.setAttribute('aria-label', '사진·영상·파일 첨부');
  const mount = document.createElement('div');
  container.append(input, mount);
  host.replaceChildren(container);
  let cancel;
  const cancelled = new Promise((_, reject) => { cancel = () => reject(new DOMException('편집기가 닫혔어.', 'AbortError')); });
  // Cancellation may happen before an import/ready race starts listening.
  cancelled.catch(() => {});
  const report = error => { if (!destroyed) onError?.(error instanceof Error ? error : new Error(String(error))); };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    cancel();
    events.abort();
    lifecycle.disconnect();
    editor?.cropDialogRoot?.unmount?.();
    editor?.destroy?.();
    if (editor) editor.blockNote = null;
    container.remove();
    if (activity) { activity = 0; onBusy?.(false); }
    if (mounts.get(host) === destroy) mounts.delete(host);
  };
  const lifecycle = new MutationObserver(() => {
    if (!host.isConnected || container.parentNode !== host) destroy();
  });
  if (host.isConnected) lifecycle.observe(document.documentElement, { childList: true, subtree: true });
  mounts.set(host, destroy);
  const currentIndex = () => editor?.clampIndex(editor.getSelection()?.index) ?? 0;
  const uploaded = async files => {
    if (destroyed) return [];
    if (typeof uploadFiles !== 'function') throw new Error('첨부 업로드 연결이 없어.');
    const results = await uploadFiles(uniqueTransferFiles(files));
    if (destroyed) return [];
    if (results?.errors?.length) report(new Error(results.errors.map(item => `${item.file?.name || '파일'}: ${item.error?.message || item.message || '전송 실패'}`).join('\n')));
    return Array.from(results || []).filter(file => file?.url).map(file => ({ ...file, type: file.mime || file.type || ({ image: 'image/*', video: 'video/*', audio: 'audio/*' }[file.kind]) || '' }));
  };
  const insertFiles = async files => {
    const list = uniqueTransferFiles(files);
    if (destroyed || !list.length) return;
    const index = currentIndex();
    await editor.withUploadActivity(async () => {
      const attachments = await uploaded(list);
      if (!destroyed && attachments.length) editor.insertFiles(index, attachments);
    });
  };
  try {
    const { createMarkdownEditor } = await Promise.race([import('./markdown-editor.js'), cancelled]);
    if (destroyed) throw new DOMException('편집기가 닫혔어.', 'AbortError');
    editor = await createMarkdownEditor(mount, {
      placeholder: '기록을 남겨봐.',
      onImageButton: () => { if (!destroyed) input.click(); },
      onChange: value => {
        if (destroyed || initializing || value === baseline) return;
        baseline = value;
        changed = true;
        onChange?.(value);
      },
      onFilesPaste: insertFiles,
      onFilesPasteError: report,
      uploadFile: async file => {
        const files = await uploaded([file]);
        if (!files.length) throw new Error('파일을 첨부하지 못했어.');
        return files[0].url;
      },
    });
    if (destroyed) {
      editor.destroy();
      editor.blockNote = null;
      throw new DOMException('편집기가 닫혔어.', 'AbortError');
    }
    // Reuse media quiescence and cover both file uploads and ChatGPT preview fetches.
    const originalActivity = editor.withUploadActivity.bind(editor);
    editor.withUploadActivity = async callback => {
      if (destroyed) return;
      if (++activity === 1) onBusy?.(true);
      try { return await originalActivity(callback); }
      finally {
        if (!destroyed && --activity === 0) onBusy?.(false);
      }
    };
    mount.querySelector('.blocknote-editor-badge')?.remove();
    const button = mount.querySelector('.markdown-editor-image-button');
    if (button) button.textContent = '사진·영상·파일';
    editor.setHtml(original);
    await Promise.race([editor.ready(), cancelled]);
    // BlockNote may normalize HTML during initialization. Do not persist that conversion.
    baseline = editor.html();
    initializing = false;
    input.addEventListener('change', () => {
      const files = Array.from(input.files || []);
      input.value = '';
      void insertFiles(files).catch(report);
    }, { signal: events.signal });
    const transfer = event => {
      const files = preferredTransferFiles(event.clipboardData || event.dataTransfer);
      if (!files.length) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      void insertFiles(files).catch(report);
    };
    // Capture at the outer wrapper, before BlockNote's own upload handlers; URL-only
    // paste continues to its existing YouTube/ChatGPT handling unchanged.
    container.addEventListener('paste', transfer, { capture: true, signal: events.signal });
    container.addEventListener('drop', transfer, { capture: true, signal: events.signal });
    container.addEventListener('dragover', event => {
      if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
    }, { signal: events.signal });
    return {
      destroy,
      html: () => changed ? (destroyed ? baseline : editor.html()) : original,
      hasContent: () => {
        const template = document.createElement('template');
        template.innerHTML = changed ? (destroyed ? baseline : editor.html()) : original;
        return Boolean(template.content.textContent.trim() || template.content.querySelector('img,video,audio,iframe,object,embed,[data-cwk-chatgpt-embed]'));
      },
    };
  } catch (error) {
    if (error?.name !== 'AbortError') report(error);
    destroy();
    throw error;
  }
}
