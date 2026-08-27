import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-CNI49moz.js";import{E as e,I as t,U as n,Vt as r,W as i,_t as a,h as o,ht as s,k as c,l,m as u,tt as d,wt as f,xt as p,y as m}from"../pb-DMqTlCfb.js";import{a as h,n as g,s as _,t as v}from"../media-embeds-TJbdquAd.js";var y=new URLSearchParams(window.location.search),b=window.location.pathname.match(/^\/daily\/(\d{4}-\d{2}-\d{2})\/?$/)?.[1]||``,x=y.get(`day`)||b,S=y.get(`slug`),C=s();x?T(p(x)):S?w(S):V(`나으 하루를 찾을 수 없습니다.`,`Daily not found`);async function w(e){try{z({slug:e});let t=await i(e,C);if(t.status!==`published`&&!C){V(`이 하루는 아직 발행되지 않았습니다.`,`Not published`);return}await T(u(t),t.id,t)}catch(e){V(l(e),`Daily not found`)}}async function T(e,i=``,a=null){try{z({dayKey:e});let o=E(C?await t():await d(),e,a);if(o.length===0){V(`${c(e)}에는 아직 공개된 나으 하루가 없습니다.`,`Daily not found`);return}document.title=`${c(e)}의 하루 — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`나으 하루`,document.getElementById(`timeline-note`).innerHTML=`<b>${c(e)}의 하루</b> · 기록 ${o.length}개 · 시간순`;let s=C?await n([{kind:`daily`,id:e}]):{};C&&D(s[r(`daily`,e)]),A(o,i),N(),i&&P(i),C||O(e)}catch(e){V(l(e),`Daily not found`)}}function E(e,t,n=null){let r=p(t);return(n&&!e.some(e=>e.id===n.id)?[...e,n]:e).filter(e=>u(e)===r).sort((e,t)=>{let n=B(L(e))-B(L(t));if(n!==0)return n;let r=B(e?.created)-B(t?.created);return r===0?String(e?.id||``).localeCompare(String(t?.id||``)):r})}function D(e){document.getElementById(`owner-tools`).innerHTML=`
                <div class="owner-bar">
                    <b>OWNER MODE</b> ·
                    현재 하루 조회수 <span class="post-view-count">${k(e)}</span> ·
                    <a href="/admin/daily.html?new=1">새 나으 하루</a> ·
                    <a href="/admin/media.html">미디어</a> ·
                    <a href="#" id="logoutLink">로그아웃</a>
                </div>
            `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),a(),window.location.reload()})}function O(e){let t=()=>{f({kind:`daily`,id:e,slug:e,published:!0}).catch(e=>console.warn(`Daily view count failed:`,l(e)))};if(!(document.documentElement.classList.contains(`entry-gate-pending`)||document.documentElement.classList.contains(`entry-gate-open`))||window.__coldwaterkimEntryAdmitted===!0||document.documentElement.dataset.entryAdmitted===`true`){t();return}window.addEventListener(`coldwaterkim:entry-admitted`,t,{once:!0})}function k(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function A(e,t=``){let n=document.getElementById(`daily-timeline`);n.innerHTML=e.map(e=>j(e,e.id===t)).join(``),e.forEach(e=>{let t=n.querySelector(`[data-daily-id="${CSS.escape(e.id)}"]`);t&&v(t,e.id)}),g(n),_(n)}function j(t,n){let r=u(t),i=t.status===`published`?``:` <small class="note">[초안]</small>`,a=n?`<div class="timeline-focus-badge">★ FROM OLD LINK ★</div>`:``,o=C?`
                <span class="timeline-owner-actions">
                    <a href="/admin/daily.html?id=${encodeURIComponent(t.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-daily-id="${t.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${F(t.id)}" class="timeline-post${n?` timeline-post--focused`:``}" data-daily-id="${t.id}">
                    ${a}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="${M(r)}">${e(t.title||`${r} 나으 하루`)}</a>${i}
                        </h2>
                        <div class="timeline-post-meta">
                            Time: ${e(I(t))}
                            ${o}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${h(t.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function M(e){let t=encodeURIComponent(e);return C?`/daily/view.html?day=${t}`:`/daily/${t}/`}function N(){C&&document.querySelectorAll(`[data-delete-daily-id]`).forEach(e=>{e.addEventListener(`click`,async()=>{let t=e.getAttribute(`data-delete-daily-id`);if(!(!t||!confirm(`이 하루 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{await m(t),document.getElementById(F(t))?.remove(),document.querySelector(`[data-daily-id]`)||(document.getElementById(`daily-timeline`).innerHTML=`<p>이 날의 기록이 모두 삭제되었습니다.</p>`)}catch(e){alert(`삭제 실패: `+l(e))}})})}function P(e){let t=document.getElementById(F(e));t&&(t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0}))}function F(e){return`daily-${e}`}function I(e){let t=L(e),n=new Date(t);return Number.isNaN(n.getTime())?c(u(e)):new Intl.DateTimeFormat(`ko-KR`,{year:`numeric`,month:`long`,day:`numeric`,hour:`2-digit`,minute:`2-digit`,hour12:!1}).format(n)}function L(e){let t=String(e?.published_at||``).trim();return t&&R(t)?t:e?.created||o(e)}function R(e){let t=String(e||``).trim();if(!t||/^\d{4}-\d{2}-\d{2}$/.test(t))return!1;let n=new Date(t);return Number.isNaN(n.getTime())?!0:!(n.getUTCHours()===0&&n.getUTCMinutes()===0&&n.getUTCSeconds()===0&&n.getUTCMilliseconds()===0)}function z({dayKey:e=``,slug:t=``}={}){let n=document.querySelector(`.secret-login`);if(!n)return;let r=e?`/daily/view.html?day=${encodeURIComponent(e)}`:`/daily/view.html?slug=${encodeURIComponent(t)}`;n.href=`/admin/login.html?next=${encodeURIComponent(r)}`}function B(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}function V(t,n){document.title=`${n} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=n,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`daily-timeline`).innerHTML=`<p>${e(t)}</p>`}