const EDITOR_MEDIA_SELECTOR = 'video, audio';
const MEDIA_SOURCE_SELECTOR = 'source[src]';
const QUIESCED_ATTRIBUTE = 'data-cwk-upload-quiesced';

export function observeEditorMediaDuringUploads(uploadContainer, options = {}) {
  if (!uploadContainer?.classList) return inertController();

  const mediaRoot = options.mediaRoot || uploadContainer;
  const records = new Map();
  const Observer = options.MutationObserverClass || globalThis.MutationObserver;
  const baseUrl = options.baseUrl
    || mediaRoot?.ownerDocument?.baseURI
    || globalThis.location?.href
    || '';
  const origin = options.origin || urlOrigin(baseUrl);
  let active = false;

  const suspend = () => {
    active = true;
    suspendSameOriginEditorMedia(mediaRoot, records, { baseUrl, origin });
  };

  const restore = () => {
    active = false;
    restoreEditorMedia(records);
  };

  const sync = () => {
    if (uploadContainer.classList.contains('is-image-uploading')) {
      suspend();
    } else if (active || records.size > 0) {
      restore();
    }
  };

  const stateObserver = typeof Observer === 'function'
    ? new Observer(sync)
    : null;
  stateObserver?.observe(uploadContainer, {
    attributes: true,
    attributeFilter: ['class'],
  });

  const mediaObserver = typeof Observer === 'function'
    ? new Observer(() => {
      if (active) suspend();
    })
    : null;
  mediaObserver?.observe(mediaRoot, {
    attributes: true,
    attributeFilter: ['src'],
    childList: true,
    subtree: true,
  });

  sync();

  return {
    get active() {
      return active;
    },
    sync,
    destroy(options = {}) {
      stateObserver?.disconnect();
      mediaObserver?.disconnect();
      if (options.restore === false) {
        active = false;
        records.clear();
      } else {
        restore();
      }
    },
  };
}

export function suspendSameOriginEditorMedia(root, records = new Map(), options = {}) {
  const baseUrl = options.baseUrl
    || root?.ownerDocument?.baseURI
    || globalThis.location?.href
    || '';
  const origin = options.origin || urlOrigin(baseUrl);

  for (const media of editorMediaElements(root)) {
    const existing = records.get(media);
    if (!existing && !hasSameOriginSource(media, { baseUrl, origin })) continue;

    const record = existing || captureMediaState(media);
    if (!existing) {
      records.set(media, record);
      safelyCall(media, 'pause');
    }

    let detachedSource = false;
    if (media.hasAttribute?.('src')) {
      record.hadMediaSrc = true;
      record.mediaSrc = media.getAttribute('src');
      media.removeAttribute('src');
      detachedSource = true;
    }

    for (const source of media.querySelectorAll?.(MEDIA_SOURCE_SELECTOR) || []) {
      record.sources.set(source, source.getAttribute('src'));
      source.removeAttribute('src');
      detachedSource = true;
    }

    media.setAttribute?.('preload', 'none');
    media.setAttribute?.(QUIESCED_ATTRIBUTE, 'true');
    if (detachedSource) safelyCall(media, 'load');
  }

  return records;
}

export function restoreEditorMedia(records) {
  for (const [media, record] of records) {
    if (media?.isConnected === false) continue;

    if (record.hadMediaSrc) {
      media.setAttribute?.('src', record.mediaSrc ?? '');
    } else {
      media.removeAttribute?.('src');
    }

    for (const [source, src] of record.sources) {
      if (source?.isConnected === false) continue;
      source.setAttribute?.('src', src ?? '');
    }

    if (record.hadPreload) {
      media.setAttribute?.('preload', record.preload ?? '');
    } else {
      media.removeAttribute?.('preload');
    }
    media.removeAttribute?.(QUIESCED_ATTRIBUTE);

    safelyCall(media, 'load');
    restorePlaybackState(media, record);
  }

  records.clear();
}

export function isSameOriginMediaUrl(value, options = {}) {
  if (!value) return false;

  try {
    const url = new URL(value, options.baseUrl || globalThis.location?.href);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const origin = options.origin || urlOrigin(options.baseUrl || globalThis.location?.href || '');
    return Boolean(origin) && url.origin === origin;
  } catch (_error) {
    return false;
  }
}

function captureMediaState(media) {
  return {
    hadMediaSrc: media.hasAttribute?.('src') || false,
    mediaSrc: media.getAttribute?.('src'),
    hadPreload: media.hasAttribute?.('preload') || false,
    preload: media.getAttribute?.('preload'),
    currentTime: Number.isFinite(media.currentTime) ? media.currentTime : 0,
    wasPlaying: media.paused === false,
    playbackRate: Number.isFinite(media.playbackRate) ? media.playbackRate : 1,
    muted: Boolean(media.muted),
    volume: Number.isFinite(media.volume) ? media.volume : 1,
    sources: new Map(),
  };
}

function restorePlaybackState(media, record) {
  if ('muted' in media) media.muted = record.muted;
  if ('volume' in media) media.volume = record.volume;
  if ('playbackRate' in media) media.playbackRate = record.playbackRate;

  const restorePosition = () => {
    if (!(record.currentTime > 0) || !('currentTime' in media)) return;
    try {
      media.currentTime = record.currentTime;
    } catch (_error) {
      // Some browsers only accept a seek after metadata is available.
    }
  };
  const resume = () => {
    if (!record.wasPlaying || typeof media.play !== 'function') return;
    try {
      media.play()?.catch?.(() => {});
    } catch (_error) {
      // Playback can be blocked if the browser revokes the earlier gesture.
    }
  };

  if (record.currentTime > 0 && Number(media.readyState || 0) < 1 && typeof media.addEventListener === 'function') {
    media.addEventListener('loadedmetadata', () => {
      restorePosition();
      resume();
    }, { once: true });
    return;
  }

  restorePosition();
  resume();
}

function hasSameOriginSource(media, options) {
  const candidates = [
    media.currentSrc,
    media.getAttribute?.('src'),
    ...Array.from(media.querySelectorAll?.(MEDIA_SOURCE_SELECTOR) || [], source => source.getAttribute('src')),
  ];
  return candidates.some(value => isSameOriginMediaUrl(value, options));
}

function editorMediaElements(root) {
  const elements = [];
  if (root?.matches?.(EDITOR_MEDIA_SELECTOR)) elements.push(root);
  elements.push(...(root?.querySelectorAll?.(EDITOR_MEDIA_SELECTOR) || []));
  return elements;
}

function safelyCall(target, method) {
  try {
    target?.[method]?.();
  } catch (_error) {
    // A detached or not-yet-initialized media element can reject load/pause.
  }
}

function urlOrigin(value) {
  try {
    return new URL(value).origin;
  } catch (_error) {
    return '';
  }
}

function inertController() {
  return {
    active: false,
    sync() {},
    destroy() {},
  };
}
