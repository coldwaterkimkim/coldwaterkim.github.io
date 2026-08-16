import { albumMediaAnchorId, pocketBaseMediaReference } from './album-logic.mjs';
import { imageCropStyle, parseImageCrop, serializeImageCrop } from './image-crop.mjs';

const YOUTUBE_HOST_RE = /(^|\.)youtube(-nocookie)?\.com$/i;
const YOUTU_BE_HOST_RE = /(^|\.)youtu\.be$/i;
const POCKETBASE_IMAGE_RE = /\.(?:jpe?g|png)$/i;
const POCKETBASE_VIDEO_RE = /\.(?:mp4|mov|m4v|webm)$/i;
const POCKETBASE_FILE_PATH_RE = /\/api\/files\//;
const LEGACY_MEDIA_HOST = 'api.coldwaterkim.com';
const CURRENT_MEDIA_ORIGIN = 'https://coldwaterkim.com';
const MEDIA_THUMB_SMALL = '800x0';
const MEDIA_THUMB_LARGE = '1600x0';
const MEDIA_IMAGE_SIZES = '(max-width: 800px) 100vw, 800px';

export function prepareRichContentHtml(html = '') {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').trim();

    normalizeRichContentBlocks(template.content);
    template.content.querySelectorAll('video').forEach(video => {
        if (!video.getAttribute('src') && video.querySelector('source')) return;
        video.setAttribute('controls', '');
        video.setAttribute('preload', 'none');
        video.setAttribute('playsinline', '');
    });

    template.content.querySelectorAll('audio').forEach(audio => {
        audio.setAttribute('controls', '');
        audio.setAttribute('preload', 'none');
    });

    return template.innerHTML.trim();
}

export function prepareEmbeddedMediaForDisplay(html = '') {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').trim();
    decorateEmbeddedMedia(template.content);
    return template.innerHTML.trim();
}

export function enhanceEmbeddedMedia(scope = document) {
    const root = scope || document;
    decorateEmbeddedMedia(root);
    void hydratePocketBaseVideos(root);
}

export function decorateAlbumMediaAnchors(scope = document, sourceId = '') {
    if (!sourceId) return;
    const occurrences = new Map();

    scope.querySelectorAll('img, video').forEach(element => {
        const src = element.getAttribute('src') || element.querySelector?.('source')?.getAttribute('src') || '';
        const reference = pocketBaseMediaReference(src);
        if (!reference) return;
        const occurrence = (occurrences.get(reference.recordId) || 0) + 1;
        occurrences.set(reference.recordId, occurrence);
        const target = element.closest('.cwk-media-crop-frame') || element;
        target.id = albumMediaAnchorId(sourceId, reference.recordId, occurrence);
        target.dataset.cwkAlbumMedia = 'true';
    });
}

export function scrollToAlbumMediaHash(scope = document) {
    if (!globalThis.location?.hash) return false;
    const targetId = decodeURIComponent(globalThis.location.hash.slice(1));
    if (!targetId.startsWith('cwk-media-')) return false;
    const target = scope.querySelector(`#${CSS.escape(targetId)}`);
    if (!target) return false;

    const centerTarget = () => target.scrollIntoView({ block: 'center' });
    requestAnimationFrame(() => {
        centerTarget();
        target.classList.add('cwk-media-target');
    });
    globalThis.setTimeout(centerTarget, 300);
    globalThis.setTimeout(centerTarget, 1200);
    globalThis.setTimeout(() => target.classList.remove('cwk-media-target'), 2400);
    return true;
}

export function pocketBaseVideoReference(value = '', baseHref = globalThis.location?.href || CURRENT_MEDIA_ORIGIN) {
    let original;
    try {
        original = new URL(String(value || '').trim(), baseHref);
    } catch (_error) {
        return null;
    }

    const parts = original.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api' || parts[1] !== 'files' || parts.length < 5 || !POCKETBASE_VIDEO_RE.test(parts.at(-1))) {
        return null;
    }

    if (original.hostname === LEGACY_MEDIA_HOST) {
        original = new URL(`${original.pathname}${original.search}${original.hash}`, CURRENT_MEDIA_ORIGIN);
    }

    return {
        originalUrl: original.href,
        origin: original.origin,
        collection: parts[2],
        recordId: parts[3],
    };
}

