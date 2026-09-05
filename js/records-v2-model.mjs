import { normalizeImageCrop, parseImageCrop } from './image-crop.mjs';
import { normalizeChatGptSnapshot, chatGptShareInfo } from './chatgpt-embeds.mjs';
export const stableOccurrenceId = () => globalThis.crypto?.randomUUID?.() || `occ-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function safeMediaUrl(value) {
  if (!String(value || '').trim()) return '';
  try { const u = new URL(String(value || ''), 'https://coldwaterkim.com'); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
}
export function mediaKind(mime = '', name = '') {
  if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/i.test(name)) return 'video';
  if (mime.startsWith('audio/') || /\.mp3$/i.test(name)) return 'audio';
  return 'file';
}
export function normalizeRecord(input = {}) {
  return {
    id: String(input.id || ''), created: String(input.created || ''), updated: String(input.updated || ''), category: input.category === 'daily' ? 'daily' : 'posts', body: String(input.body || ''),
    attachments: Array.from(input.attachments || []).map(a => ({ id: String(a.id || stableOccurrenceId()), mediaId: String(a.mediaId || ''), url: safeMediaUrl(a.url), name: String(a.name || ''), mime: String(a.mime || ''), kind: ['image','video','audio','file'].includes(a.kind) ? a.kind : mediaKind(a.mime, a.name), crop: a.crop?.enabled ? normalizeImageCrop(a.crop) : null, comment: String(a.comment || ''), ...(a.playbackUrl ? {playbackUrl:safeMediaUrl(a.playbackUrl)} : {}), ...(a.posterUrl ? {posterUrl:safeMediaUrl(a.posterUrl)} : {}) })),
    embeds: Array.from(input.embeds || []).filter(e => ['chatgpt','youtube'].includes(e.type)).map(e => ({ id: String(e.id || stableOccurrenceId()), type: e.type, url: safeMediaUrl(e.url), snapshot: e.type === 'chatgpt' ? normalizeChatGptSnapshot(e.snapshot) : null })),
    ...(input.legacyHtml != null ? { legacyHtml: String(input.legacyHtml) } : {}),
    ...(input.legacySource != null ? { legacySource: input.legacySource } : {}),
    status: input.status === 'published' ? 'published' : 'draft', recordDate: String(input.recordDate || ''), firstPublishedAt: String(input.firstPublishedAt || ''), revision: Number(input.revision || 0)
  };
}
const allowedTags = new Set('p br div span section article h1 h2 h3 h4 h5 h6 strong b em i u s del code pre blockquote ul ol li table thead tbody tfoot tr th td hr a img video audio source figure figcaption details summary'.split(' '));
const allowedAttrs = new Set('href src alt title width height controls preload playsinline colspan rowspan open class data-cwk-image-crop data-cwk-chatgpt-embed data-cwk-chatgpt-snapshot data-cwk-chatgpt-error data-cwk-chatgpt-link data-role poster type'.split(' '));
export function sanitizeLegacyHtml(html, Parser = globalThis.DOMParser) {
  if (!Parser) throw new Error('HTML parser required');
  const doc = new Parser().parseFromString(String(html || ''), 'text/html');
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    const tag = el.localName;
    if (tag === 'iframe') {
      const src = safeMediaUrl(el.getAttribute('src'));
      let accepted = false;
      try { const url = new URL(src); accepted = ['www.youtube.com','youtube.com','www.youtube-nocookie.com','youtube-nocookie.com'].includes(url.hostname) && /^\/embed\/[a-zA-Z0-9_-]+$/.test(url.pathname); } catch {}
      if (!accepted) { el.remove(); continue; }
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name);
      el.setAttribute('src',src); el.setAttribute('title','YouTube 영상'); el.setAttribute('loading','lazy'); el.setAttribute('allowfullscreen',''); el.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
      continue;
    }
    if (!allowedTags.has(tag)) { if (['script','style','iframe','object','embed','form','input','button','svg','math','template'].includes(tag)) el.remove(); else el.replaceWith(...el.childNodes); continue; }
    for (const attr of Array.from(el.attributes)) {
      if (!allowedAttrs.has(attr.name)) el.removeAttribute(attr.name);
      else if (['src','href','poster'].includes(attr.name)) { const url = safeMediaUrl(attr.value); if (url) el.setAttribute(attr.name, url); else el.removeAttribute(attr.name); }
    }
    if (tag === 'a') { el.setAttribute('target','_blank'); el.setAttribute('rel','noopener noreferrer'); }
    if (tag === 'img') { el.setAttribute('loading','lazy'); el.setAttribute('decoding','async'); }
    if (tag === 'video' || tag === 'audio') { el.setAttribute('controls',''); el.setAttribute('preload','none'); el.setAttribute('playsinline',''); }
  }
  return doc.body.innerHTML;
}
export function importHTMLRecord(source, category = 'posts', Parser = globalThis.DOMParser) {
  if (!Parser) throw new Error('HTML parser required');
  const original = String(source.content || source.html || '');
  const doc = new Parser().parseFromString(original, 'text/html');
  const attachments = [], embeds = [], text = [];
  let complex = false, seenMedia = false;
  for (const node of Array.from(doc.body.childNodes)) {
    if (node.nodeType === 3) { if (node.textContent.trim()) { text.push(node.textContent); if (seenMedia) complex = true; } continue; }
    if (node.nodeType !== 1) continue;
    const chat = node.matches('[data-cwk-chatgpt-embed="true"],.cwk-chatgpt-embed') ? node : null;
    if (chat) {
      const url = chatGptShareInfo(chat.querySelector('a[data-cwk-chatgpt-link]')?.getAttribute('href'))?.url;
      const snapshot = normalizeChatGptSnapshot(chat.getAttribute('data-cwk-chatgpt-snapshot'));
      if (url && snapshot) embeds.push({id:stableOccurrenceId(),type:'chatgpt',url,snapshot}); else complex = true;
      seenMedia = true; continue;
    }
    const media = node.matches('img,video,audio') ? node : node.matches('p,figure') && node.querySelectorAll('img,video,audio').length === 1 ? node.querySelector('img,video,audio') : null;
    if (media) {
      const url = safeMediaUrl(media.getAttribute('src') || media.querySelector('source')?.getAttribute('src'));
      if (embeds.length) complex = true;
      const plainMediaAttrs = new Set(['src','alt','data-cwk-image-crop','controls','preload','playsinline']);
      if (Array.from(media.attributes).some(attr => !plainMediaAttrs.has(attr.name))) complex = true;
      if (node !== media && (node.attributes.length || Array.from(node.querySelectorAll('*')).some(el => !['img','video','audio','source','figcaption'].includes(el.localName)))) complex = true;
      if (node.querySelector('figcaption')?.children.length) complex = true;
      if (!url || media.querySelectorAll('source').length > 1 || (node !== media && node.textContent.trim() && !node.matches('figure'))) complex = true;
      if (/youtube(?:-nocookie)?\.com|youtu\.be/.test(url)) embeds.push({id:stableOccurrenceId(),type:'youtube',url});
      else attachments.push({id:stableOccurrenceId(),mediaId:url.match(/\/api\/files\/[^/]+\/([^/]+)\//)?.[1] || '',url,name:media.getAttribute('alt') || url.split('/').pop(),kind:media.localName === 'img' ? 'image' : media.localName,mime:'',crop:parseImageCrop(media.getAttribute('data-cwk-image-crop')),comment:node.querySelector('figcaption')?.textContent || ''});
      seenMedia = true; continue;
    }
    if (node.matches('p') && Array.from(node.querySelectorAll('*')).every(e => e.localName === 'br') && node.attributes.length === 0) { if (seenMedia && node.textContent.trim()) complex = true; text.push(Array.from(node.childNodes).map(n => n.nodeType === 1 && n.localName === 'br' ? '\n' : n.textContent).join('')); }
    else complex = true;
  }
  // Keep the exact source as an immutable fallback whenever flattening would lose semantics.
  return normalizeRecord({ category, body: complex ? '' : text.join('\n').trim(), attachments: complex ? [] : attachments, embeds: complex ? [] : embeds, ...(complex ? {legacyHtml:original} : {}), legacySource:{category,collection:category === 'daily' ? 'daily_entries' : 'posts',id:String(source.id || ''),title:String(source.title || ''),slug:String(source.slug || ''),url:category === 'daily' ? `https://coldwaterkim.com/daily/${encodeURIComponent(source.day_key || source.date || '')}/` : source.slug ? `https://coldwaterkim.com/posts/${encodeURIComponent(source.slug)}` : `https://coldwaterkim.com/posts/view.html?id=${encodeURIComponent(source.id || '')}`}, status:source.status, recordDate:source.day_key || source.date || source.record_date || String(source.published_at || source.created || '').slice(0,10), created:source.created, updated:source.updated, firstPublishedAt:source.first_published_at || source.published_at || '', revision:0 });
}
