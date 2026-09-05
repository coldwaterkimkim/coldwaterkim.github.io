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
const categoryNames = { posts: '글방', daily: '나으 하루' };
let page = 0, hasMore = true, loading = false, generation = 0, observer;
let route = '', records = [], draft = null, baseline = '', busy = false;
let previousRoute = '#home', previousScroll = 0, editorRoot, uploadStatus;
const positions = new Map();
const views = new Map();
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
const safeURL = value => { if(!String(value||'').trim())return ''; try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const external = (text, url) => link(text, safeURL(url) || '#', { target:'_blank', rel:'noopener noreferrer' });
const idHash = id => `#record/${encodeURIComponent(id)}`;
const dirty = () => draft && JSON.stringify(draft) !== baseline;
function rememberView(){
  if(!route||route==='#compose'||loading)return;
  app.querySelectorAll('video,audio').forEach(media=>{media.pause();media.preload='none';media.load();});
  views.set(route,{nodes:[...app.childNodes],page,hasMore,records:[...records],scroll:window.scrollY});
}
function observeMore(){
  observer?.disconnect();
  const more=app.querySelector('[data-load-more]');
  if(more&&hasMore&&typeof IntersectionObserver!=='undefined'){
    observer=new IntersectionObserver(items=>{if(items.some(item=>item.isIntersecting))loadMore();},{rootMargin:'500px'});
    observer.observe(more);
  }
}

function header(title = null) {
  return e('header', { class:'rv-header' },
    title ? button('닫기', closeEditor) : button('☰', openNavigation, {class:'rv-hamburger','aria-label':'메뉴 열기','aria-haspopup':'dialog'}),
    !title ? e('h1', {}, link("coldwaterkim’s HOME", '#home')) : null,
    title ? e('h1', {}, title) : null,
    title ? button('게시', () => persist('published'), {'data-save':'published'}) : service.isOwner() ? button('+', () => openEditor(), {class:'rv-plus', 'aria-label':'새 기록 남기기'}) : null);
}
function bottom() {
  return e('nav', { class:'rv-bottom', 'aria-label':'주 메뉴' },
    ...[['홈','#home'],['앨범','#album'],['글방','#posts']].map(([text,hash]) => link(text,hash,{'aria-current':route===hash?'page':null})));
}
function shell(title, subtitle) {
  app.replaceChildren(header());
  if(typeof __RECORDS_PREVIEW__!=='undefined'&&__RECORDS_PREVIEW__===true)app.append(e('p',{class:'rv-preview-note'},'로컬 검토본 · 운영 미반영'));
  if (title) app.append(e('section',{class:'rv-heading'},e('h2',{},title),subtitle?e('p',{class:'rv-muted'},subtitle):null));
  app.append(bottom());
}
function person(record, editable = true) {
  return e('div',{class:'rv-person'},e('img',{class:'rv-avatar',src:'/assets/profile-crop.jpg',alt:''}),
    e('div',{},e('strong',{},'김찬수'),e('div',{class:'rv-meta'},link(categoryNames[record.category]||'기록',`#${record.category||'daily'}`),link(dateLabel(record.firstPublishedAt || record.recordDate),idHash(record.id)))),
    editable && service.isOwner() ? button('편집',()=>openEditor(record),{class:'rv-link rv-edit'}) : null);
}
function croppedImage(attachment, {lazy=true} = {}) {
  const img = e('img',{src:safeURL(attachment.url),alt:attachment.alt||attachment.name||'기록 사진',loading:lazy?'lazy':'eager',decoding:'async'});
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
  enhanceEmbeddedMedia(body);
  decorateChatGptMarkdown(body);
  body.querySelectorAll('video,audio').forEach(media=>{media.preload='none';media.controls=true;});
  body.querySelectorAll('img').forEach(img=>{img.loading='lazy';});
  const details=e('section',{class:'rv-legacy'},body);
  if(preview){
    body.classList.add('rv-legacy-preview');
    const more=button('더 보기',()=>{body.classList.remove('rv-legacy-preview');more.remove();},{class:'rv-link rv-legacy-more',hidden:true,'aria-label':'더 보기'});
    const measure=()=>{if(more.isConnected)more.hidden=body.scrollHeight<=602;};
    details.append(more);body.querySelectorAll('img,video').forEach(media=>media.addEventListener('load',measure,{once:true}));
    requestAnimationFrame(measure);
  }
  return details;
}
function entry(record, targetAttachment = '', isDetail = false) {
  const article = e('article',{class:'rv-entry','data-record-id':record.id},person(record));
  const title=String(record.legacySource?.title||'').trim();
  if(title&&!/^\d{4}-\d{2}-\d{2} 나으 하루(?:\s|$)/.test(title)&&title!==record.body?.trim())article.append(e('h2',{class:'rv-record-title'},title));
  const visuals = (record.attachments||[]).filter(a=>a.kind==='image'||a.kind==='video');
  const text = e('p',{class:'rv-body'});
  const setText = i => {text.textContent=visuals[i]?.comment?.trim() ? visuals[i].comment : record.body||'';text.hidden=!text.textContent;};
  setText(0);
  if (visuals.length) {
    const slides = e('div',{class:'rv-slides',tabIndex:0,'aria-label':`사진·영상 ${visuals.length}개. 좌우로 넘겨 보기`});
    const count = e('span',{class:'rv-count'},`1 / ${visuals.length}`);
    const dots = e('div',{class:'rv-dots','aria-hidden':'true'},visuals.map((_,i)=>e('span',{class:'rv-dot','aria-current':i===0?'true':'false'})));
    visuals.forEach((attachment,i)=>{
      const media = attachment.kind==='image' ? croppedImage(attachment) : e('video',{src:safeURL(attachment.playbackUrl||attachment.url),poster:safeURL(attachment.posterUrl)||undefined,controls:true,playsInline:true,preload:'none'});
      const slide=e('figure',{class:'rv-slide','aria-label':`${i+1} / ${visuals.length}`},media);
      if(attachment.kind==='image') slide.append(link('원본',safeURL(attachment.url),{class:'rv-slide-original',target:'_blank',rel:'noopener noreferrer'}));
      slides.append(slide);
    });
    let current=0;
    slides.addEventListener('scroll',()=>{
      const index=Math.max(0,Math.min(visuals.length-1,Math.round(slides.scrollLeft/slides.clientWidth)));
      if(index===current)return;
      slides.querySelectorAll('video').forEach(video=>video.pause());current=index;setText(index);
      count.textContent=`${index+1} / ${visuals.length}`;
      [...dots.children].forEach((dot,i)=>dot.setAttribute('aria-current',i===index?'true':'false'));
    },{passive:true});
    slides.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight'].includes(event.key)||event.target!==slides)return;
      event.preventDefault();slides.scrollBy({left:(event.key==='ArrowRight'?1:-1)*slides.clientWidth,behavior:'auto'});
    });
    article.append(e('div',{class:'rv-carousel'},slides,visuals.length>1?count:null),visuals.length>1?dots:null);
    const requested=visuals.findIndex(a=>a.id===targetAttachment);
    if(requested>0)requestAnimationFrame(()=>{slides.scrollLeft=requested*slides.clientWidth;});
  }
  article.append(text);
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
    const result=await service.listRecords({page:page+1,perPage:12,category:['#posts','#daily'].includes(route)?route.slice(1):undefined,status:route==='#drafts'?'draft':'published'});
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
  }catch(error){if(token===generation){const status=document.querySelector('#rv-feed-status');status.textContent=`기록을 불러오지 못했어. ${error.message}`;status.classList.add('rv-error');if(loadButton){loadButton.disabled=false;loadButton.textContent='다시 불러오기';}}}
  finally{if(token===generation)loading=false;}
}
function openNavigation() {
  const previous=document.activeElement;
  const dialog=e('dialog',{class:'rv-navigation','aria-label':'페이지 메뉴'});
  const close=()=>dialog.close();
  const items=[['홈','#home'],['나으 하루','#daily'],['글방','#posts'],['앨범','#album'],['나사잡','/nasajab/'],['프로그램실','/programs/'],['방명록','/guestbook.html'],['Ask Me','/askme.html'],['About / Contact','/about.html']];
  if(service.isOwner())items.push(['임시 저장한 기록','#drafts']);
  dialog.append(e('div',{class:'rv-row'},e('strong',{},'어느 방으로 갈까?'),button('닫기',close)),e('nav',{},items.map(([label,url])=>link(label,url,{onClick:close}))));
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}});
  dialog.addEventListener('close',()=>{dialog.remove();previous?.focus();},{once:true});
  document.body.append(dialog);dialog.showModal();
}
async function hydrateHomeShell() {
  await Promise.all([...document.querySelectorAll('[data-key]')].map(async node=>{
    const value=await getSetting(node.dataset.key);if(value)node.innerHTML=sanitizeLegacyHtml(value);
  }));
  const photo=await getSetting('profile_photo_url');
  if(safeURL(photo))document.querySelectorAll('.profile-photo').forEach(img=>{img.src=safeURL(photo);});
  const audio=document.querySelector('[data-bgm]');
  if(audio){
    const [raw,legacy]=await Promise.all([getSetting('bgm_playlist'),getSetting('bgm_audio_url')]);
    let tracks=[];try{tracks=JSON.parse(raw||'[]');}catch{}
    const urls=[...new Set([legacy,...(Array.isArray(tracks)?tracks.map(t=>t.url):[])].map(safeURL).filter(Boolean))];
    audio.removeAttribute('autoplay');audio.loop=urls.length===1;
    if(urls.length){let index=0;audio.src=urls[0];audio.addEventListener('ended',()=>{index=(index+1)%urls.length;audio.src=urls[index];audio.play().catch(()=>{});});}
  }
}
function renderMenu() {
  shell('메뉴','기록을 모아 보거나, 다른 방으로 이동해.');
  const items=[['나으 하루','#daily'],['글방','#posts'],['앨범','#album'],['전체 기록','#home'],['나사잡','/nasajab/'],['프로그램실','/programs/'],['방명록','/guestbook.html'],['Ask Me','/askme.html'],['About','/about.html'],['기존 홈페이지','/index.html']];
  if(service.isOwner())items.unshift(['임시 저장한 기록','#drafts']);
  app.append(e('ul',{class:'rv-menu'},items.map(([label,url])=>e('li',{},link(label,url)))));
}
async function renderRoute() {
  const next=location.hash||'#home';
  if(draft){if(busy||dirty()&&!confirm('저장하지 않은 변경을 닫을까?')){history.replaceState(null,'','#compose');return;}draft=null;}
  document.body.classList.toggle('rv-composing',next==='#compose');
  rememberView();positions.set(route,window.scrollY);route=next;generation++;observer?.disconnect();loading=false;page=0;hasMore=true;records=[];
  const cached=views.get(route);
  if(cached){app.replaceChildren(...cached.nodes);page=cached.page;hasMore=cached.hasMore;records=[...cached.records];observeMore();window.scrollTo(0,cached.scroll);return;}
  if(route==='#compose'){await openEditor();return;}
  if(route==='#menu'){renderMenu();window.scrollTo(0,positions.get(route)||0);return;}
  if(route.startsWith('#record/')) {
    shell();const token=generation;const status=e('p',{class:'rv-status'},'기록을 불러오는 중…');app.append(status);
    try{const [,id,attachment]=route.split('/');const record=await service.getRecord(decodeURIComponent(id));if(token!==generation)return;status.replaceWith(e('div',{class:'rv-heading'},link('← 피드로','#home')),entry(record,decodeURIComponent(attachment||''),true));}
    catch(error){status.textContent=`기록을 열지 못했어. ${error.message}`;}
    window.scrollTo(0,0);return;
  }
  if(route==='#drafts'&&!service.isOwner()){shell('임시 저장');app.append(e('p',{class:'rv-status'},'주인장 로그인 후 볼 수 있어.'));return;}
  const headings={'#posts':['글방','글과 생각을 모아 놓은 방.'],'#daily':['나으 하루','하루의 장면과 짧은 이야기.'],'#album':['앨범','기록 속 사진과 영상.'],'#drafts':['임시 저장','아직 게시하지 않은 기록.']};
  shell(...(headings[route]||[]));
  app.append(e('main',{id:'rv-feed',class:route==='#album'?'rv-album':''}),e('p',{id:'rv-feed-status',class:'rv-status','aria-live':'polite'}));
  const more=button('이전 기록 더 보기',loadMore,{class:'rv-more','data-load-more':true});app.append(more);
  await loadMore();
  observeMore();
  window.scrollTo(0,positions.get(route)||0);
}

