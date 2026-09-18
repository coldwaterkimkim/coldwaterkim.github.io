import { chatGptPreviewHtml } from './chatgpt-preview.js';
import '../css/chatgpt-preview.css';
import { displayDate } from './display-date.mjs';
import { reviewMediaValue } from './review-media.js';
import { getContentScroller, readContentScroll, scrollContentTo, scrollContentIntoView } from './content-scroll.js';
import { getSetting } from './pb.js';
import * as service from './records-v2-service.js';
import { orderedRecordContent, recordTitle, sanitizeLegacyHtml } from './records-v2-model.mjs';
import { openPhotoEditor } from './records-v2-crop.js';
import { imageCropStyle } from './image-crop.mjs';
import { normalizeChatGptSnapshot, chatGptShareInfo } from './chatgpt-embeds.mjs';
import { renderChatGptMarkdown, decorateChatGptMarkdown } from './chatgpt-markdown.mjs';
import { enhanceEmbeddedMedia } from './media-embeds.js';
import { observeEditorMediaDuringUploads } from './editor-media-quiescence.mjs';
import { installPhotoCarousel } from './photo-carousel.js';
import '../css/photo-carousel.css';
import { documentRecordHtml, documentHasContent } from './document-record-content.js';

const app = document.querySelector('#records-app');
const categoryNames = { posts: '나으 생각', daily: '나으 하루', nasajab: '나사잡', projects: '내가 만든 것들' };
const albumUrl = '/album/';
let page = 0, hasMore = true, loading = false, generation = 0, observer;
let route = '', records = [], draft = null, baseline = '', busy = false;
let feedReturnRoute = '#home';
let previousRoute = '#home', previousScroll = 0, editorRoot, uploadStatus;
let documentEditor=null, contentEditor=null, documentMode=false, editorGeneration=0;
function disposeDocumentEditor(){editorGeneration++;contentEditor?.destroy();contentEditor=null;document.body.classList.remove('rv-content-composing');documentEditor?.destroy();documentEditor=null;documentMode=false;}
const positions = new Map();
const views = new Map();
const firstPages = new Map();
const feedRoutes=['#home','#posts','#daily','#nasajab','#projects'];
function firstPage(hash) {
  const cached=firstPages.get(hash);
  if(cached && Date.now()-cached.at<30000)return cached.promise;
  const promise=service.listRecords({page:1,perPage:12,category:categoryNames[hash.slice(1)]?hash.slice(1):undefined,status:'published'});
  firstPages.set(hash,{at:Date.now(),promise});
  promise.catch(()=>{if(firstPages.get(hash)?.promise===promise)firstPages.delete(hash);});
  return promise;
}
function warmNeighbors(hash) {
  const categories=feedRoutes.slice(1);
  const index=categories.indexOf(hash);if(index<0)return;
  [categories[(index+3)%4],categories[(index+1)%4]].forEach(next=>{if(!views.has(next))firstPage(next).catch(()=>{});});
}
const pageDepth = new Map();
try { const saved=JSON.parse(sessionStorage.getItem('cwk:feed:position')||'null'); if(saved && Date.now()-saved.at<86400000){for(const [key,value] of saved.positions||[])positions.set(key,value);for(const [key,value] of saved.depth||[])pageDepth.set(key,value);feedReturnRoute=saved.feedReturnRoute||'#home';} } catch {}
const carouselMeasures = new WeakMap();
const carouselResizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(items=>{
  const carousels=new Set(items.map(item=>item.target.closest('.rv-slides')).filter(Boolean));
  carousels.forEach(slides=>carouselMeasures.get(slides)?.());
});
function observeCarousels(){
  app.querySelectorAll('.rv-slides').forEach(slides=>{
    carouselMeasures.get(slides)?.();
    carouselResizeObserver?.observe(slides);
    [...slides.children].forEach(slide=>carouselResizeObserver?.observe(slide));
  });
}
const e = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key in node && !key.startsWith('aria-') && key !== 'style') node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
};
const button = (label, action, attrs = {}) => e('button', { type: 'button', onClick: action, ...attrs }, label);
const link = (text, href, attrs = {}) => e('a', { href, ...attrs }, text);
const dateLabel = value => displayDate(value) || '날짜 미상';
const dayNow = () => new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const safeURL = value => { if(!String(value||'').trim())return ''; try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? reviewMediaValue(url.href) : ''; } catch { return ''; } };
const external = (text, url) => link(text, safeURL(url) || '#', { target:'_blank', rel:'noopener noreferrer' });
const idHash = id => `#record/${encodeURIComponent(id)}`;
const dirty = () => draft && JSON.stringify(draft) !== baseline;
function rememberView(){
  if(!route||route==='#compose'||loading||app.dataset.viewRoute!==route)return;
  app.querySelectorAll('video,audio').forEach(media=>{media.pause();media.preload='none';media.load();});
  pageDepth.set(route,page);
  views.set(route,{nodes:[...app.childNodes],page,hasMore,records:[...records],scroll:readContentScroll()});
}
function observeMore(){
  observer?.disconnect();
  const more=app.querySelector('[data-load-more]');
  if(more&&hasMore&&typeof IntersectionObserver!=='undefined'){
    observer=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting))loadMore();},{root:getContentScroller(),rootMargin:'500px'});
    observer.observe(more);
  }
}

