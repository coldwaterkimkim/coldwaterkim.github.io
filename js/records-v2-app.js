import { reviewMediaValue } from './review-media.js';
import { getContentScroller, readContentScroll, scrollContentTo, scrollContentIntoView } from './content-scroll.js';
import { getSetting } from './pb.js';
import * as service from './records-v2-service.js';
import { sanitizeLegacyHtml } from './records-v2-model.mjs';
import { openPhotoEditor } from './records-v2-crop.js';
import { imageCropStyle } from './image-crop.mjs';
import { normalizeChatGptSnapshot, chatGptShareInfo } from './chatgpt-embeds.mjs';
import { renderChatGptMarkdown, decorateChatGptMarkdown } from './chatgpt-markdown.mjs';
import { enhanceEmbeddedMedia } from './media-embeds.js';
import { observeEditorMediaDuringUploads } from './editor-media-quiescence.mjs';

const app = document.querySelector('#records-app');
const categoryNames = { posts: '글방', daily: '나으하루', nasajab: '나사잡', projects: '프로젝트' };
const albumUrl = '/album/';
let page = 0, hasMore = true, loading = false, generation = 0, observer;
let route = '', records = [], draft = null, baseline = '', busy = false;
let feedReturnRoute = '#home';
let previousRoute = '#home', previousScroll = 0, editorRoot, uploadStatus;
const positions = new Map();
const views = new Map();
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
const dateLabel = value => {
  if (!value) return '날짜 미상';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : new Intl.DateTimeFormat('ko-KR', { year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit' }).format(d);
};
const dayNow = () => new Intl.DateTimeFormat('en-CA', {year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const safeURL = value => { if(!String(value||'').trim())return ''; try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? reviewMediaValue(url.href) : ''; } catch { return ''; } };
const external = (text, url) => link(text, safeURL(url) || '#', { target:'_blank', rel:'noopener noreferrer' });
const idHash = id => `#record/${encodeURIComponent(id)}`;
const dirty = () => draft && JSON.stringify(draft) !== baseline;
function rememberView(){
  if(!route||route==='#compose'||loading)return;
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
  if (service.isOwner()) app.append(header());
  if(typeof __RECORDS_PREVIEW__!=='undefined'&&__RECORDS_PREVIEW__===true)app.append(e('p',{class:'rv-preview-note'},'로컬 검토본 · 운영 미반영'));
  if (title) app.append(e('section',{class:'rv-heading'},e('h2',{},title),subtitle?e('p',{class:'rv-muted'},subtitle):null));
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
  if (!styles) return img;
  const frame = e('div',{class:'rv-cropped'},img);
  frame.style.aspectRatio = styles.frame.aspectRatio;
  Object.assign(img.style,styles.image);
  return frame;
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
  const snapshot = normalizeChatGptSnapshot(embed.snapshot);
  box.append(e('div',{class:'rv-muted'},'ChatGPT 공유 대화'),e('h3',{},snapshot?.title||'저장된 대화'),external('원문 열기',embed.url));
  if (!snapshot) { box.append(e('p',{},'대화 미리보기가 저장되지 않았어. 원문 링크에서 확인할 수 있어.')); return box; }
  const details = e('details',{},e('summary',{},`대화 펼치기 · ${snapshot.messages.length}개 메시지`));
  for (const message of snapshot.messages) {
    const body = e('div');
    body.innerHTML = renderChatGptMarkdown(message.text);
    details.append(e('div',{class:'rv-message'},e('strong',{},message.role==='user'?'나':'ChatGPT'),body));
  }
  box.append(details);
  return box;
}
function legacyView(record, open = false, preview = false) {
  const body = e('div',{class:'rv-legacy-content'});
  body.innerHTML = sanitizeLegacyHtml(record.legacyHtml);
  const prepare = root => {
    enhanceEmbeddedMedia(root, {videoMetadataOrigin: typeof __RECORDS_PREVIEW__!=='undefined' && __RECORDS_PREVIEW__===true ? location.origin : undefined});
    decorateChatGptMarkdown(root);
    root.querySelectorAll('video,audio').forEach(media=>{media.preload='none';media.controls=true;});
    root.querySelectorAll('img').forEach((img,index)=>{img.loading='lazy';img.alt=photoDescription(record,index,img.getAttribute('alt'));});
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
  const title=String(record.legacySource?.title||'').trim();
  if(record.legacySource?.sourceUrl)article.append(e('p',{class:'rv-meta'},external('출처',record.legacySource.sourceUrl)));
  const visibleTitle=title&&!/^\d{4}-\d{2}-\d{2} 나으 하루(?:\s|$)/.test(title)&&!record.body?.trim().startsWith(title);
  if(visibleTitle)article.append(e(isDetail?'h1':'h2',{class:'rv-record-title'},isDetail?title:link(title,idHash(record.id))));
  if(isDetail)article.append(person(record,true,false));
  const visuals = (record.attachments||[]).filter(a=>a.kind==='image'||a.kind==='video');
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
      const media = attachment.kind==='image' ? croppedImage(attachment,{alt:photoDescription(record,i,attachment.alt||attachment.comment)}) : e('video',{src:safeURL(attachment.playbackUrl||attachment.url),poster:safeURL(attachment.posterUrl)||undefined,controls:true,playsInline:true,preload:'none'});
      const imageLink=attachment.kind==='image' ? link('',safeURL(attachment.url),{class:'rv-image-link',target:'_blank',rel:'noopener noreferrer','aria-label':`${photoDescription(record,i,attachment.alt||attachment.comment)} 원본 열기`}) : null;
      if(imageLink) imageLink.append(media);
      const slide=e('figure',{class:'rv-slide','aria-label':`${i+1} / ${visuals.length}`},imageLink || media);
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
    slides.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key)||event.target!==slides)return;
      event.preventDefault();slides.scrollBy({left:(event.key==='ArrowRight'?1:-1)*slides.clientWidth,behavior:'auto'});
    });
    article.append(e('div',{class:'rv-carousel'},slides,visuals.length>1?count:null));
    if(visuals.length>1)article.append(dots);
    const requested=visuals.findIndex(a=>a.id===targetAttachment || (targetAttachment.startsWith('media:') && (a.mediaId===targetAttachment.slice(6)||a.url.includes('/'+targetAttachment.slice(6)+'/'))));
    requestAnimationFrame(()=>{if(requested>0)slides.scrollLeft=requested*slides.clientWidth;observeCarousels();});
  }
  if(visuals.length)article.append(text);
  for(const attachment of record.attachments||[]) {
    if(['image','video'].includes(attachment.kind))continue;
    article.append(e('div',{class:'rv-attachment'},attachment.kind==='audio'?e('audio',{src:safeURL(attachment.url),controls:true,preload:'none'}):null,external(attachment.name||'첨부 파일',attachment.url)));
  }
  (record.embeds||[]).forEach(embed=>article.append(embedView(embed)));
  if(record.legacyHtml)article.append(legacyView(record,isDetail||!record.body&&!visuals.length,!isDetail));
  return article;
}
async function loadMore() {
  if(loading||!hasMore)return;
  loading=true;const token=generation;const loadButton=document.querySelector('[data-load-more]');
  if(loadButton){loadButton.disabled=true;loadButton.textContent='불러오는 중…';}
  try {
    const result=await service.listRecords({page:page+1,perPage:12,category:categoryNames[route.slice(1)]?route.slice(1):undefined,status:route==='#drafts'?'draft':'published'});
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
      else feed.append(entry(record));
    }
    if(!records.length)feed.append(e('p',{class:'rv-empty'},route==='#drafts'?'저장된 초안이 없어.':'아직 기록이 없어.'));
    else if(route==='#album'&&!feed.children.length&&!hasMore)feed.append(e('p',{class:'rv-empty'},'사진이나 영상이 아직 없어.'));
    if(loadButton){loadButton.hidden=!hasMore;loadButton.disabled=false;loadButton.textContent='이전 기록 더 보기';}
    if(!hasMore)observer?.disconnect();
  }catch(error){if(token===generation){const status=document.querySelector('#rv-feed-status');status.textContent=recordLoadError(error);status.classList.add('rv-error');if(loadButton){loadButton.disabled=false;loadButton.textContent='다시 불러오기';}}}
  finally{if(token===generation)loading=false;}
}
async function hydrateHomeShell() { await import('./site.js'); }
function feedFilters() {
  return e('nav',{class:'rv-filters','aria-label':'따로보기'}, e('strong',{class:'rv-filter-label'},'따로보기'), [['home','전체'],...Object.entries(categoryNames)].map(([key,label])=>link(label,`#${key}`,{'aria-current':route===`#${key}`?'page':undefined})));
}
async function renderRoute() {
  let next=location.hash||'#home';
  if(next==='#menu'){next='#home';history.replaceState(null,'',next);}
  if(next==='#album' && albumUrl !== '#album'){ location.assign(albumUrl); return; }
  if(draft){if(busy||dirty()&&!confirm('저장하지 않은 변경을 닫을까?')){history.replaceState(null,'','#compose');return;}draft=null;}
  document.body.classList.toggle('rv-composing',next==='#compose');
  if(route==='#home'||categoryNames[route.slice(1)])feedReturnRoute=route;
  rememberView();positions.set(route,readContentScroll());route=next;generation++;observer?.disconnect();carouselResizeObserver?.disconnect();loading=false;page=0;hasMore=true;records=[];
  const cached=views.get(route);
  if(cached){app.replaceChildren(...cached.nodes);page=cached.page;hasMore=cached.hasMore;records=[...cached.records];observeMore();observeCarousels();scrollContentTo(cached.scroll);return;}
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
  const headings={'#nasajab':['나사잡','나를 사로잡은 장면과 이야기.'],'#projects':['프로젝트','직접 진행한 프로젝트의 기록.'],'#posts':['글방','글과 생각을 모아 놓은 방.'],'#daily':['나으 하루','하루의 장면과 짧은 이야기.'],'#album':['앨범','기록 속 사진과 영상.'],'#drafts':['임시 저장','아직 게시하지 않은 기록.']};
  shell(...(route==='#drafts'?headings[route]:[]));
  if(route!=='#drafts')app.append(feedFilters());
  app.append(e('main',{id:'rv-feed',class:route==='#album'?'rv-album':''}),e('p',{id:'rv-feed-status',class:'rv-status','aria-live':'polite'}));
  const more=button('이전 기록 더 보기',loadMore,{class:'rv-more','data-load-more':true});app.append(more);
  await loadMore();
  const restorePages=Math.min(100,pageDepth.get(route)||1);
  while(page<restorePages&&hasMore){const previousPage=page;await loadMore();if(page===previousPage)break;}
  observeMore();
  scrollToRouteContent();
}
function scrollToRouteContent(){
  if(positions.has(route)){scrollContentTo(positions.get(route));return;}
  if(route!=='#home'&&matchMedia('(max-width: 640px)').matches)scrollContentIntoView(document.querySelector('#records-content')||app);
  else scrollContentTo(0);
}

