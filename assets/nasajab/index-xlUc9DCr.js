import{F as e,G as t,S as n,V as r,a as i,h as a,k as o,r as s,ut as c,v as l,y as u}from"../pb-C-i25jnJ.js";import"../site-DPUBR1zg.js";var d=5,f=new Set([`image/jpeg`,`image/png`,`image/gif`,`image/webp`]),p=r(),ee=new URLSearchParams(window.location.search).has(`demo`),m=[],h=1,g=X(),_=``,v=null,y=``,b=document.getElementById(`nasajabFeatured`),x=document.getElementById(`nasajabArchive`),S=document.getElementById(`nasajabPagination`),te=document.getElementById(`nasajabOwnerPanel`),ne=document.getElementById(`nasajabOwnerHead`),C=document.getElementById(`nasajabOwnerStatus`),w=document.getElementById(`nasajabForm`),T=document.getElementById(`nasajabFormTitle`),re=document.getElementById(`newNasajabButton`),ie=document.getElementById(`cancelNasajabEdit`),E={image:document.getElementById(`nasajabImage`),pasteBox:document.getElementById(`nasajabPasteBox`),clipboardButton:document.getElementById(`nasajabClipboardButton`),clearImage:document.getElementById(`nasajabClearImage`),imagePreview:document.getElementById(`nasajabImagePreview`),memo:document.getElementById(`nasajabMemo`),sourceUrl:document.getElementById(`nasajabSourceUrl`),displayAt:document.getElementById(`nasajabDisplayAt`),isPublic:document.getElementById(`nasajabIsPublic`)};p&&(te.hidden=!1,ne.hidden=!1,Y(`OWNER MODE: 사진 하나만 올려도 위쪽에 바로 뜸.`)),re?.addEventListener(`click`,()=>{N({hidden:!1}),w.scrollIntoView({block:`start`}),E.pasteBox?.focus()}),ie?.addEventListener(`click`,()=>N({hidden:!0})),w?.addEventListener(`submit`,async e=>{e.preventDefault(),await ce()}),E.image?.addEventListener(`change`,()=>{v=null;let e=E.image.files?.[0];if(e){if(!L(e)){G({silent:!0}),Y(`JPG, PNG, GIF, WebP 이미지만 올릴 수 있음.`,`error`);return}H(e,`파일 선택됨`),Y(`${e.name||`이미지`} 선택 완료. 저장하면 이 이미지로 올라감.`);return}G({silent:!0})}),E.pasteBox?.addEventListener(`paste`,async e=>{e.preventDefault(),e.stopPropagation();let t=ue(e.clipboardData),n=de(e.clipboardData);if(E.pasteBox.value=``,t.length){B(t[0],t.length>1?`붙여넣기: 첫 번째 이미지만 사용`:`붙여넣기 이미지`);return}if(n){z(n);return}Y(`클립보드에서 이미지 파일을 못 찾았음. 이미지에서 "이미지 복사"를 한 뒤 다시 붙여넣어봐.`,`error`)}),E.pasteBox?.addEventListener(`input`,()=>{E.pasteBox.value=``}),E.clipboardButton?.addEventListener(`click`,async()=>{await V()}),E.clearImage?.addEventListener(`click`,()=>{G()}),x?.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-nasajab-action]`);if(t){let e=t.getAttribute(`data-nasajab-id`),n=t.getAttribute(`data-nasajab-action`);n===`edit`&&await j(e),n===`delete`&&await M(e);return}let n=e.target.closest(`[data-nasajab-pick]`);n&&(e.preventDefault(),g=n.getAttribute(`data-nasajab-pick`)||``,g?window.location.hash=g:history.replaceState(null,``,window.location.pathname+window.location.search),O(),b.scrollIntoView({block:`start`}))}),b?.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-nasajab-action]`);if(t){let e=t.getAttribute(`data-nasajab-id`),n=t.getAttribute(`data-nasajab-action`);n===`edit`&&await j(e),n===`delete`&&await M(e);return}}),S?.addEventListener(`click`,e=>{let t=e.target.closest(`[data-nasajab-page]`);if(!t)return;e.preventDefault();let n=Number.parseInt(t.getAttribute(`data-nasajab-page`)||`1`,10);Number.isFinite(n)&&(h=n,k())}),window.addEventListener(`hashchange`,()=>{g=X(),O()}),D();async function D(){if(b.innerHTML=`<p>나사잡 불러오는 중...</p>`,x.innerHTML=`<tr><td colspan="5">아카이브 불러오는 중...</td></tr>`,ee){m=he(),Y(`DEMO MODE: 실제 CMS 저장 없이 화면만 보는 중.`),O();return}try{m=p?await n():await e(),O()}catch(e){se(e)}}function O(){if(!m.length){A();return}let e=m[0],t=g?m.find(e=>e.id===g):null;ae(t||e,!!t),k()}function ae(e,n=!1){let r=n?`ARCHIVE PICK`:`TODAY'S 나사잡`,i=I(e),a=F(e),o=Z(t(e)),s=e.source_url?`<p class="nasajab-source">source: <a href="${$(e.source_url)}" target="_blank" rel="noopener">${l(pe(e.source_url))}</a></p>`:``,c=p?P(e):``;b.innerHTML=`
        <table border="1" cellspacing="0" cellpadding="6" width="100%" class="nasajab-today-table nasajab-today-table--stacked">
            <tr bgcolor="#f0f0f0">
                <th colspan="2" align="center">${r}</th>
            </tr>
            <tr>
                <td class="nasajab-featured-image-cell">
                    ${i?`<img src="${$(i)}" alt="${$(a)}">`:`<div class="nasajab-missing-image">이미지 없음</div>`}
                </td>
                <td class="nasajab-featured-text-cell">
                    <div class="nasajab-featured-memo">${me(a)}</div>
                    ${s}
                    <p class="nasajab-featured-date">${l(o)}</p>
                    ${c}
                </td>
            </tr>
        </table>
    `}function k(){let e=m,n=p?5:4;if(!e.length){x.innerHTML=`
            <tr>
                <td colspan="${n}">
                    아직 아래에 쌓인 것이 없습니다.
                    ${p?`새 나사잡을 하나 더 올리면 아카이브가 생김.`:`곧 뭔가 잡힐 예정.`}
                </td>
            </tr>
        `,S.innerHTML=``;return}let r=Math.max(1,Math.ceil(e.length/d));h=Math.min(Math.max(h,1),r);let i=(h-1)*d;x.innerHTML=e.slice(i,i+d).map((n,r)=>{let a=e.length-i-r,o=I(n),s=F(n),c=g===n.id,d=p?`<td class="nasajab-owner-cell">${P(n)}</td>`:``;return`
            <tr class="${c?`nasajab-archive-row--selected`:``}">
                <td align="center" class="nasajab-no-cell">${a}</td>
                <td align="center" class="nasajab-thumb-cell">
                    <a href="#${$(n.id)}" data-nasajab-pick="${$(n.id)}">
                        ${o?`<img src="${$(o)}" alt="${$(s)} thumbnail">`:`<span class="note">no img</span>`}
                    </a>
                </td>
                <td>
                    <a href="#${$(n.id)}" data-nasajab-pick="${$(n.id)}">${l(s)}</a>
                    ${n.is_public===!1?` <small class="note">[비공개]</small>`:``}
                    ${c?` <small class="note">[NOW]</small>`:``}
                    <small class="nasajab-mobile-date">${l(u(t(n)))}</small>
                </td>
                <td align="center" class="nasajab-archive-date">${l(u(t(n)))}</td>
                ${d}
            </tr>
        `}).join(``),oe(r)}function oe(e){if(e<=1){S.innerHTML=``;return}let t=[];for(let n=1;n<=e;n+=1)t.push(n===h?`<b>${n}</b>`:`<a href="#" data-nasajab-page="${n}">${n}</a>`);S.innerHTML=`[ ${t.join(` `)} ]`}function A(){let e=p?5:4;b.innerHTML=`
        <table border="1" cellspacing="0" cellpadding="6" width="100%" class="nasajab-today-table">
            <tr bgcolor="#f0f0f0">
                <th align="center">TODAY'S 나사잡</th>
            </tr>
            <tr>
                <td>
                    아직 나를 사로 잡은 것이 올라오지 않았습니다.
                    ${p?`OWNER MODE에서 첫 이미지를 올려보면 됨.`:`언젠가 갑자기 생김.`}
                </td>
            </tr>
        </table>
    `,x.innerHTML=`<tr><td colspan="${e}">아카이브도 아직 비어 있음.</td></tr>`,S.innerHTML=``}function se(e){let t=s(e),n=e?.status===404?`PocketBase에 nasajab 컬렉션을 먼저 반영해야 합니다.`:t,r=p?5:4;b.innerHTML=`
        <table border="1" cellspacing="0" cellpadding="6" width="100%" class="nasajab-today-table">
            <tr bgcolor="#f0f0f0"><th align="center">TODAY'S 나사잡</th></tr>
            <tr><td>${l(n)}</td></tr>
        </table>
    `,x.innerHTML=`<tr><td colspan="${r}">${l(t)}</td></tr>`,S.innerHTML=``,Y(`CMS 확인 필요: ${n}`,`error`)}async function ce(){if(!p)return;let e=E.image.files.length>0,t=!!v;if(!_&&!(e||t)){Y(`이미지 하나는 꼭 있어야 함. 파일을 고르거나 복사한 이미지를 붙여넣으면 됨.`,`error`);return}let n=new FormData(w);n.set(`is_public`,E.isPublic.checked?`true`:`false`),t?n.set(`image`,v):e||n.delete(`image`),J(n,`memo`),J(n,`source_url`),E.displayAt.value?n.set(`display_at`,new Date(E.displayAt.value).toISOString()):n.delete(`display_at`),Y(_?`나사잡 수정 중...`:`나사잡 저장 중...`);try{let e=_?await c(_,n):await i(n);Y(`${F(e)} 저장 완료.`,`success`),N({hidden:!0}),g=e.id,window.location.hash=e.id,await D()}catch(e){Y(`저장 실패: ${s(e)}`,`error`)}}async function j(e){if(!p||!e)return;let n=m.find(t=>t.id===e);n&&(_=n.id,w.hidden=!1,T.textContent=`✎ 나사잡 수정: ${F(n)}`,v=null,E.image.value=``,E.pasteBox.value=``,E.memo.value=n.memo||``,E.sourceUrl.value=n.source_url||``,E.displayAt.value=Q(t(n)),E.isPublic.checked=n.is_public!==!1,U(n),Y(`수정 모드. 새 이미지를 고르면 기존 이미지가 바뀜.`),w.scrollIntoView({block:`start`}),E.memo.focus())}async function M(e){if(!p||!e)return;let t=F(m.find(t=>t.id===e));if(confirm(`${t}을 삭제할까?\n이 작업은 되돌릴 수 없습니다.`))try{await a(e),g===e&&(g=``,history.replaceState(null,``,window.location.pathname+window.location.search)),Y(`${t} 삭제 완료.`,`success`),await D()}catch(e){Y(`삭제 실패: ${s(e)}`,`error`)}}function N(e={}){w&&(_=``,w.reset(),G({silent:!0,hidePreview:!0}),T.textContent=`✚ 새 나사잡 올리기`,E.displayAt.value=Q(new Date().toISOString()),E.isPublic.checked=!0,w.hidden=e.hidden??!0)}function P(e){return`
        <span class="nasajab-owner-actions">
            <button type="button" class="owner-btn" data-nasajab-action="edit" data-nasajab-id="${$(e.id)}">수정</button>
            <button type="button" class="owner-btn owner-btn-danger" data-nasajab-action="delete" data-nasajab-id="${$(e.id)}">삭제</button>
        </span>
    `}function F(e){let t=String(e?.memo||``).replace(/\s+/g,` `).trim();return t?t.length>80?`${t.slice(0,80).trim()}...`:t:`메모 없이 잡힌 것`}function I(e){return e?.demo_image_url||o(e)}function L(e){return e&&f.has(e.type)}function le(e){return e?Array.from(e.items||[]).some(e=>e.type?.startsWith(`image/`))||Array.from(e.files||[]).some(e=>e.type?.startsWith(`image/`)):!1}function ue(e){if(!le(e))return[];let t=Array.from(e.files||[]),n=Array.from(e.items||[]).filter(e=>e.kind===`file`&&e.type?.startsWith(`image/`)).map(e=>e.getAsFile()).filter(Boolean);return[...t,...n].filter((e,t,n)=>L(e)?n.findIndex(t=>t.name===e.name&&t.size===e.size&&t.lastModified===e.lastModified)===t:!1).map((e,t)=>R(e,t))}function R(e,t){if(e.name&&/\.[a-z0-9]+$/i.test(e.name))return e;let n={"image/jpeg":`jpg`,"image/png":`png`,"image/gif":`gif`,"image/webp":`webp`}[e.type]||`png`;return new File([e],`nasajab-image-${Date.now()}-${t+1}.${n}`,{type:e.type})}function de(e){return e&&[e.getData(`text/uri-list`),e.getData(`text/plain`)].map(e=>String(e||``).split(/\r?\n/).find(e=>/^https?:\/\//i.test(e.trim()))||``).map(e=>e.trim()).find(Boolean)||``}function z(e){if(!E.sourceUrl.value.trim()){E.sourceUrl.value=e,Y(`클립보드에는 이미지 파일 대신 URL만 있어서 출처 링크에 넣었음. 이미지는 파일 선택이나 이미지 복사로 다시 넣어줘.`,`error`);return}Y(`클립보드에는 이미지 파일 대신 URL만 있었음. 기존 출처 링크는 그대로 뒀어.`,`error`)}function B(e,t=`붙여넣기 이미지`){v=R(e,0),E.image.value=``,E.pasteBox.value=``,H(v,t),Y(`${v.name} 붙여넣기 완료. 저장하면 이 이미지로 올라감.`,`success`)}async function V(){if(!navigator.clipboard?.read){Y(`이 브라우저는 클립보드 직접 읽기를 지원하지 않음. 붙여넣기 박스에 직접 붙여넣어줘.`,`error`);return}try{let e=await navigator.clipboard.read(),t=[],n=``;for(let r of e){let e=r.types.find(e=>f.has(e));if(e){let n=await r.getType(e);t.push(R(new File([n],``,{type:n.type||e}),t.length));continue}let i=r.types.find(e=>e===`text/uri-list`||e===`text/plain`);i&&!n&&(n=(await(await r.getType(i)).text()).split(/\r?\n/).find(e=>/^https?:\/\//i.test(e.trim()))?.trim()||``)}if(t.length){B(t[0],t.length>1?`클립보드: 첫 번째 이미지만 사용`:`클립보드 이미지`);return}if(n){z(n);return}Y(`클립보드에 읽을 수 있는 이미지가 없음.`,`error`)}catch(e){Y(`클립보드 읽기 실패: ${s(e)}`,`error`)}}function H(e,t){q(),y=URL.createObjectURL(e),W({url:y,label:t,detail:`${e.name||`image`} · ${fe(e.size)}`,canClear:!0})}function U(e){q();let t=I(e);if(!t){K();return}W({url:t,label:`현재 저장된 이미지`,detail:`새 파일을 고르거나 붙여넣으면 교체됨.`,canClear:!1})}function W({url:e,label:t,detail:n,canClear:r}){E.imagePreview&&(E.imagePreview.innerHTML=`
        <img src="${$(e)}" alt="${$(t)} preview">
        <span>
            <b>${l(t)}</b><br>
            <small>${l(n)}</small>
        </span>
    `,E.imagePreview.hidden=!1,E.clearImage.hidden=!r)}function G(e={}){if(v=null,E.image.value=``,E.pasteBox.value=``,q(),e.hidePreview)K();else if(_){let e=m.find(e=>e.id===_);e&&U(e)}else K();e.silent||Y(_?`새 이미지 선택 취소. 저장하면 기존 이미지 유지.`:`이미지 선택이 비워졌음.`)}function K(){E.imagePreview&&(E.imagePreview.innerHTML=``,E.imagePreview.hidden=!0),E.clearImage&&(E.clearImage.hidden=!0)}function q(){y&&=(URL.revokeObjectURL(y),``)}function fe(e){let t=Number(e||0);return!Number.isFinite(t)||t<=0?`크기 알 수 없음`:t<1024?`${t}B`:t<1024*1024?`${Math.round(t/1024)}KB`:`${(t/1024/1024).toFixed(1)}MB`}function J(e,t){let n=String(e.get(t)||``).trim();n?e.set(t,n):e.delete(t)}function Y(e,t=`info`){C&&(C.textContent=e||``,C.className=`nasajab-owner-status nasajab-owner-status--${t}`)}function X(){return decodeURIComponent(window.location.hash.replace(/^#/,``)).trim()}function Z(e){if(!e)return``;let t=new Date(e);return Number.isNaN(t.getTime())?String(e):`${t.toLocaleDateString(`ko-KR`,{year:`numeric`,month:`2-digit`,day:`2-digit`})} ${t.toLocaleTimeString(`ko-KR`,{hour:`2-digit`,minute:`2-digit`,second:`2-digit`})}`}function Q(e){let t=e?new Date(e):new Date;if(Number.isNaN(t.getTime()))return``;let n=t.getTimezoneOffset()*60*1e3;return new Date(t.getTime()-n).toISOString().slice(0,16)}function pe(e){try{let t=new URL(e);return t.hostname.replace(/^www\./,``)+t.pathname.replace(/\/$/,``)}catch{return e}}function me(e){return l(e).replace(/\r?\n/g,`<br>`)}function $(e){return String(e||``).replace(/&/g,`&amp;`).replace(/"/g,`&quot;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function he(){return[[`demo-sky`,`퇴근길, 하늘이 오늘따라 멋졌다.`,`1999-05-20T19:15:27+09:00`,`#d4b4ff`,`#3c286e`],[`demo-cassette`,`오래된 카세트 테이프. 갑자기 이런 질감이 좋아져서.`,`1999-05-18T23:41:02+09:00`,`#e8e8e8`,`#111111`],[`demo-game`,`재미있던 8비트 게임. 쓸데없이 진지해서 웃겼음.`,`1999-05-15T16:20:33+09:00`,`#b7f7c1`,`#1f5c2a`],[`demo-coffee`,`좋은 음악과 커피 한 잔. 별것 아닌데 오래 봄.`,`1999-05-12T10:05:11+09:00`,`#d8b08c`,`#3d2415`],[`demo-sentence`,`마음에 남는 문장 하나. 지피띠니가 이상하게 정확한 말을 함.`,`1999-05-10T22:18:44+09:00`,`#fff6c9`,`#533c00`],[`demo-flower`,`길가에 핀 작은 꽃. 작은데 너무 뻔뻔하게 예뻤다.`,`1999-05-08T13:07:59+09:00`,`#c9f2c7`,`#195a1f`]].map(([e,t,n,r,i],a)=>({id:e,memo:t,display_at:n,created:n,is_public:!0,demo_image_url:ge(t,r,i,a)}))}function ge(e,t,n,r){let i=e.split(/[.!?]/)[0].trim().slice(0,18)||`나사잡`,a=`
        <svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
            <rect width="480" height="270" fill="${t}"/>
            ${[`<circle cx="260" cy="110" r="52" fill="white" opacity="0.6"/>`,`<rect x="80" y="70" width="260" height="120" fill="white" opacity="0.5"/>`,`<path d="M30 180 C120 60 240 240 370 80" fill="none" stroke="white" stroke-width="18" opacity="0.5"/>`,`<circle cx="90" cy="80" r="28" fill="white" opacity="0.55"/><circle cx="310" cy="160" r="40" fill="white" opacity="0.35"/>`][r%4]}
            <rect x="20" y="20" width="440" height="230" fill="none" stroke="${n}" stroke-width="4"/>
            <text x="240" y="145" text-anchor="middle" font-family="monospace" font-size="22" fill="${n}">${_e(i)}</text>
        </svg>
    `;return`data:image/svg+xml;charset=utf-8,${encodeURIComponent(a)}`}function _e(e){return String(e||``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}