async function openEditor(record = null) {
  if(!service.isOwner())return;
  if(!draft){previousRoute=route==='#compose'?'#home':route;previousScroll=window.scrollY;}
  rememberView();
  generation++;observer?.disconnect();
  draft=record?structuredClone(record):{category:route==='#posts'?'posts':'daily',body:'',attachments:[],embeds:[],status:'draft',recordDate:dayNow()};
  draft.attachments ||= [];draft.embeds ||= [];
  baseline=JSON.stringify(draft);busy=false;
  history.pushState(null,'','#compose');route='#compose';
  document.body.classList.add('rv-composing');
  app.replaceChildren(header('기록 남기기'));
  if(typeof __RECORDS_PREVIEW__!=='undefined'&&__RECORDS_PREVIEW__===true)app.append(e('p',{class:'rv-preview-note'},'로컬 검토본 · 운영 미반영'));
  editorRoot=e('main',{class:'rv-editor'});app.append(editorRoot);
  const select=e('select',{'aria-label':'기록 분류',onChange:event=>{draft.category=event.target.value;}},Object.entries(categoryNames).map(([value,label])=>e('option',{value,selected:draft.category===value},label)));
  editorRoot.append(e('div',{class:'rv-person'},e('img',{class:'rv-avatar',src:'/assets/profile-crop.jpg',alt:''}),e('div',{},e('strong',{},'김찬수'),e('div',{},select)),button('임시 저장',()=>persist('draft'),{class:'rv-link rv-draft','data-save':'draft'})));
  const textarea=e('textarea',{class:'rv-compose-body','aria-label':'게시물 공통 본문',placeholder:'지금 남기고 싶은 이야기…',value:draft.body||'',onInput:event=>{draft.body=event.target.value;}});
  textarea.addEventListener('paste',event=>{const files=[...(event.clipboardData?.files||[])];if(files.length){event.preventDefault();attachFiles(files);}});
  editorRoot.append(textarea,e('div',{id:'rv-thumbs',class:'rv-thumbs'}));
  renderThumbs();
  editorRoot.append(e('p',{class:'rv-muted'},'사진을 누르면 자르기 · 사진별 코멘트'));
  const file=e('input',{type:'file',multiple:true,hidden:true,onChange:event=>{attachFiles([...event.target.files]);event.target.value='';}});
  const media=e('input',{type:'file',accept:'image/*,video/*',multiple:true,hidden:true,onChange:event=>{attachFiles([...event.target.files]);event.target.value='';}});
  editorRoot.append(file,media,e('div',{class:'rv-editor-tools'},button('사진 · 영상',()=>media.click()),button('링크',showLinkForm),button('파일 · 오디오',()=>file.click())));
  uploadStatus=e('div',{class:'rv-status','aria-live':'polite'});editorRoot.append(uploadStatus,e('div',{id:'rv-embeds'}));renderEditorEmbeds();
  editorRoot.append(e('label',{class:'rv-date'},'기록 날짜',e('input',{type:'date',value:draft.recordDate||dayNow(),onChange:event=>{draft.recordDate=event.target.value;}})));
  if(draft.legacyHtml)editorRoot.append(e('p',{class:'rv-muted'},'기존 원문은 별도로 보존돼. 여기서 본문과 첨부를 바꿔도 기존 원문은 변경되지 않아.'),legacyView(draft,false,true));
  editorRoot.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
  editorRoot.addEventListener('drop',event=>{if(event.dataTransfer?.files.length){event.preventDefault();attachFiles([...event.dataTransfer.files]);}});
  window.scrollTo(0,0);textarea.focus({preventScroll:true});
}
function closeEditor(){if(busy)return;if(dirty()&&!confirm('저장하지 않은 변경을 닫을까?'))return;draft=null;history.replaceState(null,'',previousRoute);route='';renderRoute().then(()=>window.scrollTo(0,previousScroll));}
function setBusy(value,lockText=false){busy=value;app.querySelectorAll('button,input,select').forEach(node=>{node.disabled=value;});app.querySelectorAll('textarea').forEach(node=>{node.disabled=value&&lockText;});}
function renderThumbs(){
  const root=document.querySelector('#rv-thumbs');if(!root)return;root.replaceChildren();
  draft.attachments.forEach((attachment,index)=>{
    const preview=e('div',{class:'rv-thumb-preview'});
    if(attachment.kind==='image')preview.append(croppedImage(attachment));
    else if(attachment.kind==='video')preview.append(e('video',{src:safeURL(attachment.url),preload:'none',muted:true}));
    else preview.append(e('p',{},attachment.name||'첨부 파일'));
    if(attachment.kind==='image')preview.append(button('사진 편집',()=>editPhoto(index),{class:'rv-thumb-edit','aria-label':`사진 ${index+1} 자르기와 코멘트`}));
    preview.append(e('span',{class:'rv-thumb-number'},index+1),button('×',()=>{draft.attachments.splice(index,1);renderThumbs();},{'aria-label':`${index+1}번째 첨부에서 빼기`}));
    const move=direction=>{const other=index+direction;if(other<0||other>=draft.attachments.length)return;[draft.attachments[index],draft.attachments[other]]=[draft.attachments[other],draft.attachments[index]];renderThumbs();};
    root.append(e('div',{class:'rv-thumb'},preview,e('div',{class:'rv-thumb-tools'},button('←',()=>move(-1),{disabled:index===0,'aria-label':`${index+1}번째 첨부 앞으로`}),button(attachment.kind==='image'?'편집':'코멘트',()=>editPhoto(index),{class:'rv-link'}),button('→',()=>move(1),{disabled:index===draft.attachments.length-1,'aria-label':`${index+1}번째 첨부 뒤로`})),attachment.comment?e('small',{},'코멘트 있음'):null));
  });
}
async function editPhoto(index){
  if(busy)return;const attachment=draft.attachments[index];
  if(attachment.kind!=='image'){const comment=prompt('이 첨부의 코멘트 (비워두면 공통 본문)',attachment.comment||'');if(comment!==null){attachment.comment=comment;renderThumbs();}return;}
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
function renderEditorEmbeds(){const root=document.querySelector('#rv-embeds');if(!root)return;root.replaceChildren();draft.embeds.forEach((embed,index)=>{const view=embedView(embed);view.prepend(button('첨부에서 빼기',()=>{draft.embeds.splice(index,1);renderEditorEmbeds();},{class:'rv-link'}));root.append(view);});}
async function persist(status){
  if(busy||!draft)return;
  if(!draft.body?.trim()&&!draft.attachments.length&&!draft.embeds.length&&!draft.legacyHtml){uploadStatus.textContent='글이나 첨부를 하나 이상 남겨줘.';return;}
  if(!draft.recordDate){uploadStatus.textContent='기록 날짜를 선택해줘.';return;}
  setBusy(true,true);uploadStatus.textContent='저장하는 중…';
  try{const saved=await service.saveRecord({...draft,status});draft={...draft,...saved};baseline=JSON.stringify(draft);views.clear();uploadStatus.textContent=status==='draft'?'임시 저장했어.':'게시했어.';
    if(status==='published'){draft=null;history.replaceState(null,'',idHash(saved.id));route='';await renderRoute();}}
  catch(error){uploadStatus.textContent=`저장하지 못했어. ${error.message}`;}
  finally{setBusy(false);if(draft)renderThumbs();}
}
window.addEventListener('beforeunload',event=>{if(dirty()||busy){event.preventDefault();event.returnValue='';}});
window.addEventListener('hashchange',renderRoute);
try{await service.initSession();await hydrateHomeShell();await renderRoute();}
catch(error){app.replaceChildren(e('header',{class:'rv-header'},e('h1',{},'coldwaterkim’s HOME')),e('p',{class:'rv-status rv-error'},`기록을 연결하지 못했어. ${error.message}`),button('다시 시도',()=>location.reload()));}