export function videoDerivativeSources(reference, record) {
    if (!reference || !record?.id) return null;

    const collection = record.collectionId || reference.collection;
    const fileUrl = filename => {
        const url = new URL(`/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(record.id)}/${encodeURIComponent(filename)}`, reference.origin);
        return url.href;
    };

    const playbackUrl = record.video_status === 'ready' && record.web_video ? fileUrl(record.web_video) : '';
    const posterUrl = record.video_poster ? fileUrl(record.video_poster) : '';
    if (!playbackUrl && !posterUrl) return null;

    return {
        playbackUrl,
        posterUrl,
        originalUrl: reference.originalUrl,
    };
}

export function pocketBaseImageSources(value = '', baseHref = globalThis.location?.href || CURRENT_MEDIA_ORIGIN) {
    let original;
    try {
        original = new URL(String(value || '').trim(), baseHref);
    } catch (_error) {
        return null;
    }

    if (!POCKETBASE_FILE_PATH_RE.test(original.pathname) || !POCKETBASE_IMAGE_RE.test(original.pathname)) {
        return null;
    }

    if (original.hostname === LEGACY_MEDIA_HOST) {
        original = new URL(`${original.pathname}${original.search}${original.hash}`, CURRENT_MEDIA_ORIGIN);
    }

    const small = new URL(original.href);
    const large = new URL(original.href);
    small.searchParams.set('thumb', MEDIA_THUMB_SMALL);
    large.searchParams.set('thumb', MEDIA_THUMB_LARGE);

    return {
        originalUrl: original.href,
        editorPreviewUrl: small.href,
        displayUrl: large.href,
        srcset: `${small.href} 800w, ${large.href} 1600w`,
        sizes: MEDIA_IMAGE_SIZES,
    };
}

function decorateEmbeddedMedia(root) {
    normalizeRichContentBlocks(root);
    decorateImages(root);

    root.querySelectorAll('video').forEach(video => {
        if (video.dataset.cwkMediaReady === 'true') return;

        const src = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || '';
        const youtube = youtubeEmbedInfo(src);

        if (youtube) {
            replaceWithYouTubeEmbed(video, youtube);
            return;
        }

        video.setAttribute('controls', '');
        video.setAttribute('preload', 'none');
        video.setAttribute('playsinline', '');
        video.classList.add('cwk-rich-video');
        const reference = pocketBaseVideoReference(src);
        if (reference) video.dataset.cwkOriginalSrc = reference.originalUrl;
        video.dataset.cwkMediaReady = 'true';
    });

    root.querySelectorAll('audio').forEach(audio => {
        if (audio.dataset.cwkMediaReady === 'true') return;
        audio.setAttribute('controls', '');
        audio.setAttribute('preload', 'none');
        audio.classList.add('cwk-rich-audio');
        audio.dataset.cwkMediaReady = 'true';
    });

    root.querySelectorAll('iframe').forEach(iframe => {
        if (iframe.dataset.cwkMediaReady === 'true') return;
        const youtube = youtubeEmbedInfo(iframe.getAttribute('src') || '');
        if (!youtube) return;
        iframe.setAttribute('src', youtube.embedUrl);
        decorateMediaIframe(iframe, youtube.title);
        iframe.dataset.cwkMediaReady = 'true';
    });
}

async function hydratePocketBaseVideos(root) {
    const videos = [...root.querySelectorAll('video')]
        .map(video => {
            const src = video.dataset.cwkOriginalSrc || video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || '';
            return { video, reference: pocketBaseVideoReference(src) };
        })
        .filter(item => item.reference);
    if (!videos.length || typeof fetch !== 'function') return;

    const byOrigin = new Map();
    for (const item of videos) {
        const entries = byOrigin.get(item.reference.origin) || [];
        entries.push(item);
        byOrigin.set(item.reference.origin, entries);
    }

    await Promise.all([...byOrigin.entries()].map(async ([origin, entries]) => {
        const ids = [...new Set(entries.map(item => item.reference.recordId))];
        const filter = ids.map(id => `id="${id.replace(/"/g, '')}"`).join('||');
        const url = new URL('/api/collections/media/records', origin);
        url.searchParams.set('perPage', String(Math.min(ids.length, 500)));
        url.searchParams.set('filter', filter);
        url.searchParams.set('fields', 'id,collectionId,web_video,video_poster,video_status');

        try {
            const response = await fetch(url.href);
            if (!response.ok) return;
            const payload = await response.json();
            const records = new Map((payload.items || []).map(record => [record.id, record]));
            for (const { video, reference } of entries) {
                const sources = videoDerivativeSources(reference, records.get(reference.recordId));
                if (!sources) continue;
                applyVideoDerivatives(video, sources);
            }
        } catch (_error) {
            // 파생본 조회 실패 시 저장된 원본 URL 재생을 그대로 유지한다.
        }
    }));
}

