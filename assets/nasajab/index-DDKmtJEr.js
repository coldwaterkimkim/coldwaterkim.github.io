import{C as e,M as t,Y as n,b as r,f as i,k as a,n as o,p as s,r as c,s as l,u}from"../pb-CRPh0QTz.js";import"../site-XRIgoWjI.js";var d=5,f=a(),p=new URLSearchParams(window.location.search).has(`demo`),m=[],h=1,g=G(),_=``,v=document.getElementById(`nasajabFeatured`),y=document.getElementById(`nasajabArchive`),b=document.getElementById(`nasajabPagination`),x=document.getElementById(`nasajabOwnerPanel`),S=document.getElementById(`nasajabOwnerHead`),C=document.getElementById(`nasajabOwnerStatus`),w=document.getElementById(`nasajabForm`),T=document.getElementById(`nasajabFormTitle`),E=document.getElementById(`newNasajabButton`),D=document.getElementById(`cancelNasajabEdit`),O={image:document.getElementById(`nasajabImage`),memo:document.getElementById(`nasajabMemo`),sourceUrl:document.getElementById(`nasajabSourceUrl`),displayAt:document.getElementById(`nasajabDisplayAt`),isPublic:document.getElementById(`nasajabIsPublic`)};f&&(x.hidden=!1,S.hidden=!1,W(`OWNER MODE: 사진 하나만 올려도 위쪽에 바로 뜸.`)),E?.addEventListener(`click`,()=>{z({hidden:!1}),w.scrollIntoView({block:`start`}),O.image.focus()}),D?.addEventListener(`click`,()=>z({hidden:!0})),w?.addEventListener(`submit`,async e=>{e.preventDefault(),await I()}),y?.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-nasajab-action]`);if(t){let e=t.getAttribute(`data-nasajab-id`),n=t.getAttribute(`data-nasajab-action`);n===`edit`&&await L(e),n===`delete`&&await R(e);return}let n=e.target.closest(`[data-nasajab-pick]`);n&&(e.preventDefault(),g=n.getAttribute(`data-nasajab-pick`)||``,g?window.location.hash=g:history.replaceState(null,``,window.location.pathname+window.location.search),A(),v.scrollIntoView({block:`start`}))}),v?.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-nasajab-action]`);if(t){let e=t.getAttribute(`data-nasajab-id`),n=t.getAttribute(`data-nasajab-action`);n===`edit`&&await L(e),n===`delete`&&await R(e);return}e.target.closest(`[data-nasajab-latest]`)&&(e.preventDefault(),g=``,history.replaceState(null,``,window.location.pathname+window.location.search),A())}),b?.addEventListener(`click`,e=>{let t=e.target.closest(`[data-nasajab-page]`);if(!t)return;e.preventDefault();let n=Number.parseInt(t.getAttribute(`data-nasajab-page`)||`1`,10);Number.isFinite(n)&&(h=n,M())}),window.addEventListener(`hashchange`,()=>{g=G(),A()}),k();async function k(){if(v.innerHTML=`<p>나사잡 불러오는 중...</p>`,y.innerHTML=`<tr><td colspan="5">아카이브 불러오는 중...</td></tr>`,p){m=Z(),W(`DEMO MODE: 실제 CMS 저장 없이 화면만 보는 중.`),A();return}try{m=f?await s():await e(),A()}catch(e){F(e)}}function A(){if(!m.length){P();return}let e=m[0],t=g?m.find(e=>e.id===g):null;j(t||e,!!t),M()}function j(e,n=!1){let r=n?`ARCHIVE PICK`:`TODAY'S 나사잡`,i=H(e),a=V(e),o=K(t(e)),s=e.source_url?`<p class="nasajab-source">source: <a href="${X(e.source_url)}" target="_blank" rel="noopener">${u(J(e.source_url))}</a></p>`:``,c=n?`<p class="note"><a href="#" data-nasajab-latest="true">최신 나사잡으로 돌아가기</a></p>`:``,l=f?B(e):``;v.innerHTML=`
        <table border="1" cellspacing="0" cellpadding="6" width="100%" class="nasajab-today-table ${n?`nasajab-today-table--stacked`:``}">
            <tr bgcolor="#f0f0f0">
                <th colspan="2" align="center">${r}</th>
            </tr>
            <tr>
                <td class="nasajab-featured-image-cell">
                    ${i?`<img src="${X(i)}" alt="${X(a)}">`:`<div class="nasajab-missing-image">이미지 없음</div>`}
                </td>
                <td class="nasajab-featured-text-cell">
                    <div class="nasajab-featured-memo">${Y(a)}</div>
                    ${s}
                    <p class="nasajab-featured-date">${u(o)}</p>
                    ${c}
                    ${l}
                </td>
            </tr>
        </table>
    `}function M(){let e=m.slice(1),n=f?5:4;if(!e.length){y.innerHTML=`
            <tr>
                <td colspan="${n}">
                    아직 아래에 쌓인 것이 없습니다.
                    ${f?`새 나사잡을 하나 더 올리면 아카이브가 생김.`:`곧 뭔가 잡힐 예정.`}
                </td>
            </tr>
        `,b.innerHTML=``;return}let r=Math.max(1,Math.ceil(e.length/d));h=Math.min(Math.max(h,1),r);let a=(h-1)*d;y.innerHTML=e.slice(a,a+d).map((n,r)=>{let o=e.length-a-r,s=H(n),c=V(n),l=g===n.id,d=f?`<td class="nasajab-owner-cell">${B(n)}</td>`:``;return`
            <tr class="${l?`nasajab-archive-row--selected`:``}">
                <td align="center" class="nasajab-no-cell">${o}</td>
                <td align="center" class="nasajab-thumb-cell">
                    <a href="#${X(n.id)}" data-nasajab-pick="${X(n.id)}">
                        ${s?`<img src="${X(s)}" alt="${X(c)} thumbnail">`:`<span class="note">no img</span>`}
                    </a>
                </td>
                <td>
                    <a href="#${X(n.id)}" data-nasajab-pick="${X(n.id)}">${u(c)}</a>
                    ${n.is_public===!1?` <small class="note">[비공개]</small>`:``}
                    ${l?` <small class="note">[NOW]</small>`:``}
                    <small class="nasajab-mobile-date">${u(i(t(n)))}</small>
                </td>
                <td align="center" class="nasajab-archive-date">${u(i(t(n)))}</td>
                ${d}
            </tr>
        `}).join(``),N(r)}function N(e){if(e<=1){b.innerHTML=``;return}let t=[];for(let n=1;n<=e;n+=1)t.push(n===h?`<b>${n}</b>`:`<a href="#" data-nasajab-page="${n}">${n}</a>`);b.innerHTML=`[ ${t.join(` `)} ]`}function P(){let e=f?5:4;v.innerHTML=`
        <table border="1" cellspacing="0" cellpadding="6" width="100%" class="nasajab-today-table">
            <tr bgcolor="#f0f0f0">
                <th align="center">TODAY'S 나사잡</th>
            </tr>
            <tr>
                <td>
                    아직 나를 사로 잡은 것이 올라오지 않았습니다.
                    ${f?`OWNER MODE에서 첫 이미지를 올려보면 됨.`:`언젠가 갑자기 생김.`}
                </td>
            </tr>
        </table>
    `,y.innerHTML=`<tr><td colspan="${e}">아카이브도 아직 비어 있음.</td></tr>`,b.innerHTML=``}function F(e){let t=o(e),n=e?.status===404?`PocketBase에 nasajab 컬렉션을 먼저 반영해야 합니다.`:t,r=f?5:4;v.innerHTML=`
        <table border="1" cellspacing="0" cellpadding="6" width="100%" class="nasajab-today-table">
            <tr bgcolor="#f0f0f0"><th align="center">TODAY'S 나사잡</th></tr>
            <tr><td>${u(n)}</td></tr>
        </table>
    `,y.innerHTML=`<tr><td colspan="${r}">${u(t)}</td></tr>`,b.innerHTML=``,W(`CMS 확인 필요: ${n}`,`error`)}async function I(){if(!f)return;let e=O.image.files.length>0;if(!_&&!e){W(`이미지 하나는 꼭 있어야 함. 사진 하나만 띵똥 올리면 됨.`,`error`);return}let t=new FormData(w);t.set(`is_public`,O.isPublic.checked?`true`:`false`),e||t.delete(`image`),U(t,`memo`),U(t,`source_url`),O.displayAt.value?t.set(`display_at`,new Date(O.displayAt.value).toISOString()):t.delete(`display_at`),W(_?`나사잡 수정 중...`:`나사잡 저장 중...`);try{let e=_?await n(_,t):await c(t);W(`${V(e)} 저장 완료.`,`success`),z({hidden:!0}),g=e.id,window.location.hash=e.id,await k()}catch(e){W(`저장 실패: ${o(e)}`,`error`)}}async function L(e){if(!f||!e)return;let n=m.find(t=>t.id===e);n&&(_=n.id,w.hidden=!1,T.textContent=`✎ 나사잡 수정: ${V(n)}`,O.image.value=``,O.memo.value=n.memo||``,O.sourceUrl.value=n.source_url||``,O.displayAt.value=q(t(n)),O.isPublic.checked=n.is_public!==!1,W(`수정 모드. 새 이미지를 고르면 기존 이미지가 바뀜.`),w.scrollIntoView({block:`start`}),O.memo.focus())}async function R(e){if(!f||!e)return;let t=V(m.find(t=>t.id===e));if(confirm(`${t}을 삭제할까?\n이 작업은 되돌릴 수 없습니다.`))try{await l(e),g===e&&(g=``,history.replaceState(null,``,window.location.pathname+window.location.search)),W(`${t} 삭제 완료.`,`success`),await k()}catch(e){W(`삭제 실패: ${o(e)}`,`error`)}}function z(e={}){w&&(_=``,w.reset(),T.textContent=`✚ 새 나사잡 올리기`,O.displayAt.value=q(new Date().toISOString()),O.isPublic.checked=!0,w.hidden=e.hidden??!0)}function B(e){return`
        <span class="nasajab-owner-actions">
            <button type="button" class="owner-btn" data-nasajab-action="edit" data-nasajab-id="${X(e.id)}">수정</button>
            <button type="button" class="owner-btn owner-btn-danger" data-nasajab-action="delete" data-nasajab-id="${X(e.id)}">삭제</button>
        </span>
    `}function V(e){let t=String(e?.memo||``).replace(/\s+/g,` `).trim();return t?t.length>80?`${t.slice(0,80).trim()}...`:t:`메모 없이 잡힌 것`}function H(e){return e?.demo_image_url||r(e)}function U(e,t){let n=String(e.get(t)||``).trim();n?e.set(t,n):e.delete(t)}function W(e,t=`info`){C&&(C.textContent=e||``,C.className=`nasajab-owner-status nasajab-owner-status--${t}`)}function G(){return decodeURIComponent(window.location.hash.replace(/^#/,``)).trim()}function K(e){if(!e)return``;let t=new Date(e);return Number.isNaN(t.getTime())?String(e):`${t.toLocaleDateString(`ko-KR`,{year:`numeric`,month:`2-digit`,day:`2-digit`})} ${t.toLocaleTimeString(`ko-KR`,{hour:`2-digit`,minute:`2-digit`,second:`2-digit`})}`}function q(e){let t=e?new Date(e):new Date;if(Number.isNaN(t.getTime()))return``;let n=t.getTimezoneOffset()*60*1e3;return new Date(t.getTime()-n).toISOString().slice(0,16)}function J(e){try{let t=new URL(e);return t.hostname.replace(/^www\./,``)+t.pathname.replace(/\/$/,``)}catch{return e}}function Y(e){return u(e).replace(/\r?\n/g,`<br>`)}function X(e){return String(e||``).replace(/&/g,`&amp;`).replace(/"/g,`&quot;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}function Z(){return[[`demo-sky`,`퇴근길, 하늘이 오늘따라 멋졌다.`,`1999-05-20T19:15:27+09:00`,`#d4b4ff`,`#3c286e`],[`demo-cassette`,`오래된 카세트 테이프. 갑자기 이런 질감이 좋아져서.`,`1999-05-18T23:41:02+09:00`,`#e8e8e8`,`#111111`],[`demo-game`,`재미있던 8비트 게임. 쓸데없이 진지해서 웃겼음.`,`1999-05-15T16:20:33+09:00`,`#b7f7c1`,`#1f5c2a`],[`demo-coffee`,`좋은 음악과 커피 한 잔. 별것 아닌데 오래 봄.`,`1999-05-12T10:05:11+09:00`,`#d8b08c`,`#3d2415`],[`demo-sentence`,`마음에 남는 문장 하나. 지피띠니가 이상하게 정확한 말을 함.`,`1999-05-10T22:18:44+09:00`,`#fff6c9`,`#533c00`],[`demo-flower`,`길가에 핀 작은 꽃. 작은데 너무 뻔뻔하게 예뻤다.`,`1999-05-08T13:07:59+09:00`,`#c9f2c7`,`#195a1f`]].map(([e,t,n,r,i],a)=>({id:e,memo:t,display_at:n,created:n,is_public:!0,demo_image_url:Q(t,r,i,a)}))}function Q(e,t,n,r){let i=e.split(/[.!?]/)[0].trim().slice(0,18)||`나사잡`,a=`
        <svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
            <rect width="480" height="270" fill="${t}"/>
            ${[`<circle cx="260" cy="110" r="52" fill="white" opacity="0.6"/>`,`<rect x="80" y="70" width="260" height="120" fill="white" opacity="0.5"/>`,`<path d="M30 180 C120 60 240 240 370 80" fill="none" stroke="white" stroke-width="18" opacity="0.5"/>`,`<circle cx="90" cy="80" r="28" fill="white" opacity="0.55"/><circle cx="310" cy="160" r="40" fill="white" opacity="0.35"/>`][r%4]}
            <rect x="20" y="20" width="440" height="230" fill="none" stroke="${n}" stroke-width="4"/>
            <text x="240" y="145" text-anchor="middle" font-family="monospace" font-size="22" fill="${n}">${$(i)}</text>
        </svg>
    `;return`data:image/svg+xml;charset=utf-8,${encodeURIComponent(a)}`}function $(e){return String(e||``).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}