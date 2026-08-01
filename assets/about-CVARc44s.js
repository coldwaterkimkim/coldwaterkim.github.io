const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/markdown-editor-DoRIGAVz.js","assets/markdown-editor-Cnhp8yri.js","assets/rolldown-runtime-BHe-jwch.js","assets/media-embeds-h4FUltIX.js","assets/preload-helper-CZgWQFsJ.js","assets/comments-Ba2Wllyo.js","assets/FloatingThreadController-BZkNOp17-BumRprfp.js","assets/markdown-editor-0dMTmUGQ.css"])))=>i.map(i=>d[i]);
import{A as e,G as t,H as n,gt as r,lt as i,r as a,v as o}from"./pb-BHHj1UwI.js";import{n as s,t as c}from"./site-39bwvyvF.js";import{r as l,t as u}from"./media-embeds-h4FUltIX.js";import{t as d}from"./preload-helper-CZgWQFsJ.js";function f(e,t,n){if(!Array.isArray(e))return!1;let r=Math.sign(Number(n)||0),i=e.findIndex(e=>e?.id===t),a=i+r;if(r===0||i<0||a<0||a>=e.length)return!1;let[o]=e.splice(i,1);return e.splice(a,0,o),!0}var p=`about_wiki_document`,m=new Set([`image/jpeg`,`image/png`,`image/gif`,`image/webp`]),h=null,g=null,_=null,v=null,y=null,b=null,x=null,S=null,C={title:`김찬수`,subtitle:``,profileTitle:`coldwaterkim`,profileImage:`assets/profile-crop.jpg`,profileSchemaVersion:2,profileRows:c(),sections:[{id:`overview`,title:`개요`,body:`대한민국의 밀레니엄 베이비. 개인 홈페이지 <b>coldwaterkim.com</b>의 주인장이다.<br><br>글방, 나으 하루, 프로그램실, 나사잡을 통해 생각·일상·만든 것·갑자기 사로잡힌 이미지를 계속 쌓고 있다. 모던한 포트폴리오보다는 직접 만든 홈페이지의 기척을 더 좋아하는 편.`},{id:`what-made`,title:`만든 것`,body:`<ul><li><b>글방</b>: 생각과 기록을 올리는 곳.</li><li><b>나으 하루</b>: 하루 단위로 남기는 생활 로그.</li><li><b>프로그램실</b>: 직접 만든 작은 프로그램과 실험작을 보관하는 자료실.</li><li><b>나사잡</b>: 나를 사로잡은 사진, 캡처, 장면을 한 장씩 수집하는 코너.</li></ul>`},{id:`history`,title:`연혁`,body:`<table><tr><th>시기</th><th>내용</th></tr><tr><td>2000</td><td>태어남. 당시 본인은 기억이 없다.</td></tr><tr><td>2025</td><td>개인 홈페이지를 진짜 운영물로 만들기 시작.</td></tr><tr><td>2026</td><td>홈페이지가 점점 위키, 블로그, 자료실, 방명록을 겸하는 무언가가 되어가는 중.</td></tr></table>`},{id:`taste`,title:`취향`,body:`90년대 개인 홈페이지, 기본 파란 링크, 마퀴, 방문자 카운터, 수상하게 진심인 테이블 UI를 좋아한다. 너무 매끈한 포트폴리오보다 약간 삐걱대지만 실제로 운영되는 웹을 더 신뢰한다.`},{id:`contact`,title:`연락처`,body:`메일은 <a href="mailto:ckstn1112@gmail.com?subject=Hello%20from%20your%20site">ckstn1112@gmail.com</a>으로 보내면 된다. 방명록에 한 줄 남기는 것도 환영.`},{id:`trivia`,title:`여담`,body:`이 문서는 나무위키처럼 보이지만 실제로는 본인이 직접 관리한다. 그래서 틀린 내용이 있다면 높은 확률로 본인이 미래의 본인에게 남긴 과제다.`}]},ee=new WeakMap;w(),R(),window.addEventListener(`coldwaterkim:content-ready`,w);function w(){document.querySelectorAll(`[data-about-wiki-root]`).forEach(e=>{if(e.dataset.aboutWikiReady===`true`)return;e.dataset.aboutWikiReady=`true`;let n={root:e,doc:J(),isOwner:t(),selectedSectionId:null,selectedProfileIndex:null,sectionEditor:null,pendingEditorImageIndex:null,saveTimer:null,saveQueue:Promise.resolve(),saveVersion:0,hasUnsavedChanges:!1};ee.set(e,n),te(n)})}async function te(e){T(e);try{let t=ne(await n(p));t&&(e.doc=t,T(e))}catch(t){z(e,`CMS 설정을 불러오지 못했음: ${a(t)}`,`error`)}}function ne(e){if(!e)return null;try{return re(JSON.parse(e))}catch(e){return console.warn(`About wiki document parse failed:`,e),null}}function re(e){let t=J();return!e||typeof e!=`object`?t:(t.title=Z(e.title)||t.title,t.subtitle=Z(e.subtitle)||t.subtitle,t.profileTitle=Z(e.profileTitle)||t.profileTitle,t.profileImage=Z(e.profileImage)||t.profileImage,t.profileSchemaVersion=2,Array.isArray(e.profileRows)&&(t.profileRows=s(e.profileRows,{mergeDefaults:Number(e.profileSchemaVersion||0)<2})),Array.isArray(e.sections)&&(t.sections=e.sections.map((e,t)=>({id:Y(e?.id,e?.title,t),title:Z(e?.title)||`새 섹션 ${t+1}`,body:Q(e?.body)})).filter(e=>e.title||e.body)),t.sections.length===0&&(t.sections=J().sections),t)}function T(e){let{root:t,doc:n,isOwner:r}=e;e.sectionEditor=null,e.pendingEditorImageIndex=null,t.innerHTML=`
    ${r?E(e):``}
    <div class="about-wiki-head">
      <h1>${o(n.title)}</h1>
    </div>
    <div class="about-wiki-status" data-about-status hidden></div>
    <div class="about-profile-block">
      ${D(n,r)}
      ${O(n.sections,r)}
    </div>
    <div class="about-wiki-body">
      ${k(n.sections,r)}
    </div>
    ${r?ae(e):``}
  `,ie(e),le(e),oe(e)}function E(e){let t=K(e);return`
    <div class="owner-bar about-owner-bar">
      <b>OWNER MODE</b> ·
      <button type="button" class="owner-btn" data-about-action="add-section">섹션 추가</button>
      <button type="button" class="owner-btn" data-about-action="edit-profile">프로필 표 수정</button>
      <button type="button" class="owner-btn" data-about-action="reset-selection">편집 닫기</button>
      <span class="note">${t?`"${o(t.title)}" 편집 중`:`섹션 제목에서 [편집] 누르면 바로 고침`}</span>
    </div>
  `}function D(e,t){let n=e.profileRows.map((e,n)=>`
    <tr>
      <th>${o(e.label||``)}</th>
      <td>
        <span data-about-profile-value-index="${n}"></span>
        ${t?`<button type="button" class="about-edit-link" data-about-action="edit-profile-row" data-profile-index="${n}">[편집]</button>`:``}
      </td>
    </tr>
  `).join(``);return`
    <table class="about-infobox" border="1" cellspacing="0" cellpadding="5" align="right">
      <tr>
        <th colspan="2" class="about-infobox-title">${o(e.profileTitle)}</th>
      </tr>
      <tr>
        <td colspan="2" class="about-infobox-photo">
          <img src="${$(e.profileImage)}" alt="${$(e.profileTitle)} profile">
        </td>
      </tr>
      ${n}
    </table>
  `}function O(e,t){return`
    <table class="about-toc" border="1" cellspacing="0" cellpadding="6">
      <tr bgcolor="#f0f0f0">
        <th>목차</th>
      </tr>
      <tr>
        <td>
          <ol>${e.map(e=>`
    <li>
      <a href="#about-section-${$(e.id)}">${o(e.title)}</a>
      ${t?`<button type="button" class="about-edit-link" data-about-action="edit-section" data-section-id="${$(e.id)}">[편집]</button>`:``}
    </li>
  `).join(``)}</ol>
        </td>
      </tr>
    </table>
  `}function k(e,t){return e.map((n,r)=>`
    <div class="about-section" id="about-section-${$(n.id)}" data-section-id="${$(n.id)}">
      <h2>
        <span>${r+1}. ${o(n.title)}</span>
        ${t?`
          <span class="about-section-tools">
            <button type="button" class="about-order-btn" data-about-action="move-section" data-section-id="${$(n.id)}" data-direction="-1" title="위로 이동" aria-label="${$(n.title)} 위로 이동" ${r<=0?`disabled`:``}>↑</button>
            <button type="button" class="about-order-btn" data-about-action="move-section" data-section-id="${$(n.id)}" data-direction="1" title="아래로 이동" aria-label="${$(n.title)} 아래로 이동" ${r>=e.length-1?`disabled`:``}>↓</button>
            <button type="button" class="about-edit-link" data-about-action="edit-section" data-section-id="${$(n.id)}">[편집]</button>
          </span>
        `:``}
      </h2>
      <div class="about-section-body post-content" data-about-section-body-index="${r}"></div>
    </div>
  `).join(``)}function ie(e){e.root.querySelectorAll(`[data-about-profile-value-index]`).forEach(t=>{let n=Number(t.getAttribute(`data-about-profile-value-index`));t.innerHTML=l(e.doc.profileRows[n]?.value||``)}),e.root.querySelectorAll(`[data-about-section-body-index]`).forEach(t=>{let n=Number(t.getAttribute(`data-about-section-body-index`));t.innerHTML=l(e.doc.sections[n]?.body||`<p></p>`)}),u(e.root)}function ae(e){let t=K(e),n=e.selectedProfileIndex,r=Number.isInteger(n)?e.doc.profileRows[n]:null;if(r)return`
      <form class="about-editor" data-about-editor="profile" data-version-refresh-block="${e.hasUnsavedChanges}">
        <b>프로필 표 row 편집</b>
        <table border="1" cellspacing="0" cellpadding="5" width="100%">
          <tr>
            <th width="120">라벨</th>
            <td><input type="text" name="label" value="${$(r.label)}"></td>
          </tr>
          <tr>
            <th>값</th>
            <td><textarea name="value" rows="4">${he(r.value)}</textarea></td>
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
    <form class="about-editor" data-about-editor="section" data-version-refresh-block="${e.hasUnsavedChanges}">
      <b>섹션 편집: ${o(t.title)}</b>
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
  `}async function oe(e){if(!e.isOwner)return;await se();let t=K(e),n=e.root.querySelector(`[data-about-markdown-editor]`),r=e.root.querySelector(`[data-about-editor="section"]`),i=e.root.querySelector(`[data-about-image-input]`);if(!t||!n||!r||!i)return;let o=t.id,s=!1;try{let a=await g(n,{height:`320px`,minHeight:`240px`,placeholder:`Markdown으로 섹션 본문 쓰기...`,onImageButton:()=>{e.pendingEditorImageIndex=U(e),i.click()},uploadFile:t=>me(e,t),onChange:()=>{s&&L(e)}});if(!n.isConnected||e.selectedSectionId!==o)return;await a.ready(),e.sectionEditor=a,a.root.innerHTML=t.body||``,s=!0,ce(e,r,i,a)}catch(t){z(e,`편집기 로드 실패: ${a(t)}`,`error`)}}async function se(){h||=d(()=>import(`./markdown-editor-DoRIGAVz.js`),__vite__mapDeps([0,1,2,3,4,5,6,7]));let e=await h;g=e.createMarkdownEditor,_=e.editorUploadLabel,v=e.hasImageTransfer,y=e.imageFilesFromTransfer,b=e.isSupportedEditorUpload,x=e.normalizeEditorImageFiles,S=e.stopEditorTransferEvent}function ce(e,t,n,r){let i=t.querySelector(`[data-about-editor-container]`);i&&(n.addEventListener(`change`,async()=>{await W(e,n.files,{index:e.pendingEditorImageIndex}),e.pendingEditorImageIndex=null,n.value=``}),i.addEventListener(`dragenter`,e=>{v(e.dataTransfer)&&(e.preventDefault(),i.classList.add(`is-image-dragover`))}),i.addEventListener(`dragover`,e=>{v(e.dataTransfer)&&(e.preventDefault(),i.classList.add(`is-image-dragover`))}),i.addEventListener(`dragleave`,e=>{e.relatedTarget instanceof Node&&i.contains(e.relatedTarget)||i.classList.remove(`is-image-dragover`)}),i.addEventListener(`drop`,async t=>{v(t.dataTransfer)&&(S(t),i.classList.remove(`is-image-dragover`),await W(e,V(t.dataTransfer),{index:U(e)}))},!0),r.root.addEventListener(`paste`,async t=>{v(t.clipboardData)&&(S(t),await W(e,V(t.clipboardData),{index:U(e)}))},!0))}function le(e){e.isOwner&&(e.eventsBound||(e.eventsBound=!0,e.root.addEventListener(`click`,t=>{let n=t.target.closest(`[data-about-action]`);if(!n||!e.root.contains(n))return;let r=n.dataset.aboutAction;r===`edit-section`&&(e.selectedProfileIndex=null,e.selectedSectionId=n.dataset.sectionId||null,T(e),q(e)),r===`add-section`&&ue(e),r===`delete-section`&&de(e),r===`move-section`&&fe(e,n.dataset.sectionId||e.selectedSectionId,Number(n.dataset.direction||0)),r===`edit-profile`&&M(e),r===`add-profile-row`&&j(e),r===`edit-profile-row`&&(e.selectedSectionId=null,e.selectedProfileIndex=Number(n.dataset.profileIndex),T(e),q(e)),r===`delete-profile-row`&&N(e),r===`reset-selection`&&(e.selectedSectionId=null,e.selectedProfileIndex=null,T(e))}),e.root.addEventListener(`input`,t=>{t.target.closest(`[data-about-editor]`)&&L(e)}),e.root.addEventListener(`submit`,t=>{let n=t.target.closest(`[data-about-editor]`);!n||!e.root.contains(n)||(t.preventDefault(),n.dataset.aboutEditor===`section`&&A(e,n),n.dataset.aboutEditor===`profile`&&P(e,n))})))}function ue(e){let t=X(e.doc.sections,`new-section`),n={id:t,title:`새 섹션`,body:`여기에 내용을 적으면 목차에 자동으로 추가됨.`};e.doc.sections.push(n),e.selectedSectionId=t,e.selectedProfileIndex=null,F(e,`섹션 추가됨`)}function de(e){let t=K(e);t&&window.confirm(`"${t.title}" 섹션을 삭제할까?`)&&(e.doc.sections=e.doc.sections.filter(e=>e.id!==t.id),e.selectedSectionId=null,F(e,`섹션 삭제됨`))}function fe(e,t,n){I(e),f(e.doc.sections,t,n)&&F(e,`순서 변경됨`)}function A(e,t){let n=K(e);if(!n)return;let r=Z(new FormData(t).get(`title`))||`제목 없음`;n.title=r,n.body=Q(B(e,n.body)),n.id=X(e.doc.sections.filter(e=>e!==n),Y(n.id,r)),e.selectedSectionId=n.id,F(e,`섹션 저장됨`)}function j(e){e.doc.profileRows.push({label:`새 항목`,value:`내용`}),e.selectedSectionId=null,e.selectedProfileIndex=e.doc.profileRows.length-1,F(e,`프로필 row 추가됨`)}function M(e){if(e.doc.profileRows.length===0){j(e);return}e.selectedSectionId=null,e.selectedProfileIndex=0,T(e),q(e)}function N(e){Number.isInteger(e.selectedProfileIndex)&&(e.doc.profileRows.splice(e.selectedProfileIndex,1),e.selectedProfileIndex=null,F(e,`프로필 row 삭제됨`))}function P(e,t){let n=e.selectedProfileIndex;if(!Number.isInteger(n)||!e.doc.profileRows[n])return;let r=new FormData(t);e.doc.profileRows[n]={label:Z(r.get(`label`))||`항목`,value:Q(r.get(`value`))},F(e,`프로필 row 저장됨`)}async function F(e,t){e.hasUnsavedChanges=!0;let n=++e.saveVersion;e.doc.profileSchemaVersion=2;let r=JSON.stringify(e.doc);return T(e),z(e,`저장 중...`,`pending`),e.saveQueue=e.saveQueue.catch(()=>{}).then(async()=>{try{if(await i(p,r),n!==e.saveVersion)return;L(e,!1),window.dispatchEvent(new CustomEvent(`coldwaterkim:profile-data-updated`,{detail:{document:e.doc}})),z(e,t||`저장됨`,`success`)}catch(t){if(n!==e.saveVersion)return;L(e,!0),z(e,`저장 실패: ${a(t)}`,`error`)}}),e.saveQueue}function I(e){let t=K(e),n=e.root.querySelector(`[data-about-editor="section"]`);!t||!n||(t.title=Z(new FormData(n).get(`title`))||t.title,t.body=Q(B(e,t.body)))}function L(e,t=!0){e.hasUnsavedChanges=t;let n=e.root.querySelector(`[data-about-editor]`);n&&(n.dataset.versionRefreshBlock=String(t))}function R(){window.__coldwaterkimAboutUnloadGuard||(window.__coldwaterkimAboutUnloadGuard=!0,window.addEventListener(`beforeunload`,e=>{document.querySelector(`[data-version-refresh-block="true"]`)&&(e.preventDefault(),e.returnValue=``)}))}function z(e,t,n=`success`){let r=e.root.querySelector(`[data-about-status]`);r&&(r.hidden=!1,r.textContent=t,r.className=`about-wiki-status about-wiki-status--${n}`,n===`success`&&(window.clearTimeout(e.saveTimer),e.saveTimer=window.setTimeout(()=>{let t=e.root.querySelector(`[data-about-status]`);t&&(t.hidden=!0)},1600)))}function B(e,t=``){let n=e.sectionEditor?.root?.innerHTML?.trim();return n===`<p><br></p>`?``:typeof n==`string`?n:t}function V(e){return y(e,{mimeTypes:m,fallbackNamePrefix:`about-section-image`})}function pe(e){return e&&m.has(e.type)}function H(e,t){return e.sectionEditor?.clampIndex(t)||0}function U(e){let t=e.sectionEditor?.getSelection?.();return H(e,t?.index)}async function W(t,n,i={}){let o=t.sectionEditor;if(!o)return;let s=x(n,{mimeTypes:m,fallbackNamePrefix:`about-section-image`}).filter(pe);if(!s.length){G(t,`JPG, PNG, GIF, WebP 이미지만 본문에 넣을 수 있어.`,`error`);return}let c=t.root.querySelector(`[data-about-editor-container]`),l=H(t,i.index),u=[];c?.classList.add(`is-image-uploading`);for(let n=0;n<s.length;n+=1){let i=s[n];G(t,`이미지 업로드 중... (${n+1}/${s.length}) ${i.name}`,`info`);try{let t=await r(i,i.name,`About wiki`),n=e(t,t.file);u.push({url:n,alt:i.name})}catch(e){G(t,`본문 이미지 업로드 실패 (${i.name}): ${a(e)}`,`error`)}}c?.classList.remove(`is-image-uploading`),u.length>0&&(l=o.insertImages(l,u),o.setSelection(l,0,`silent`),G(t,`${u.length}개 이미지가 본문에 들어갔습니다.`,`success`),setTimeout(()=>G(t),2500))}async function me(t,n){if(!b?.(n))throw Error(`JPG, PNG, GIF, WebP, MP4, WebM, MOV, M4V, MP3, PDF만 본문에 넣을 수 있어.`);let i=_?.(n)||`파일`;G(t,`${i} 업로드 중... ${n.name||``}`,`info`);try{let a=await r(n,n.name,`About wiki media`),o=e(a,a.file);return G(t,`${i} 업로드 완료.`,`success`),setTimeout(()=>G(t),1800),o}catch(e){throw G(t,`${i} 업로드 실패: ${a(e)}`,`error`),e}}function G(e,t=``,n=`info`){let r=e.root.querySelector(`[data-about-image-status]`);r&&(r.textContent=t,r.className=`about-editor-image-status about-editor-image-status--${n}`,r.classList.toggle(`is-visible`,!!t))}function K(e){return e.doc.sections.find(t=>t.id===e.selectedSectionId)||null}function q(e){requestAnimationFrame(()=>{e.root.querySelector(`.about-editor`)?.scrollIntoView({block:`nearest`,behavior:`smooth`})})}function J(){return JSON.parse(JSON.stringify(C))}function Y(e,t,n=0){return(Z(e)||Z(t)||`section-${n+1}`).normalize(`NFKD`).toLowerCase().replace(/[^a-z0-9가-힣]+/g,`-`).replace(/^-+|-+$/g,``)||`section-${n+1}`}function X(e,t){let n=Y(t,t),r=n,i=2,a=new Set(e.map(e=>e.id));for(;a.has(r);)r=`${n}-${i}`,i+=1;return r}function Z(e){return String(e||``).trim()}function Q(e){return String(e||``).trim()}function $(e){return o(String(e||``)).replace(/"/g,`&quot;`)}function he(e){return String(e||``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}