function header(title = null) {
  return e('header', { class:'rv-header' },
    title ? button('닫기', closeEditor) : null,
    title ? e('h1', {}, title) : null,
    !title && service.isOwner() ? link('임시 저장','#drafts',{class:'rv-drafts-link'}) : null,
    title ? button('게시', () => persist('published'), {'data-save':'published'}) : service.isOwner() ? button(['+',e('span',{class:'rv-plus-label'},' 기록')], () => openEditor(), {class:'rv-plus', 'aria-label':'새 기록 남기기'}) : null);
}
function shell(title, subtitle) {
  app.replaceChildren();
  app.dataset.viewRoute=route;
  if (service.isOwner()) app.append(header());
  if(typeof __RECORDS_PREVIEW__!=='undefined'&&__RECORDS_PREVIEW__===true)app.append(e('p',{class:'rv-preview-note'},'로컬 검토본 · 운영 미반영'));
  if (title) {
    const heading=e('h2',{},title);
    const art={ '#posts':['thought',326,151,385,140], '#daily':['daily',307,104,410,138], '#home':['all',374,88,282,88] }[route];
    if((art||route==='#nasajab'||route==='#projects') && document.body.classList.contains('sketch-site')) {
      const [key,x,y,w,h]=art||[];
      heading.classList.add('rv-crayon-heading');
      if(art) heading.innerHTML=`<span class="rv-heading-label"></span><svg aria-hidden="true" viewBox="${x} ${y} ${w} ${h}" style="aspect-ratio:${w}/${h}"><image href="/assets/sketch/${key==='original'?'original':key+'-wire'}.png" width="${key==='original'?1333:1024}" height="${key==='original'?1888:1536}"/></svg>`;
      if(art) heading.querySelector('span').textContent=title;
      if(route==='#nasajab'||route==='#projects') {
        const label=route==='#nasajab'?'나를 사로잡은 것들':'내가 만든 것들';
        heading.replaceChildren(e('img',{src:`/assets/sketch/${route==='#nasajab'?'interests':'making'}-title.png`,alt:label}));
        heading.classList.add('rv-wide-heading');
      }
    }
    app.append(e('section',{class:'rv-heading'},heading));
  }
}
function recordMeta(record, className = 'rv-meta') {
  return e('div',{class:className},link(categoryNames[record.category]||'기록',`#${record.category||'daily'}`),link(dateLabel(record.firstPublishedAt || record.recordDate),idHash(record.id)));
}
function person(record, editable = true, showMeta = true) {
  return e('div',{class:'rv-person'},e('img',{class:'rv-avatar',src:'/assets/profile-crop.jpg',alt:''}),
    e('div',{class:'rv-person-info'},e('strong',{class:'rv-person-name'},'김찬수'),showMeta ? recordMeta(record) : null),
    editable && service.isOwner() ? button('편집',()=>openEditor(record),{class:'rv-link rv-edit'}) : null);
}
function photoDescription(record, index, supplied = '') {
  const alt=String(supplied||'').trim();
  const placeholder=/^(?:image|img|photo|picture|사진|이미지)(?:[ _-]*\d+)?$/i.test(alt);
  const cameraName=/^(?:IMG|DSC|DSCF|DSCN|PXL|KakaoTalk|Screenshot)[ _-]?\d[\w -]*$/i.test(alt);
  const opaqueName=/^(?:[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}|[a-f\d]{24,})$/i.test(alt);
  if(alt && !placeholder && !cameraName && !opaqueName && !/^(?:https?:|data:|blob:)/i.test(alt) && !/\.(?:jpe?g|png|gif|webp|heic|avif)(?:[?#].*)?$/i.test(alt))return alt;
  const context=String(record.legacySource?.title||record.body||'').replace(/\s+/g,' ').trim().slice(0,80);
  return `${context || (categoryNames[record.category]||'기록')} · 첨부 사진 ${index+1}`;
}
function detailBackLink() {
  try {
    const saved=JSON.parse(sessionStorage.getItem('cwk:album:return')||'null');
    if(saved && saved.recordHash===route && Date.now()-saved.at>=0 && Date.now()-saved.at<86400000){
      const url=new URL(saved.url,location.origin);
      if(url.origin===location.origin && ['/album/','/album/index.html'].includes(url.pathname))return link('← 앨범으로',url.pathname+url.search+url.hash);
    }
  } catch {}
  return link('← 피드로',feedReturnRoute);
}
function recordLoadError(error) {
  return error?.status===404 || /record not found/i.test(error?.message||'')
    ? '이 기록을 찾을 수 없어. 주소가 바뀌었거나 더 이상 공개되지 않는 기록일 수 있어.'
    : '기록을 불러오지 못했어. 잠시 후 다시 시도해 줘.';
}
function croppedImage(attachment, {lazy=true, alt='기록 사진'} = {}) {
  const img = e('img',{src:safeURL(attachment.url),alt,loading:lazy?'lazy':'eager',decoding:'async'});
  const styles = imageCropStyle(attachment.crop || {});
  if (!styles) return e('div',{class:'rv-square-photo'},img);
  const frame = e('div',{class:'rv-cropped'},img);
  frame.style.aspectRatio = styles.frame.aspectRatio;
  Object.assign(img.style,styles.image);
  return squarePhoto(frame, styles.frame.aspectRatio);
}
function squarePhoto(frame, aspect) {
  const parts=String(aspect||'1').split('/').map(Number);
  const ratio=parts[0]/(parts[1]||1);
  frame.style.width=`${Math.min(1,Number.isFinite(ratio)&&ratio>0?ratio:1)*100}%`;
  return e('div',{class:'rv-square-photo'},frame);
}
function embedView(embed) {
  const box = e('section',{class:'rv-embed'});
  if (embed.type === 'youtube') {
    box.append(e('div',{class:'rv-muted'},'YouTube'),external('원본 영상 열기',embed.url));
    const parsed = youtubeInfo(embed.url);
    if (parsed) box.append(button('영상 재생',event=>{
      event.currentTarget.replaceWith(e('iframe',{src:`https://www.youtube-nocookie.com/embed/${parsed.id}?start=${parsed.start}`,title:'YouTube 영상',allow:'fullscreen; picture-in-picture',allowFullscreen:true,loading:'lazy'}));
    }));
    return box;
  }
  box.classList.add('rv-chat-preview');
  box.innerHTML = chatGptPreviewHtml(embed);
  return box;
}
function legacyView(record, open = false, preview = false) {
  const body = e('div',{class:'rv-legacy-content'});
  body.innerHTML = sanitizeLegacyHtml(record.legacyHtml);
  body.querySelectorAll('[data-cwk-chatgpt-embed="true"],.cwk-chatgpt-embed').forEach(node=>{
      const url=node.querySelector('a[data-cwk-chatgpt-link]')?.getAttribute('href');
      if(chatGptShareInfo(url))node.replaceWith(embedView({type:'chatgpt',url,snapshot:normalizeChatGptSnapshot(node.getAttribute('data-cwk-chatgpt-snapshot'))}));
  });
  const prepare = root => {
    enhanceEmbeddedMedia(root, {videoMetadataOrigin: typeof __RECORDS_PREVIEW__!=='undefined' && __RECORDS_PREVIEW__===true ? location.origin : undefined});
    decorateChatGptMarkdown(root);
    root.querySelectorAll('video,audio').forEach(media=>{media.preload='none';media.controls=true;});
    root.querySelectorAll('img').forEach((img,index)=>{
      img.loading='lazy';img.alt=photoDescription(record,index,img.getAttribute('alt'));
      if(img.closest('.rv-square-photo'))return;
      const crop=img.closest('.cwk-media-crop-frame');
      const target=crop||img;
      const marker=document.createTextNode('');target.replaceWith(marker);
      marker.replaceWith(crop?squarePhoto(crop,crop.style.getPropertyValue('--cwk-crop-aspect')||crop.style.aspectRatio):e('div',{class:'rv-square-photo'},img));
    });
  };
  const details=e('section',{class:'rv-legacy'});
  if(preview){
    const extractText = source => {
      const plain=source.cloneNode(true);
      plain.querySelectorAll('video,audio,iframe,script,style').forEach(node=>node.remove());
      plain.querySelectorAll('p,div,br,li,h1,h2,h3,tr,blockquote').forEach(node=>node.append(document.createTextNode('\n')));
      return plain.textContent.replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
    };
    const text=extractText(body);
    const firstVisual=body.querySelector('img,video');
    let introduction='';
    if(firstVisual){
      const range=document.createRange();range.setStart(body,0);range.setEndBefore(firstVisual);
      introduction=extractText(range.cloneContents());
    }
    const paragraphs=(introduction||text).split('\n').map(line=>line.trim()).filter(Boolean);
    const lead=paragraphs.slice(0,3).join('\n');
    const excerptText=lead.length>240?`${lead.slice(0,240).trimEnd()}…`:lead;
    const media=body.querySelectorAll('img,video,audio,iframe');
    if(text.length>240 || text.split('\n').filter(line=>line.trim()).length>3 || media.length>1 || body.querySelector('table,details,[data-cwk-chatgpt-embed],iframe')){
      const excerpt=e('div',{class:'rv-legacy-excerpt'});
      if(excerptText)excerpt.append(e('p',{class:'rv-body'},excerptText));
      body.querySelectorAll('.rv-chat-preview').forEach(card=>excerpt.append(card.cloneNode(true)));
      const first=body.querySelector('img,video');
      if(first){
        const frame=first.closest('figure,.cwk-media-crop-frame');
        const previewMedia=(frame && frame.querySelectorAll('img,video').length===1 ? frame : first).cloneNode(true);
        excerpt.append(e('div',{class:'rv-legacy-media'},previewMedia));
      }
      prepare(excerpt);
      let expanded=false, prepared=false;
      const more=button('더 보기',()=>{
        expanded=!expanded;
        if(expanded){if(!prepared){prepare(body);prepared=true;}excerpt.replaceWith(body);}
        else {body.querySelectorAll('video,audio').forEach(media=>media.pause());body.replaceWith(excerpt);}
        more.textContent=expanded?'접기':'더 보기';
        more.setAttribute('aria-expanded',String(expanded));
        if(!expanded)scrollContentIntoView(details);
      },{class:'rv-link rv-legacy-more','aria-expanded':'false'});
      details.append(excerpt,more);
      return details;
    }
  }
  prepare(body);details.append(body);
  return details;
}
function entry(record, targetAttachment = '', isDetail = false) {
  const article = e('article',{class:`rv-entry${isDetail?' is-detail':''}`,'data-record-id':record.id},isDetail?recordMeta(record,'rv-meta rv-detail-meta'):person(record));
  const title=record.legacyHtml?.includes('<!--cwk-document-->')?'':recordTitle(record);
  if(record.legacySource?.sourceUrl)article.append(e('p',{class:'rv-meta'},external('출처',record.legacySource.sourceUrl)));
  const visibleTitle=title&&!/^\d{4}-\d{2}-\d{2} 나으 하루(?:\s|$)/.test(title)&&!record.body?.trim().startsWith(title);
  if(visibleTitle)article.append(e(isDetail?'h1':'h2',{class:'rv-record-title'},isDetail?title:link(title,idHash(record.id))));
  if(isDetail)article.append(person(record,true,false));
  const visuals = orderedRecordContent(record).filter(a=>a.kind==='image'||a.kind==='video'||a.type==='chatgpt'||a.type==='youtube');
  const globalText = e('p',{class:'rv-body rv-global-comment'},record.body || '');
  globalText.hidden = !record.body;
  article.append(globalText);
  const text = e('p',{class:'rv-body rv-photo-comment'});
  const setText = i => {text.textContent=visuals[i]?.comment?.trim() ? visuals[i].comment : '';};
  setText(0);
  if (visuals.length) {
    const slides = e('div',{class:'rv-slides',tabIndex:0,'aria-label':`사진·영상 ${visuals.length}개. 좌우로 넘겨 보기`});
    const count = e('span',{class:'rv-count'},`1 / ${visuals.length}`);
    const dots = e('div',{class:'rv-dots','aria-hidden':'true'},visuals.map((_,i)=>e('span',{class:'rv-dot','aria-current':i===0?'true':'false'})));
    visuals.forEach((attachment,i)=>{
      const media = attachment.type ? embedView(attachment) : attachment.kind==='image' ? croppedImage(attachment,{alt:photoDescription(record,i,attachment.alt||attachment.comment)}) : e('video',{src:safeURL(attachment.playbackUrl||attachment.url),poster:safeURL(attachment.posterUrl)||undefined,controls:true,playsInline:true,preload:'none'});
      const imageLink=attachment.kind==='image' ? link('',safeURL(attachment.url),{class:'rv-image-link',target:'_blank',rel:'noopener noreferrer','aria-label':`${photoDescription(record,i,attachment.alt||attachment.comment)} 원본 열기`}) : null;
      if(imageLink) imageLink.append(media);
      const slide=e('figure',{class:`rv-slide${attachment.type?' rv-slide-embed':''}`,'aria-label':`${i+1} / ${visuals.length}`},imageLink || media);
      slides.append(slide);
    });
    let current=0;
    const measureHeight=()=>{
      if(!slides.isConnected)return;
      const height=slides.children[current]?.getBoundingClientRect().height||0;
      if(height>0){
        const next=`${Math.ceil(height)}px`;
        if(slides.style.height!==next)slides.style.height=next;
      }else slides.style.removeProperty('height');
    };
    carouselMeasures.set(slides,measureHeight);
    slides.querySelectorAll('img,video').forEach(media=>{
      media.addEventListener('load',measureHeight);
      media.addEventListener('loadedmetadata',measureHeight);
      media.addEventListener('error',measureHeight);
    });
    slides.addEventListener('scroll',()=>{
      const index=Math.max(0,Math.min(visuals.length-1,Math.round(slides.scrollLeft/slides.clientWidth)));
      if(!Number.isFinite(index))return;
      if(index===current){measureHeight();return;}
      slides.querySelectorAll('video').forEach(video=>video.pause());current=index;setText(index);measureHeight();
      count.textContent=`${index+1} / ${visuals.length}`;
      [...dots.children].forEach((dot,i)=>dot.setAttribute('aria-current',i===index?'true':'false'));
    },{passive:true});
    const carousel=e('div',{class:'rv-carousel'},slides,visuals.length>1?count:null);
    article.append(carousel);installPhotoCarousel(carousel);
    if(visuals.length>1)article.append(dots);
    const requested=visuals.findIndex(a=>a.id===targetAttachment || (targetAttachment.startsWith('media:') && (a.mediaId===targetAttachment.slice(6)||a.url.includes('/'+targetAttachment.slice(6)+'/'))));
    requestAnimationFrame(()=>{if(requested>0)slides.scrollLeft=requested*slides.clientWidth;observeCarousels();});
  }
  if(visuals.length){
    if(record.category==='nasajab')article.insertBefore(text,article.querySelector('.rv-carousel'));
    else article.append(text);
  }
  for(const attachment of record.attachments||[]) {
    if(['image','video'].includes(attachment.kind))continue;
    article.append(e('div',{class:'rv-attachment'},attachment.kind==='audio'?e('audio',{src:safeURL(attachment.url),controls:true,preload:'none'}):null,external(attachment.name||'첨부 파일',attachment.url)));
  }

  if(record.legacyHtml)article.append(legacyView(record,isDetail||!record.body&&!visuals.length,!isDetail));
  return article;
}
// Lists use the same record identities and detail route as the feed. Rich content
// remains intact in entry(); this extracts a lightweight, non-interactive preview.
function teaser(record) {
  const legacy = e('div');
  legacy.innerHTML = sanitizeLegacyHtml(record.legacyHtml || '');
  const firstImage = legacy.querySelector('img');
  legacy.querySelectorAll('script,style,video,audio,iframe').forEach(node=>node.remove());
  legacy.querySelectorAll('p,div,br,li,h1,h2,h3').forEach(node=>node.append(document.createTextNode('\n')));
  const plain = String(record.body || legacy.textContent || '').trim();
  const lines = plain.split('\n').map(line=>line.trim()).filter(Boolean);
  const fullTitle = String((record.legacyHtml?.includes('<!--cwk-document-->')?lines[0]:recordTitle(record)) || lines[0] || '제목 없는 기록').trim();
  const title = record.legacySource?.title || fullTitle.length<=90 ? fullTitle : `${fullTitle.slice(0,90).trimEnd()}…`;
  const excerpt = plain.startsWith(fullTitle) && fullTitle.length<=90 ? plain.slice(fullTitle.length).trim() : plain;
  const item = e('article',{class:'rv-entry rv-teaser','data-record-id':record.id},recordMeta(record));
  const content = e('div',{class:'rv-teaser-content'},e('div',{class:'rv-teaser-copy'},
    e('h2',{class:'rv-record-title'},link(title,idHash(record.id))),
    excerpt ? e('p',{class:'rv-teaser-excerpt'},excerpt.slice(0,300)) : null));
  const visual = (record.attachments||[]).find(a=>a.kind==='image'||(a.kind==='video'&&a.posterUrl));
  const thumbnailURL = safeURL(visual?.kind==='video' ? visual.posterUrl : visual?.url || firstImage?.getAttribute('src'));
  if(thumbnailURL) content.append(link('',idHash(record.id),{class:'rv-teaser-thumbnail','aria-label':`${title} 기록 열기`}));
  if(thumbnailURL) content.lastChild.append(e('img',{src:thumbnailURL,alt:'',loading:'lazy',decoding:'async'}));
  item.append(content);
  if(service.isOwner())item.append(button('편집',()=>openEditor(record),{class:'rv-link rv-edit'}));
  return item;
}
async function loadMore() {
  if(loading||!hasMore)return;
  loading=true;const token=generation;const loadButton=document.querySelector('[data-load-more]');
  if(loadButton){loadButton.disabled=true;loadButton.textContent='불러오는 중…';}
  try {
    const result=page===0&&feedRoutes.includes(route)?await firstPage(route):await service.listRecords({page:page+1,perPage:12,category:categoryNames[route.slice(1)]?route.slice(1):undefined,status:route==='#drafts'?'draft':'published'});
    if(token!==generation)return;
    page++;hasMore=result.hasMore ?? page<(result.totalPages||1);
    const fresh=(result.items||[]).filter(item=>!records.some(old=>old.id===item.id));records.push(...fresh);
    const feed=document.querySelector('#rv-feed');
    for(const record of fresh) {
      if(route==='#album') {
        for(const attachment of record.attachments||[]) {
          if(!['image','video'].includes(attachment.kind))continue;
          const media=attachment.kind==='image'?e('img',{src:safeURL(attachment.url),alt:attachment.comment||attachment.name||'사진',loading:'lazy'}):e('video',{src:safeURL(attachment.url),preload:'none',muted:true});
          feed.append(link('',`${idHash(record.id)}/${encodeURIComponent(attachment.id)}`,{'aria-label':attachment.comment||attachment.name||'기록 열기'}));
          feed.lastChild.append(media);if(attachment.kind==='video')feed.lastChild.append(e('span',{},'영상'));
        }
      } else if(route==='#drafts')feed.append(e('article',{class:'rv-entry'},e('div',{class:'rv-meta'},categoryNames[record.category]||'기록',record.recordDate),e('p',{class:'rv-body'},record.body||'첨부 기록'),button('이어서 쓰기',()=>openEditor(record))));
      else if(route==='#posts'||route==='#projects')feed.append(teaser(record));
      else { const view=entry(record); view.classList.toggle('rv-media-first',route==='#nasajab'); feed.append(view); }
    }
    if(!records.length)feed.append(e('p',{class:'rv-empty'},route==='#drafts'?'저장된 초안이 없어.':'아직 기록이 없어.'));
    else if(route==='#album'&&!feed.children.length&&!hasMore)feed.append(e('p',{class:'rv-empty'},'사진이나 영상이 아직 없어.'));
    if(loadButton){loadButton.hidden=!hasMore;loadButton.disabled=false;loadButton.textContent='이전 기록 더 보기';}
    if(!hasMore)observer?.disconnect();
  }catch(error){if(token===generation){const status=document.querySelector('#rv-feed-status');status.textContent=recordLoadError(error);status.classList.add('rv-error');if(loadButton){loadButton.disabled=false;loadButton.textContent='다시 불러오기';}}}
  finally{if(token===generation)loading=false;}
}
async function hydrateHomeShell() { const {initPublicRuntime}=await import('./public-runtime.js'); await initPublicRuntime(); }
function feedFilters() {
  return e('nav',{class:'rv-filters','aria-label':'따로보기'}, e('strong',{class:'rv-filter-label'},'따로보기'), [['home','전체'],...Object.entries(categoryNames)].map(([key,label])=>link(label,`#${key}`,{'aria-current':route===`#${key}`?'page':undefined})));
}
async function renderRoute() {
  let next=location.hash==='#start'?'#home':location.hash||'#home';
  if(next==='#menu'){next='#home';history.replaceState(null,'',next);}
  if(next==='#album' && albumUrl !== '#album'){ location.assign(albumUrl); return; }
  if(draft){if(busy||dirty()&&!confirm('저장하지 않은 변경을 닫을까?')){history.replaceState(null,'','#compose');return;}draft=null;}
  disposeDocumentEditor();
  document.body.classList.toggle('rv-composing',next==='#compose');
  if(route==='#home'||categoryNames[route.slice(1)])feedReturnRoute=route;
  rememberView();positions.set(route,readContentScroll());route=next;window.dispatchEvent(new Event('cwk:route-sync'));generation++;observer?.disconnect();carouselResizeObserver?.disconnect();loading=false;page=0;hasMore=true;records=[];
  const routeToken=generation;
  const cached=views.get(route);
  if(cached){app.replaceChildren(...cached.nodes);app.dataset.viewRoute=route;delete app.dataset.transitioning;page=cached.page;hasMore=cached.hasMore;records=[...cached.records];observeMore();observeCarousels();if(route==='#home')scrollToRouteContent();else scrollContentTo(cached.scroll);warmNeighbors(route);return;}
  if(feedRoutes.includes(route)) {
    const token=generation;
    app.dataset.transitioning='true';
    try {await firstPage(route);} catch {}
    if(token!==generation)return;
    delete app.dataset.transitioning;
  } else delete app.dataset.transitioning;
  if(route==='#compose'){await openEditor();return;}
  if(route.startsWith('#edit/')) {
    shell();
    try{const record=await service.getRecord(decodeURIComponent(route.slice(6)));await openEditor(record);}
    catch(error){app.append(e('p',{class:'rv-status rv-error'},`기록을 열지 못했어. ${error.message}`));}
    return;
  }
  if(route.startsWith('#record/')) {
    shell();const token=generation;const status=e('p',{class:'rv-status'},'기록을 불러오는 중…');app.append(e('div',{class:'rv-heading rv-detail-back'},detailBackLink()),status);
    try{const [,id,attachment]=route.split('/');const record=await service.getRecord(decodeURIComponent(id));if(token!==generation)return;const detail=entry(record,decodeURIComponent(attachment||''),true);status.replaceWith(detail);
      service.recordDetailView?.(record).catch(()=>{});
      if(record.legacySource?.url)detail.append(e('p',{class:'rv-meta'},link('고유 주소',safeURL(record.legacySource.url))));
      if(service.isOwner()&&service.recordDetailCount){const count=await service.recordDetailCount(record);if(token===generation&&count!==null)detail.append(e('p',{class:'rv-meta'},`조회 ${count} · OWNER에게만 표시`));}}
    catch(error){status.textContent=recordLoadError(error);}
    scrollToRouteContent();
    const mediaTarget=decodeURIComponent(route.split('/')[2]||'');
    if(mediaTarget.startsWith('media:')){const id=mediaTarget.slice(6);const media=[...app.querySelectorAll('.rv-legacy img,.rv-legacy video')].find(node=>(node.getAttribute('src')||'').includes('/'+id+'/'));if(media)scrollContentIntoView(media);}
    return;
  }
  if(route==='#drafts'&&!service.isOwner()){shell('임시 저장');app.append(e('p',{class:'rv-status'},'주인장 로그인 후 볼 수 있어.'));return;}
  const headings={'#nasajab':['나사잡','나를 사로잡은 장면과 이야기.'],'#projects':['내가 만든 것들','만든 것들과 만들어 가는 과정.'],'#posts':['나으 생각','생각, 고민, 그리고 끄적임.'],'#daily':['나으 하루','하루의 장면과 짧은 이야기.'],'#album':['앨범','기록 속 사진과 영상.'],'#drafts':['임시 저장','아직 게시하지 않은 기록.']};
  shell(...(headings[route]||['전체 보기','살아가며 남긴 기록들.']));
  if(route!=='#drafts'&&!document.body.classList.contains('sketch-site'))app.append(feedFilters());
  app.append(e('main',{id:'rv-feed',class:route==='#album'?'rv-album':route==='#posts'||route==='#projects'?'rv-teaser-list':'rv-reading-feed'}),e('p',{id:'rv-feed-status',class:'rv-status','aria-live':'polite'}));
  const more=button('이전 기록 더 보기',loadMore,{class:'rv-more','data-load-more':true});app.append(more);
  await loadMore();
  if(routeToken!==generation)return;
  warmNeighbors(route);
  const restorePages=Math.min(100,pageDepth.get(route)||1);
  while(page<restorePages&&hasMore){const previousPage=page;await loadMore();if(routeToken!==generation)return;if(page===previousPage)break;}
  observeMore();
  scrollToRouteContent();
}
function scrollToRouteContent(){
  if(route==='#home' && document.querySelector('#sketch-home')) {
    requestAnimationFrame(()=>{
      if(route!=='#home')return;
      if(location.hash==='#home')scrollContentIntoView(document.querySelector('#records-content'));
      else scrollContentTo(0);
    });
    return;
  }
  if(positions.has(route)){scrollContentTo(positions.get(route));return;}
  if(route!=='#home'&&matchMedia('(max-width: 640px)').matches)scrollContentIntoView(document.querySelector('#records-content')||app);
  else scrollContentTo(0);
}

async function openEditor(record = null) {
  if(!service.isOwner()){shell();app.append(e('p',{class:'rv-status'},'주인장 로그인 후 기록을 남길 수 있어.'),link('주인장 로그인','/admin/login.html?next='+encodeURIComponent('/#compose')));return;}
  if(!draft){previousRoute=route==='#compose'?'#home':route;previousScroll=readContentScroll();}
  rememberView();
  generation++;observer?.disconnect();carouselResizeObserver?.disconnect();
  disposeDocumentEditor();
  draft=record?structuredClone(record):{category:categoryNames[previousRoute.slice(1)]?previousRoute.slice(1):'',body:'',attachments:[],embeds:[],status:'draft',recordDate:dayNow()};
  draft.attachments ||= [];draft.embeds ||= [];
  baseline=JSON.stringify(draft);busy=false;
  history.pushState(null,'','#compose');route='#compose';window.dispatchEvent(new Event('cwk:route-sync'));
  document.body.classList.add('rv-composing');
  app.replaceChildren(header('기록 남기기'));
  if(typeof __RECORDS_PREVIEW__!=='undefined'&&__RECORDS_PREVIEW__===true)app.append(e('p',{class:'rv-preview-note'},'로컬 검토본 · 운영 미반영'));
  editorRoot=e('main',{class:'rv-editor'});app.append(editorRoot);
  const select=e('select',{'aria-label':'기록 분류',onChange:event=>{
    draft.category=event.target.value;
    if(!draft.body?.trim()&&!draft.attachments.length&&!draft.embeds.length&&!documentHasContent(draft.legacyHtml)&&['posts','projects'].includes(draft.category)!==documentMode){delete draft.legacyHtml;void openEditor(draft);return;}
    syncSaveState();
  }},e('option',{value:'',selected:!draft.category},'분류 선택'),Object.entries(categoryNames).map(([value,label])=>e('option',{value,selected:draft.category===value},label)));
  editorRoot.append(e('div',{class:'rv-person'},e('img',{class:'rv-avatar',src:'/assets/profile-crop.jpg',alt:''}),e('div',{class:'rv-compose-person'},e('strong',{},'김찬수'),e('span',{class:'rv-muted'},'새로운 기록')),button('임시 저장',()=>persist('draft'),{class:'rv-link rv-draft','data-save':'draft'})));
  if(['posts','projects'].includes(draft.category)||draft.legacyHtml?.includes('<!--cwk-document-->')){await openDocumentComposer(select);return;}
  await openContentComposer();
}
async function openContentComposer(){
  const token=editorGeneration;
  const currentDraft=draft;
  if(!currentDraft.category)currentDraft.category='daily';
  baseline=JSON.stringify(currentDraft);
  document.body.classList.add('rv-content-composing');
  editorRoot=e('main',{class:'rv-content-editor-host'});
  app.replaceChildren(editorRoot);
  const {mountContentEditor}=await import('./content-record-editor.js');
  if(token!==editorGeneration)return;
  contentEditor=mountContentEditor(editorRoot,{
    draft:currentDraft,
    onChange:()=>{},
    onBusy:value=>{if(token===editorGeneration)busy=value;},
    onClose:closeEditor,
    uploadFiles:(files,options)=>service.uploadFiles(files,options),
    resolveLink:async value=>{
      const url=value.trim();
      if(youtubeInfo(url))return {id:crypto.randomUUID(),type:'youtube',url,comment:''};
      if(!chatGptShareInfo(url))throw new Error('ChatGPT 공유 링크 또는 YouTube 주소를 넣어줘.');
      const result=await service.resolveChatGptShare(url);
      return {...(result.type?result:{type:'chatgpt',url,snapshot:result.snapshot||result}),id:result.id||crypto.randomUUID(),comment:''};
    },
    editPhoto:attachment=>openPhotoEditor(attachment,{body:currentDraft.body}),
    legacyPreview:currentDraft.legacyHtml?legacyView(currentDraft,false,true):null,
    onSave:async status=>{
      const saved=await service.saveRecord({...currentDraft,status},{contentEditing:true});
      if(token!==editorGeneration)return saved;
      Object.assign(currentDraft,saved);baseline=JSON.stringify(currentDraft);views.clear();firstPages.clear();
      if(status==='published'){
        // Release the in-flight guard only after the save has returned.
        busy=false;draft=null;history.replaceState(null,'',idHash(saved.id));route='';await renderRoute();
      }
      return saved;
    },
    onDelete:currentDraft.id?async()=>{
      if(!confirm('이 기록을 삭제할까? 게시된 글도 함께 삭제돼. 첨부 원본은 보존돼.'))return false;
      await service.deleteRecord(currentDraft);
      if(token!==editorGeneration)return false;
      busy=false;draft=null;views.clear();firstPages.clear();history.replaceState(null,'','#home');route='';await renderRoute();return true;
    }:undefined
  });
  scrollContentTo(0);
}

function growComposer(textarea){textarea.style.height='auto';if(textarea.scrollHeight)textarea.style.height=textarea.scrollHeight+'px';}
async function openDocumentComposer(select){
  documentMode=true;
  const token=editorGeneration;
  const original=documentRecordHtml(draft);
  const host=e('div',{class:'rv-document-editor'});
  editorRoot.append(e('p',{class:'rv-muted'},'문단 사이에 사진·영상·파일을 넣어 자유롭게 작성해줘. / 로 블록을 추가할 수 있어.'),host);
  uploadStatus=e('div',{class:'rv-status','aria-live':'polite'},'문서 편집기를 여는 중…');
  editorRoot.append(uploadStatus,e('label',{class:'rv-category-field'},'이 기록의 분류',select));
  editorRoot.append(e('label',{class:'rv-date'},'기록 날짜',e('input',{type:'date',value:draft.recordDate||dayNow(),onChange:event=>{draft.recordDate=event.target.value;syncSaveState();}})));
  if(draft.id)editorRoot.append(button('기록 삭제',async()=>{
    if(busy||!confirm('이 기록을 삭제할까? 첨부 원본은 보존돼.'))return;
    setBusy(true,true);
    try{await service.deleteRecord(draft);draft=null;views.clear();firstPages.clear();history.replaceState(null,'','#home');route='';await renderRoute();}
    catch(error){uploadStatus.textContent=`삭제하지 못했어. ${error.message}`;}
    finally{setBusy(false);}
  },{class:'rv-link'}));
  setBusy(true,true);
  try{
    const {mountDocumentEditor}=await import('./document-record-editor.js');
    if(token!==editorGeneration)return;
    const editor=await mountDocumentEditor(host,{
      html:original,
      onChange:html=>{if(token!==editorGeneration||!draft)return;draft.legacyHtml=`<!--cwk-document-->${html}`;draft.title='';draft.titleExplicit=true;draft.body='';draft.attachments=[];draft.embeds=[];draft.contentOrder=[];syncSaveState();},
      uploadFiles:files=>service.uploadFiles(files),
      onBusy:value=>{if(token===editorGeneration){setBusy(value,true);uploadStatus.textContent=value?'콘텐츠를 처리하는 중…':'';}},
      onError:error=>{if(token===editorGeneration)uploadStatus.textContent=`처리하지 못했어. ${error.message}`;}
    });
    if(token!==editorGeneration){editor.destroy();return;}
    documentEditor=editor;uploadStatus.textContent='';
  }catch(error){uploadStatus.textContent=`편집기를 열지 못했어. 원문은 보존되어 있어. ${error.message}`;}
  finally{if(token===editorGeneration)setBusy(false);}
  scrollContentTo(0);
}
function closeEditor(){if(busy)return;if(dirty()&&!confirm('저장하지 않은 변경을 닫을까?'))return;draft=null;history.replaceState(null,'',previousRoute);route='';renderRoute().then(()=>scrollContentTo(previousScroll));}
function syncSaveState(){
  if(!draft)return;
  const categorySelect=app.querySelector('select[aria-label="기록 분류"]');
  if(categorySelect)categorySelect.disabled=busy;
  const empty=!draft.body?.trim()&&!draft.attachments.length&&!draft.embeds.length&&!documentHasContent(draft.legacyHtml);
  app.querySelectorAll('[data-save]').forEach(node=>{node.disabled=busy||empty||!draft.recordDate||(node.dataset.save==='published'&&!categoryNames[draft.category]);});
}
function setBusy(value,lockText=false){busy=value;app.querySelectorAll('button,input,select').forEach(node=>{node.disabled=value;});app.querySelectorAll('textarea').forEach(node=>{node.disabled=value&&lockText;});const host=app.querySelector('.rv-document-editor');if(host)host.inert=value&&lockText;syncSaveState();}
function renderThumbs(){contentEditor?.refresh();}
function youtubeInfo(value){try{const url=new URL(value);if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname))return null;const id=url.hostname==='youtu.be'?url.pathname.slice(1):url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];if(!/^[\w-]{11}$/.test(id||''))return null;const raw=url.searchParams.get('t')||url.searchParams.get('start')||'0';let start=/^\d+$/.test(raw)?Number(raw):0;if(!start){for(const [,n,unit]of raw.matchAll(/(\d+)(h|m|s)/g))start+=Number(n)*({h:3600,m:60,s:1}[unit]);}return{id,start};}catch{return null;}}
async function persist(status){
  if(busy||!draft)return;
  if(!draft.body?.trim()&&!draft.attachments.length&&!draft.embeds.length&&!documentHasContent(draft.legacyHtml)){uploadStatus.textContent='글이나 첨부를 하나 이상 남겨줘.';return;}
  if(!draft.recordDate){uploadStatus.textContent='기록 날짜를 선택해줘.';return;}
  if(status==='published'&&!categoryNames[draft.category]){uploadStatus.textContent='게시할 분류를 선택해줘.';app.querySelector('select[aria-label="기록 분류"]')?.focus();return;}
  setBusy(true,true);uploadStatus.textContent='저장하는 중…';
  try{const saved=await service.saveRecord({...draft,status},{replaceLegacyHtml:documentMode});draft={...draft,...saved};baseline=JSON.stringify(draft);views.clear();firstPages.clear();uploadStatus.textContent=status==='draft'?'임시 저장했어.':'게시했어.';
    if(status==='published'){draft=null;history.replaceState(null,'',idHash(saved.id));route='';await renderRoute();}}
  catch(error){uploadStatus.textContent=`저장하지 못했어. ${error.message}`;}
  finally{setBusy(false);if(draft)renderThumbs();}
}
window.addEventListener('pagehide',()=>{ if(draft)return;if(route==='#home'||categoryNames[route.slice(1)])feedReturnRoute=route;positions.set(route,readContentScroll());pageDepth.set(route,page);try{sessionStorage.setItem('cwk:feed:position',JSON.stringify({at:Date.now(),positions:[...positions],depth:[...pageDepth],feedReturnRoute}));}catch{} });
window.addEventListener('beforeunload',event=>{if(dirty()||busy){event.preventDefault();event.returnValue='';}});
window.addEventListener('hashchange',renderRoute);
window.addEventListener('resize',()=>requestAnimationFrame(()=>{observeCarousels();observeMore();}));
try{await service.initSession();await hydrateHomeShell();await renderRoute();}
catch(error){app.replaceChildren(e('p',{class:'rv-status rv-error'},`기록을 연결하지 못했어. ${error.message}`),button('다시 시도',()=>location.reload()));}
