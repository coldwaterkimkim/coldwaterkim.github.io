const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/markdown-editor-CGGT13To.js","assets/markdown-editor-BblGnchh.js","assets/chunk-BHe-jwch.js","assets/preload-helper-zJ_50EbN.js","assets/media-embeds-C5gWzuu7.js","assets/comments-D6GJfkY1.js","assets/FloatingThreadController-BZkNOp17-D-HTHEZO.js","assets/markdown-editor-0dMTmUGQ.css"])))=>i.map(i=>d[i]);
import{O as e,V as t,at as n,ft as r,r as i,v as a,z as o}from"./pb-C-i25jnJ.js";import{n as s,t as c}from"./site-QZAybNS7.js";import{t as l}from"./media-embeds-C5gWzuu7.js";import{t as u}from"./preload-helper-zJ_50EbN.js";var d=`about_wiki_document`,f=new Set([`image/jpeg`,`image/png`,`image/gif`,`image/webp`]),p=null,m=null,h=null,g=null,_=null,v=null,ee={title:`김찬수`,subtitle:``,profileTitle:`coldwaterkim`,profileImage:`assets/profile-crop.jpg`,profileSchemaVersion:2,profileRows:c(),sections:[{id:`overview`,title:`개요`,body:`대한민국의 밀레니엄 베이비. 개인 홈페이지 <b>coldwaterkim.com</b>의 주인장이다.<br><br>글방, 나으 하루, 프로그램실, 나사잡을 통해 생각·일상·만든 것·갑자기 사로잡힌 이미지를 계속 쌓고 있다. 모던한 포트폴리오보다는 직접 만든 홈페이지의 기척을 더 좋아하는 편.`},{id:`what-made`,title:`만든 것`,body:`<ul><li><b>글방</b>: 생각과 기록을 올리는 곳.</li><li><b>나으 하루</b>: 하루 단위로 남기는 생활 로그.</li><li><b>프로그램실</b>: 직접 만든 작은 프로그램과 실험작을 보관하는 자료실.</li><li><b>나사잡</b>: 나를 사로잡은 사진, 캡처, 장면을 한 장씩 수집하는 코너.</li></ul>`},{id:`history`,title:`연혁`,body:`<table><tr><th>시기</th><th>내용</th></tr><tr><td>2000</td><td>태어남. 당시 본인은 기억이 없다.</td></tr><tr><td>2025</td><td>개인 홈페이지를 진짜 운영물로 만들기 시작.</td></tr><tr><td>2026</td><td>홈페이지가 점점 위키, 블로그, 자료실, 방명록을 겸하는 무언가가 되어가는 중.</td></tr></table>`},{id:`taste`,title:`취향`,body:`90년대 개인 홈페이지, 기본 파란 링크, 마퀴, 방문자 카운터, 수상하게 진심인 테이블 UI를 좋아한다. 너무 매끈한 포트폴리오보다 약간 삐걱대지만 실제로 운영되는 웹을 더 신뢰한다.`},{id:`contact`,title:`연락처`,body:`메일은 <a href="mailto:ckstn1112@gmail.com?subject=Hello%20from%20your%20site">ckstn1112@gmail.com</a>으로 보내면 된다. 방명록에 한 줄 남기는 것도 환영.`},{id:`trivia`,title:`여담`,body:`이 문서는 나무위키처럼 보이지만 실제로는 본인이 직접 관리한다. 그래서 틀린 내용이 있다면 높은 확률로 본인이 미래의 본인에게 남긴 과제다.`}]},te=new WeakMap;y(),window.addEventListener(`coldwaterkim:content-ready`,y);function y(){document.querySelectorAll(`[data-about-wiki-root]`).forEach(e=>{if(e.dataset.aboutWikiReady===`true`)return;e.dataset.aboutWikiReady=`true`;let n={root:e,doc:J(),isOwner:t(),selectedSectionId:null,selectedProfileIndex:null,sectionEditor:null,pendingEditorImageIndex:null,saveTimer:null};te.set(e,n),ne(n)})}async function ne(e){b(e);try{let t=re(await o(d));t&&(e.doc=t,b(e))}catch(t){L(e,`CMS 설정을 불러오지 못했음: ${i(t)}`,`error`)}}function re(e){if(!e)return null;try{return ie(JSON.parse(e))}catch(e){return console.warn(`About wiki document parse failed:`,e),null}}function ie(e){let t=J();return!e||typeof e!=`object`?t:(t.title=Z(e.title)||t.title,t.subtitle=Z(e.subtitle)||t.subtitle,t.profileTitle=Z(e.profileTitle)||t.profileTitle,t.profileImage=Z(e.profileImage)||t.profileImage,t.profileSchemaVersion=2,Array.isArray(e.profileRows)&&(t.profileRows=s(e.profileRows,{mergeDefaults:Number(e.profileSchemaVersion||0)<2})),Array.isArray(e.sections)&&(t.sections=e.sections.map((e,t)=>({id:Y(e?.id,e?.title,t),title:Z(e?.title)||`새 섹션 ${t+1}`,body:Q(e?.body)})).filter(e=>e.title||e.body)),t.sections.length===0&&(t.sections=J().sections),t)}function b(e){let{root:t,doc:n,isOwner:r}=e;e.sectionEditor=null,e.pendingEditorImageIndex=null,t.innerHTML=`
    ${r?x(e):``}
    <div class="about-wiki-head">
      <h1>${a(n.title)}</h1>
    </div>
    <div class="about-wiki-status" data-about-status hidden></div>
    <div class="about-profile-block">
      ${S(n,r)}
      ${C(n.sections,r)}
    </div>
    <div class="about-wiki-body">
      ${w(n.sections,r)}
    </div>
    ${r?E(e):``}
  `,T(e),A(e),D(e)}function x(e){let t=K(e);return`
    <div class="owner-bar about-owner-bar">
      <b>OWNER MODE</b> ·
      <button type="button" class="owner-btn" data-about-action="add-section">섹션 추가</button>
      <button type="button" class="owner-btn" data-about-action="edit-profile">프로필 표 수정</button>
      <button type="button" class="owner-btn" data-about-action="reset-selection">편집 닫기</button>
      <span class="note">${t?`"${a(t.title)}" 편집 중`:`섹션 제목에서 [편집] 누르면 바로 고침`}</span>
    </div>
  `}function S(e,t){let n=e.profileRows.map((e,n)=>`
    <tr>
      <th>${a(e.label||``)}</th>
      <td>
        <span data-about-profile-value-index="${n}"></span>
        ${t?`<button type="button" class="about-edit-link" data-about-action="edit-profile-row" data-profile-index="${n}">[편집]</button>`:``}
      </td>
    </tr>
  `).join(``);return`
    <table class="about-infobox" border="1" cellspacing="0" cellpadding="5" align="right">
      <tr>
        <th colspan="2" class="about-infobox-title">${a(e.profileTitle)}</th>
      </tr>
      <tr>
        <td colspan="2" class="about-infobox-photo">
          <img src="${$(e.profileImage)}" alt="${$(e.profileTitle)} profile">
        </td>
      </tr>
      ${n}
    </table>
  `}function C(e,t){return`
    <table class="about-toc" border="1" cellspacing="0" cellpadding="6">
      <tr bgcolor="#f0f0f0">
        <th>목차</th>
      </tr>
      <tr>
        <td>
          <ol>${e.map(e=>`
    <li>
      <a href="#about-section-${$(e.id)}">${a(e.title)}</a>
      ${t?`<button type="button" class="about-edit-link" data-about-action="edit-section" data-section-id="${$(e.id)}">[편집]</button>`:``}
    </li>
  `).join(``)}</ol>
        </td>
      </tr>
    </table>
  `}function w(e,t){return e.map((e,n)=>`
    <div class="about-section" id="about-section-${$(e.id)}" data-section-id="${$(e.id)}">
      <h2>
        <span>${n+1}. ${a(e.title)}</span>
        ${t?`<button type="button" class="about-edit-link" data-about-action="edit-section" data-section-id="${$(e.id)}">[편집]</button>`:``}
      </h2>
      <div class="about-section-body post-content" data-about-section-body-index="${n}"></div>
    </div>
  `).join(``)}function T(e){e.root.querySelectorAll(`[data-about-profile-value-index]`).forEach(t=>{let n=Number(t.getAttribute(`data-about-profile-value-index`));t.innerHTML=e.doc.profileRows[n]?.value||``}),e.root.querySelectorAll(`[data-about-section-body-index]`).forEach(t=>{let n=Number(t.getAttribute(`data-about-section-body-index`));t.innerHTML=e.doc.sections[n]?.body||`<p></p>`}),l(e.root)}function E(e){let t=K(e),n=e.selectedProfileIndex,r=Number.isInteger(n)?e.doc.profileRows[n]:null;if(r)return`
      <form class="about-editor" data-about-editor="profile">
        <b>프로필 표 row 편집</b>
        <table border="1" cellspacing="0" cellpadding="5" width="100%">
          <tr>
            <th width="120">라벨</th>
            <td><input type="text" name="label" value="${$(r.label)}"></td>
          </tr>
          <tr>
            <th>값</th>
            <td><textarea name="value" rows="4">${ce(r.value)}</textarea></td>
          </tr>
        </table>
        <div class="about-editor-actions">
          <button type="submit" class="owner-btn">저장</button>
          <button type="button" class="owner-btn owner-btn-danger" data-about-action="delete-profile-row">삭제</button>
          <button type="button" class="owner-btn" data-about-action="add-profile-row">row 추가</button>
        </div>
      </form>
    `;if(!t)return`
      <div class="about-editor about-editor-empty">
        <b>문서 편집 대기중</b><br>
        <span class="note">섹션 제목 옆 [편집]을 누르거나, OWNER MODE에서 섹션을 추가하면 편집기가 열림.</span>
      </div>
    `;let i=e.doc.sections.findIndex(e=>e.id===t.id);return`
    <form class="about-editor" data-about-editor="section">
      <b>섹션 편집: ${a(t.title)}</b>
      <table border="1" cellspacing="0" cellpadding="5" width="100%">
        <tr>
          <th width="120">제목</th>
          <td><input type="text" name="title" value="${$(t.title)}"></td>
        </tr>
        <tr>
          <th>본문</th>
          <td>
            <div class="about-editor-container" data-about-editor-container>
              <div data-about-markdown-editor></div>
            </div>
            <input type="file" data-about-image-input accept="image/*" multiple hidden>
            <div class="about-editor-image-status" data-about-image-status aria-live="polite"></div>
            <div class="note">블로그랑 같은 Markdown/WYSIWYG 편집기. 저장하면 목차 번호는 자동 재계산됨.</div>
          </td>
        </tr>
      </table>
      <div class="about-editor-actions">
        <button type="submit" class="owner-btn">저장</button>
        <button type="button" class="owner-btn" data-about-action="move-section" data-direction="-1" ${i<=0?`disabled`:``}>위로</button>
        <button type="button" class="owner-btn" data-about-action="move-section" data-direction="1" ${i>=e.doc.sections.length-1?`disabled`:``}>아래로</button>
        <button type="button" class="owner-btn owner-btn-danger" data-about-action="delete-section">삭제</button>
      </div>
    </form>
  `}async function D(e){if(!e.isOwner)return;await O();let t=K(e),n=e.root.querySelector(`[data-about-markdown-editor]`),r=e.root.querySelector(`[data-about-editor="section"]`),a=e.root.querySelector(`[data-about-image-input]`);if(!t||!n||!r||!a)return;let o=t.id;try{let i=await m(n,{height:`320px`,minHeight:`240px`,placeholder:`Markdown으로 섹션 본문 쓰기...`,onImageButton:()=>{e.pendingEditorImageIndex=H(e),a.click()},uploadFile:t=>W(e,t)});if(!n.isConnected||e.selectedSectionId!==o)return;e.sectionEditor=i,i.root.innerHTML=t.body||``,k(e,r,a,i)}catch(t){L(e,`편집기 로드 실패: ${i(t)}`,`error`)}}async function O(){p||=u(()=>import(`./markdown-editor-CGGT13To.js`),__vite__mapDeps([0,1,2,3,4,5,6,7]));let e=await p;m=e.createMarkdownEditor,h=e.editorUploadLabel,g=e.hasImageTransfer,_=e.imageFilesFromTransfer,v=e.isSupportedEditorUpload}function k(e,t,n,r){let i=t.querySelector(`[data-about-editor-container]`);i&&(n.addEventListener(`change`,async()=>{await U(e,n.files,{index:e.pendingEditorImageIndex}),e.pendingEditorImageIndex=null,n.value=``}),i.addEventListener(`dragenter`,e=>{g(e.dataTransfer)&&(e.preventDefault(),i.classList.add(`is-image-dragover`))}),i.addEventListener(`dragover`,e=>{g(e.dataTransfer)&&(e.preventDefault(),i.classList.add(`is-image-dragover`))}),i.addEventListener(`dragleave`,e=>{e.relatedTarget instanceof Node&&i.contains(e.relatedTarget)||i.classList.remove(`is-image-dragover`)}),i.addEventListener(`drop`,async t=>{g(t.dataTransfer)&&(t.preventDefault(),t.stopPropagation(),i.classList.remove(`is-image-dragover`),await U(e,z(t.dataTransfer),{index:H(e)}))},!0),r.root.addEventListener(`paste`,async t=>{g(t.clipboardData)&&(t.preventDefault(),t.stopPropagation(),await U(e,z(t.clipboardData),{index:H(e)}))},!0))}function A(e){e.isOwner&&(e.eventsBound||(e.eventsBound=!0,e.root.addEventListener(`click`,t=>{let n=t.target.closest(`[data-about-action]`);if(!n||!e.root.contains(n))return;let r=n.dataset.aboutAction;r===`edit-section`&&(e.selectedProfileIndex=null,e.selectedSectionId=n.dataset.sectionId||null,b(e),q(e)),r===`add-section`&&ae(e),r===`delete-section`&&oe(e),r===`move-section`&&se(e,Number(n.dataset.direction||0)),r===`edit-profile`&&N(e),r===`add-profile-row`&&M(e),r===`edit-profile-row`&&(e.selectedSectionId=null,e.selectedProfileIndex=Number(n.dataset.profileIndex),b(e),q(e)),r===`delete-profile-row`&&P(e),r===`reset-selection`&&(e.selectedSectionId=null,e.selectedProfileIndex=null,b(e))}),e.root.addEventListener(`submit`,t=>{let n=t.target.closest(`[data-about-editor]`);!n||!e.root.contains(n)||(t.preventDefault(),n.dataset.aboutEditor===`section`&&j(e,n),n.dataset.aboutEditor===`profile`&&F(e,n))})))}function ae(e){let t=X(e.doc.sections,`new-section`),n={id:t,title:`새 섹션`,body:`여기에 내용을 적으면 목차에 자동으로 추가됨.`};e.doc.sections.push(n),e.selectedSectionId=t,e.selectedProfileIndex=null,I(e,`섹션 추가됨`)}function oe(e){let t=K(e);t&&window.confirm(`"${t.title}" 섹션을 삭제할까?`)&&(e.doc.sections=e.doc.sections.filter(e=>e.id!==t.id),e.selectedSectionId=null,I(e,`섹션 삭제됨`))}function se(e,t){let n=e.doc.sections.findIndex(t=>t.id===e.selectedSectionId),r=n+t;if(n<0||r<0||r>=e.doc.sections.length)return;let[i]=e.doc.sections.splice(n,1);e.doc.sections.splice(r,0,i),I(e,`순서 변경됨`)}function j(e,t){let n=K(e);if(!n)return;let r=Z(new FormData(t).get(`title`))||`제목 없음`;n.title=r,n.body=Q(R(e,n.body)),n.id=X(e.doc.sections.filter(e=>e!==n),Y(n.id,r)),e.selectedSectionId=n.id,I(e,`섹션 저장됨`)}function M(e){e.doc.profileRows.push({label:`새 항목`,value:`내용`}),e.selectedSectionId=null,e.selectedProfileIndex=e.doc.profileRows.length-1,I(e,`프로필 row 추가됨`)}function N(e){if(e.doc.profileRows.length===0){M(e);return}e.selectedSectionId=null,e.selectedProfileIndex=0,b(e),q(e)}function P(e){Number.isInteger(e.selectedProfileIndex)&&(e.doc.profileRows.splice(e.selectedProfileIndex,1),e.selectedProfileIndex=null,I(e,`프로필 row 삭제됨`))}function F(e,t){let n=e.selectedProfileIndex;if(!Number.isInteger(n)||!e.doc.profileRows[n])return;let r=new FormData(t);e.doc.profileRows[n]={label:Z(r.get(`label`))||`항목`,value:Q(r.get(`value`))},I(e,`프로필 row 저장됨`)}async function I(e,t){b(e),L(e,`저장 중...`,`pending`);try{e.doc.profileSchemaVersion=2,await n(d,JSON.stringify(e.doc)),window.dispatchEvent(new CustomEvent(`coldwaterkim:profile-data-updated`,{detail:{document:e.doc}})),L(e,t||`저장됨`,`success`)}catch(t){L(e,`저장 실패: ${i(t)}`,`error`)}}function L(e,t,n=`success`){let r=e.root.querySelector(`[data-about-status]`);r&&(r.hidden=!1,r.textContent=t,r.className=`about-wiki-status about-wiki-status--${n}`,n===`success`&&(window.clearTimeout(e.saveTimer),e.saveTimer=window.setTimeout(()=>{let t=e.root.querySelector(`[data-about-status]`);t&&(t.hidden=!0)},1600)))}function R(e,t=``){let n=e.sectionEditor?.root?.innerHTML?.trim();return n===`<p><br></p>`?``:typeof n==`string`?n:t}function z(e){return _(e,{mimeTypes:f,fallbackNamePrefix:`about-section-image`})}function B(e){return e&&f.has(e.type)}function V(e,t){return e.sectionEditor?.clampIndex(t)||0}function H(e){let t=e.sectionEditor?.getSelection?.();return V(e,t?.index)}async function U(t,n,a={}){let o=t.sectionEditor;if(!o)return;let s=Array.from(n||[]).filter(B);if(!s.length){G(t,`JPG, PNG, GIF, WebP 이미지만 본문에 넣을 수 있어.`,`error`);return}let c=t.root.querySelector(`[data-about-editor-container]`),l=V(t,a.index),u=0;c?.classList.add(`is-image-uploading`);for(let n=0;n<s.length;n+=1){let a=s[n];G(t,`이미지 업로드 중... (${n+1}/${s.length}) ${a.name}`,`info`);try{let t=await r(a,a.name,`About wiki`),n=e(t,t.file);l=o.insertImage(l,n,a.name),u+=1}catch(e){G(t,`본문 이미지 업로드 실패 (${a.name}): ${i(e)}`,`error`)}}c?.classList.remove(`is-image-uploading`),u>0&&(o.setSelection(l,0,`silent`),G(t,`${u}개 이미지가 본문에 들어갔습니다.`,`success`),setTimeout(()=>G(t),2500))}async function W(t,n){if(!v?.(n))throw Error(`JPG, PNG, GIF, WebP, MP4, WebM, MOV, M4V, MP3, PDF만 본문에 넣을 수 있어.`);let a=h?.(n)||`파일`;G(t,`${a} 업로드 중... ${n.name||``}`,`info`);try{let i=await r(n,n.name,`About wiki media`),o=e(i,i.file);return G(t,`${a} 업로드 완료.`,`success`),setTimeout(()=>G(t),1800),o}catch(e){throw G(t,`${a} 업로드 실패: ${i(e)}`,`error`),e}}function G(e,t=``,n=`info`){let r=e.root.querySelector(`[data-about-image-status]`);r&&(r.textContent=t,r.className=`about-editor-image-status about-editor-image-status--${n}`,r.classList.toggle(`is-visible`,!!t))}function K(e){return e.doc.sections.find(t=>t.id===e.selectedSectionId)||null}function q(e){requestAnimationFrame(()=>{e.root.querySelector(`.about-editor`)?.scrollIntoView({block:`nearest`,behavior:`smooth`})})}function J(){return JSON.parse(JSON.stringify(ee))}function Y(e,t,n=0){return(Z(e)||Z(t)||`section-${n+1}`).normalize(`NFKD`).toLowerCase().replace(/[^a-z0-9가-힣]+/g,`-`).replace(/^-+|-+$/g,``)||`section-${n+1}`}function X(e,t){let n=Y(t,t),r=n,i=2,a=new Set(e.map(e=>e.id));for(;a.has(r);)r=`${n}-${i}`,i+=1;return r}function Z(e){return String(e||``).trim()}function Q(e){return String(e||``).trim()}function $(e){return a(String(e||``)).replace(/"/g,`&quot;`)}function ce(e){return String(e||``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}