function applyVideoDerivatives(video, sources) {
    video.dataset.cwkOriginalSrc = sources.originalUrl;
    if (sources.posterUrl) video.setAttribute('poster', sources.posterUrl);
    if (!sources.playbackUrl || !video.paused || video.currentTime > 0 || video.seeking) return;

    video.addEventListener('error', () => {
        if (video.dataset.cwkPlaybackFailed === 'true') return;
        video.dataset.cwkPlaybackFailed = 'true';
        const source = video.querySelector('source');
        if (source && !video.getAttribute('src')) {
            source.setAttribute('src', sources.originalUrl);
            source.removeAttribute('type');
        } else {
            video.setAttribute('src', sources.originalUrl);
        }
        delete video.dataset.cwkPlaybackSrc;
        video.load?.();
    }, { once: true });

    const source = video.querySelector('source');
    if (source && !video.getAttribute('src')) {
        source.setAttribute('src', sources.playbackUrl);
        source.setAttribute('type', 'video/mp4');
    } else {
        video.setAttribute('src', sources.playbackUrl);
    }
    video.dataset.cwkPlaybackSrc = sources.playbackUrl;
    video.load?.();
}

function decorateImages(root) {
    root.querySelectorAll('img').forEach(img => {
        if (img.dataset.cwkMediaReady === 'true') return;

        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');

        const storedSrc = img.getAttribute('src') || '';
        const crop = parseImageCrop(img.getAttribute('data-cwk-image-crop') || '');
        const sources = pocketBaseImageSources(storedSrc);
        let originalLink = null;
        if (sources) {
            img.dataset.cwkOriginalSrc = sources.originalUrl;
            img.setAttribute('src', sources.displayUrl);
            if (!img.getAttribute('srcset')) img.setAttribute('srcset', sources.srcset);
            if (!img.getAttribute('sizes')) img.setAttribute('sizes', sources.sizes);
            originalLink = wrapImageWithOriginalLink(img, sources.originalUrl);
        } else if (crop.enabled) {
            const originalUrl = pocketBaseOriginalImageUrl(storedSrc);
            if (originalUrl) {
                img.dataset.cwkOriginalSrc = originalUrl;
                originalLink = wrapImageWithOriginalLink(img, originalUrl);
            }
        }

        if (crop.enabled) applyImageCropFrame(img, crop, originalLink);

        img.dataset.cwkMediaReady = 'true';
    });
}

function wrapImageWithOriginalLink(img, originalUrl) {
    const existing = img.closest('a');
    if (existing) return existing;

    const link = document.createElement('a');
    link.className = 'cwk-media-original-link';
    link.href = originalUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = '원본 이미지 열기';
    img.replaceWith(link);
    link.appendChild(img);
    return link;
}

function applyImageCropFrame(img, crop, originalLink = null) {
    const cropStyles = imageCropStyle(crop);
    if (!cropStyles) return null;

    let frame = originalLink;
    if (!frame) {
        frame = document.createElement('span');
        img.replaceWith(frame);
        frame.appendChild(img);
    }

    const displayWidth = Math.max(1, Number(img.getAttribute('width') || crop.pixelWidth));
    img.removeAttribute('width');
    if (img.hasAttribute('srcset')) {
        const responsiveWidth = Math.ceil(100 / crop.width);
        const fixedWidth = Math.ceil(displayWidth / crop.width);
        img.setAttribute('sizes', `(max-width: ${displayWidth}px) ${responsiveWidth}vw, ${fixedWidth}px`);
    }
    frame.classList.add('cwk-media-crop-frame');
    frame.setAttribute('data-cwk-image-crop', serializeImageCrop(crop));
    frame.style.setProperty('--cwk-crop-aspect', cropStyles.frame.aspectRatio);
    frame.style.setProperty('--cwk-crop-display-width', `${displayWidth}px`);
    Object.assign(img.style, cropStyles.image);
    img.classList.add('cwk-image-crop-source');
    return frame;
}

