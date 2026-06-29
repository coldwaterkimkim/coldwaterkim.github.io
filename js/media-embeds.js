const YOUTUBE_HOST_RE = /(^|\.)youtube(-nocookie)?\.com$/i;
const YOUTU_BE_HOST_RE = /(^|\.)youtu\.be$/i;

export function prepareRichContentHtml(html = '') {
    const template = document.createElement('template');
    template.innerHTML = String(html || '').trim();

    template.content.querySelectorAll('video').forEach(video => {
        if (!video.getAttribute('src') && video.querySelector('source')) return;
        video.setAttribute('controls', '');
        video.setAttribute('preload', 'metadata');
        video.setAttribute('playsinline', '');
    });

    template.content.querySelectorAll('audio').forEach(audio => {
        audio.setAttribute('controls', '');
        audio.setAttribute('preload', 'metadata');
    });

    return template.innerHTML.trim();
}

export function enhanceEmbeddedMedia(scope = document) {
    const root = scope || document;

    root.querySelectorAll('video').forEach(video => {
        if (video.dataset.cwkMediaReady === 'true') return;

        const src = video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || '';
        const youtube = youtubeEmbedInfo(src);

        if (youtube) {
            replaceWithYouTubeEmbed(video, youtube);
            return;
        }

        video.setAttribute('controls', '');
        video.setAttribute('preload', 'metadata');
        video.setAttribute('playsinline', '');
        video.classList.add('cwk-rich-video');
        video.dataset.cwkMediaReady = 'true';
    });

    root.querySelectorAll('audio').forEach(audio => {
        if (audio.dataset.cwkMediaReady === 'true') return;
        audio.setAttribute('controls', '');
        audio.setAttribute('preload', 'metadata');
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