async function openEditor(record = null) {
  if(!service.isOwner()){shell();app.append(e('p',{class:'rv-status'},'주인장 로그인 후 기록을 남길 수 있어.'),link('주인장 로그인','/admin/login.html?next='+encodeURIComponent('/#compose')));return;}
  if(!draft){previousRoute=route==='#compose'?'#home':route;previousScroll=readContentScroll();}
  rememberView();
  generation++;observer?.disconnect();carouselResizeObserver?.disconnect();
  draft=record?structuredClone(record):{category:'',body:'',attachments:[],embeds:[],status:'draft',recordDate:dayNow()};
  draft.attachments ||= [];draft.embeds ||= [];
  baseline=JSON.stringify(draft);busy=false;
  history.pushState(null,'','#compose');route='#compose';
  document.body.classList.add('rv-composing');
  app.replaceChildren(header('기록 남기기'));
  if(typeof __RECORDS_PREVIEW__!=='undefined'&&__RECORDS_PREVIEW__===true)app.append(e('p',{class:'rv-preview-note'},'로컬 검토본 · 운영 미반영'));
  editorRoot=e('main',{class:'rv-editor'});app.append(editorRoot);
  const select=e('select',{'aria-label':'기록 분류',onChange:event=>{draft.category=event.target.value;syncSaveState();}},e('option',{value:'',selected:!draft.category},'분류 선택'),Object.entries(categoryNames).map(([value,label])=>e('option',{value,selected:draft.category===value},label)));
  editorRoot.append(e('div',{class:'rv-person'},e('img',{class:'rv-avatar',src:'/assets/profile-crop.jpg',alt:''}),e('div',{class:'rv-compose-person'},e('strong',{},'김찬수'),e('span',{class:'rv-muted'},'새로운 기록')),button('임시 저장',()=>persist('draft'),{class:'rv-link rv-draft','data-save':'draft'})));
  const textarea=e('textarea',{class:'rv-compose-body','aria-label':'전역 코멘트 — 사진 위에 항상 표시',placeholder:'지금 남기고 싶은 이야기…',value:draft.body||'',onInput:event=>{draft.body=event.target.value;growComposer(event.target);syncSaveState();}});
  textarea.addEventListener('paste',event=>{const files=[...(event.clipboardData?.files||[])];if(files.length){event.preventDefault();attachFiles(files);}});
  editorRoot.append(e('label',{},'전역 코멘트 · 사진 위',textarea),e('p',{class:'rv-muted'},'사진을 넘겨도 이 글은 위에 그대로 보여.'),e('div',{id:'rv-thumbs',class:'rv-thumbs'}));
  requestAnimationFrame(()=>growComposer(textarea));
  renderThumbs();
  editorRoot.append(e('p',{class:'rv-muted rv-attachment-help',hidden:!draft.attachments.some(item=>item.kind==='image')},'사진을 누르면 자르기. 아래 개별 코멘트는 해당 사진·영상 아래에만 표시돼.'));
  const file=e('input',{type:'file',multiple:true,hidden:true,onChange:event=>{attachFiles([...event.target.files]);event.target.value='';}});
  const media=e('input',{type:'file',accept:'image/*,video/*',multiple:true,hidden:true,onChange:event=>{attachFiles([...event.target.files]);event.target.value='';}});
  editorRoot.append(file,media,e('div',{class:'rv-editor-tools'},button('사진 · 영상',()=>media.click()),button('링크',showLinkForm),button('파일 · 오디오',()=>file.click())));
  uploadStatus=e('div',{class:'rv-status','aria-live':'polite'});editorRoot.append(uploadStatus,e('div',{id:'rv-embeds'}));renderEditorEmbeds();
  editorRoot.append(e('label',{class:'rv-category-field'},'이 기록의 분류',select),e('p',{class:'rv-category-hint'},'게시할 때 하나를 선택해줘. 게시한 뒤에도 바꿀 수 있어.'));
  editorRoot.append(e('details',{class:'rv-editor-options'},e('summary',{},`기록 날짜 · ${draft.recordDate||'미지정'}`),e('label',{class:'rv-date'},'기록 날짜',e('input',{type:'date',value:draft.recordDate||dayNow(),onChange:event=>{draft.recordDate=event.target.value;event.target.closest('details').querySelector('summary').textContent=`기록 날짜 · ${draft.recordDate||'미지정'}`;syncSaveState();}}))));
  if(draft.id)editorRoot.append(button('기록 삭제',async()=>{
    if(busy||!confirm('이 기록을 삭제할까? 게시된 글도 함께 삭제돼. 첨부 원본은 보존돼.'))return;
    setBusy(true,true);
    try{await service.deleteRecord(draft);draft=null;views.clear();history.replaceState(null,'','#home');route='';await renderRoute();}
    catch(error){uploadStatus.textContent=`삭제하지 못했어. ${error.message}`;}
    finally{setBusy(false);}
  },{class:'rv-link'}));
  if(draft.legacyHtml)editorRoot.append(e('p',{class:'rv-muted'},'기존 원문은 별도로 보존돼. 여기서 본문과 첨부를 바꿔도 기존 원문은 변경되지 않아.'),legacyView(draft,false,true));
  editorRoot.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
  editorRoot.addEventListener('drop',event=>{if(event.dataTransfer?.files.length){event.preventDefault();attachFiles([...event.dataTransfer.files]);}});
  syncSaveState();scrollContentTo(0);textarea.focus({preventScroll:true});
}
function growComposer(textarea){textarea.style.height='auto';if(textarea.scrollHeight)textarea.style.height=textarea.scrollHeight+'px';}
function closeEditor(){if(busy)return;if(dirty()&&!confirm('저장하지 않은 변경을 닫을까?'))return;draft=null;history.replaceState(null,'',previousRoute);route='';renderRoute().then(()=>scrollContentTo(previousScroll));}
function syncSaveState(){
  if(!draft)return;
  const categorySelect=app.querySelector('select[aria-label="기록 분류"]');
  if(categorySelect)categorySelect.disabled=busy;
  const empty=!draft.body?.trim()&&!draft.attachments.length&&!draft.embeds.length&&!draft.legacyHtml;
  app.querySelectorAll('[data-save]').forEach(node=>{node.disabled=busy||empty||!draft.recordDate||(node.dataset.save==='published'&&!categoryNames[draft.category]);});
}
function setBusy(value,lockText=false){busy=value;app.querySelectorAll('button,input,select').forEach(node=>{node.disabled=value;});app.querySelectorAll('textarea').forEach(node=>{node.disabled=value&&lockText;});syncSaveState();}
function renderThumbs(){
  const root=document.querySelector('#rv-thumbs');if(!root)return;root.replaceChildren();
  const help=editorRoot?.querySelector('.rv-attachment-help');if(help)help.hidden=!draft.attachments.some(item=>item.kind==='image');
  syncSaveState();
  draft.attachments.forEach((attachment,index)=>{
    const preview=e('div',{class:'rv-thumb-preview'});
    if(attachment.kind==='image')preview.append(croppedImage(attachment));
    else if(attachment.kind==='video')preview.append(e('video',{src:safeURL(attachment.url),preload:'none',muted:true}));
    else preview.append(e('p',{},attachment.name||'첨부 파일'));
    if(attachment.kind==='image')preview.append(button('사진 편집',()=>editPhoto(index),{class:'rv-thumb-edit','aria-label':`사진 ${index+1} 자르기와 코멘트`}));
    preview.append(e('span',{class:'rv-thumb-number'},index+1),button('×',()=>{draft.attachments.splice(index,1);renderThumbs();},{'aria-label':`${index+1}번째 첨부에서 빼기`}));
    const move=direction=>{const other=index+direction;if(other<0||other>=draft.attachments.length)return;[draft.attachments[index],draft.attachments[other]]=[draft.attachments[other],draft.attachments[index]];renderThumbs();};
    root.append(e('div',{class:'rv-thumb'},preview,e('div',{class:'rv-thumb-tools'},button('←',()=>move(-1),{disabled:index===0,'aria-label':`${index+1}번째 첨부 앞으로`}),button(attachment.kind==='image'?'편집':'코멘트',()=>editPhoto(index),{class:'rv-link'}),button('→',()=>move(1),{disabled:index===draft.attachments.length-1,'aria-label':`${index+1}번째 첨부 뒤로`})),['image','video'].includes(attachment.kind)?e('label',{},'개별 코멘트 · 아래',e('textarea',{'aria-label':`${index+1}번째 사진·영상 개별 코멘트`,rows:3,maxLength:10000,placeholder:'비워두면 아래는 빈칸',value:attachment.comment||'',onInput:event=>{attachment.comment=event.target.value;syncSaveState();}})):null));
  });
}
async function editPhoto(index){
  if(busy)return;const attachment=draft.attachments[index];
  if(attachment.kind!=='image'){const comment=prompt('이 첨부의 코멘트 (비워두면 아래 영역은 빈칸)',attachment.comment||'');if(comment!==null){attachment.comment=comment;renderThumbs();}return;}
  const result=await openPhotoEditor(attachment,{body:draft.body});if(result){Object.assign(attachment,result);renderThumbs();}
}
async function attachFiles(files){
  if(busy||!files.length)return;setBusy(true);uploadStatus.replaceChildren(e('p',{},`${files.length}개 파일을 올리는 중…`));
  const origins=new Set([location.origin]);app.querySelectorAll('video[src],audio[src]').forEach(media=>{try{origins.add(new URL(media.src).origin);}catch{}});
  const quiet=[...origins].map(origin=>observeEditorMediaDuringUploads(editorRoot,{mediaRoot:app,origin}));
  editorRoot.classList.add('is-image-uploading');quiet.forEach(controller=>controller.sync());
  const progress=e('progress',{class:'rv-progress',max:100,value:0});uploadStatus.append(progress);
  try{const attachments=await service.uploadFiles(files,{onProgress:(value,file,index,total)=>{const percent=typeof value==='number'?value:value?.percent??value?.progress??0;progress.value=((index||0)+Math.max(0,Math.min(100,percent))/100)/(total||1)*100;uploadStatus.firstChild.textContent=`${(index||0)+1} / ${total||files.length} · ${file?.name||'파일'} · ${value?.phase==='finalizing'?'전송 완료, 등록 중…':value?.phase==='complete'?'등록 완료':`${Math.round(percent)}% 전송 중…`}`;}});draft.attachments.push(...attachments);renderThumbs();uploadStatus.replaceChildren(e('p',{},attachments.errors?.length?`${attachments.length}개 완료. 일부 파일 실패: ${attachments.errors.map(item=>`${item.file?.name||'파일'}: ${item.error?.message||item.message||'전송 실패'}`).join(', ')}`:attachments.duplicate?'이미 처리 중이거나 방금 첨부한 파일이야.':`${attachments.length}개 첨부 완료`));}
  catch(error){uploadStatus.textContent=`업로드하지 못했어. ${error.message}`;}
  finally{editorRoot.classList.remove('is-image-uploading');quiet.forEach(controller=>controller.destroy());setBusy(false);renderThumbs();}
}
function youtubeInfo(value){try{const url=new URL(value);if(!['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname))return null;const id=url.hostname==='youtu.be'?url.pathname.slice(1):url.searchParams.get('v')||url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];if(!/^[\w-]{11}$/.test(id||''))return null;const raw=url.searchParams.get('t')||url.searchParams.get('start')||'0';let start=/^\d+$/.test(raw)?Number(raw):0;if(!start){for(const [,n,unit]of raw.matchAll(/(\d+)(h|m|s)/g))start+=Number(n)*({h:3600,m:60,s:1}[unit]);}return{id,start};}catch{return null;}}
function showLinkForm(){
  if(document.querySelector('#rv-link-form'))return;
  const input=e('input',{type:'url',placeholder:'ChatGPT 공유 링크 또는 YouTube 주소','aria-label':'첨부할 링크',required:true});
  const status=e('p',{'aria-live':'polite',class:'rv-muted'});
  const form=e('form',{id:'rv-link-form',class:'rv-link-form'},e('label',{},'링크 붙여넣기',input),button('첨부',null,{type:'submit'}),' ',button('닫기',()=>form.remove()),status);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;const url=input.value.trim();
    if(!chatGptShareInfo(url)&&!youtubeInfo(url)){status.textContent='ChatGPT 공유 링크 또는 YouTube 주소를 넣어줘.';return;}
    if(draft.embeds.some(embed=>embed.url===url)){status.textContent='이미 첨부한 링크야.';return;}
    setBusy(true);status.textContent='미리보기를 가져오는 중…';
    try{if(youtubeInfo(url))draft.embeds.push({id:crypto.randomUUID(),type:'youtube',url});else{const result=await service.resolveChatGptShare(url);draft.embeds.push(result.type?result:{id:crypto.randomUUID(),type:'chatgpt',url,snapshot:result.snapshot||result});}renderEditorEmbeds();form.remove();}
    catch(error){status.textContent=`미리보기를 가져오지 못했어. ${error.message}`;}
    finally{setBusy(false);renderThumbs();}
  });
  editorRoot.querySelector('.rv-editor-tools').after(form);input.focus();
}
function renderEditorEmbeds(){syncSaveState();const root=document.querySelector('#rv-embeds');if(!root)return;root.replaceChildren();draft.embeds.forEach((embed,index)=>{const view=embedView(embed);view.prepend(button('첨부에서 빼기',()=>{draft.embeds.splice(index,1);renderEditorEmbeds();},{class:'rv-link'}));root.append(view);});}
async function persist(status){
  if(busy||!draft)return;
  if(!draft.body?.trim()&&!draft.attachments.length&&!draft.embeds.length&&!draft.legacyHtml){uploadStatus.textContent='글이나 첨부를 하나 이상 남겨줘.';return;}
  if(!draft.recordDate){uploadStatus.textContent='기록 날짜를 선택해줘.';return;}
  if(status==='published'&&!categoryNames[draft.category]){uploadStatus.textContent='게시할 분류를 선택해줘.';app.querySelector('select[aria-label="기록 분류"]')?.focus();return;}
  setBusy(true,true);uploadStatus.textContent='저장하는 중…';
  try{const saved=await service.saveRecord({...draft,status});draft={...draft,...saved};baseline=JSON.stringify(draft);views.clear();uploadStatus.textContent=status==='draft'?'임시 저장했어.':'게시했어.';
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