function pocketBaseOriginalImageUrl(value = '') {
    let original;
    try {
        original = new URL(String(value || '').trim(), globalThis.location?.href || CURRENT_MEDIA_ORIGIN);
    } catch (_error) {
        return '';
    }

    if (!POCKETBASE_FILE_PATH_RE.test(original.pathname) || !/\.(?:jpe?g|png|gif|webp)$/i.test(original.pathname)) {
        return '';
    }
    if (original.hostname === LEGACY_MEDIA_HOST) {
        original = new URL(`${original.pathname}${original.search}${original.hash}`, CURRENT_MEDIA_ORIGIN);
    }
    return original.href;
}

function normalizeRichContentBlocks(root) {
    root.querySelectorAll('p').forEach(paragraph => {
        if (!isVisuallyEmptyParagraph(paragraph)) {
            delete paragraph.dataset.cwkEmptyLine;
            return;
        }

        paragraph.dataset.cwkEmptyLine = 'true';
        if (!paragraph.querySelector('br')) {
            paragraph.appendChild(document.createElement('br'));
        }
    });
}

function isVisuallyEmptyParagraph(paragraph) {
    if (!paragraph) return false;
    if (paragraph.querySelector('img, video, audio, iframe, table, ul, ol, pre, blockquote')) {
        return false;
    }

    return String(paragraph.textContent || '').replace(/\u00a0/g, '').trim() === '';
}

export function isYouTubeUrl(value = '') {
    return Boolean(youtubeEmbedInfo(value));
}

export function youtubeEmbedInfo(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return null;

    let url;
    try {
        url = new URL(raw, window.location.href);
    } catch (_error) {
        return null;
    }

    const host = url.hostname.replace(/^www\./i, '');
    let videoId = '';

    if (YOUTU_BE_HOST_RE.test(host)) {
        videoId = url.pathname.split('/').filter(Boolean)[0] || '';
    } else if (YOUTUBE_HOST_RE.test(host)) {
        const parts = url.pathname.split('/').filter(Boolean);
        if (url.pathname === '/watch') {
            videoId = url.searchParams.get('v') || '';
        } else if (['embed', 'shorts', 'live'].includes(parts[0])) {
            videoId = parts[1] || '';
        }
    }

    videoId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!videoId) return null;

    const embedUrl = new URL(`https://www.youtube.com/embed/${videoId}`);
    const start = youtubeStartSeconds(url);
    if (start > 0) embedUrl.searchParams.set('start', String(start));

    return {
        embedUrl: embedUrl.href,
        originalUrl: url.href,
        title: 'YouTube video'
    };
}

function replaceWithYouTubeEmbed(video, youtube) {
    const iframe = document.createElement('iframe');
    iframe.src = youtube.embedUrl;
    decorateMediaIframe(iframe, video.getAttribute('data-name') || video.getAttribute('title') || youtube.title);

    const wrapper = document.createElement('div');
    wrapper.className = 'cwk-embed cwk-embed-youtube';
    wrapper.dataset.cwkMediaReady = 'true';
    wrapper.appendChild(iframe);

    video.replaceWith(wrapper);
}

function decorateMediaIframe(iframe, title = 'Embedded video') {
    iframe.classList.add('cwk-rich-iframe');
    iframe.title = iframe.title || title;
    iframe.loading = iframe.loading || 'lazy';
    iframe.allow = iframe.allow || 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
}

function youtubeStartSeconds(url) {
    const raw = url.searchParams.get('start') || url.searchParams.get('t') || '';
    if (!raw) return 0;

    if (/^\d+$/.test(raw)) return Number(raw);

    const match = raw.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?/i);
    if (!match) return 0;

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    return (hours * 3600) + (minutes * 60) + seconds;
}
