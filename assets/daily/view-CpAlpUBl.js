import{D as e,H as t,S as n,a as r,at as i,b as a,d as o,j as s,lt as c,m as l,nt as u,u as d}from"../pb-CdR97qZZ.js";import"../site-49qk07vs.js";import{i as f,n as p,o as m,t as h}from"../media-embeds-BHKV6BZL.js";var g=new URLSearchParams(window.location.search),_=window.location.pathname.match(/^\/daily\/(\d{4}-\d{2}-\d{2})\/?$/)?.[1]||``,v=g.get(`day`)||_,y=g.get(`slug`),b=u();v?S(c(v)):y?x(y):F(`나으 하루를 찾을 수 없습니다.`,`Daily not found`);async function x(e){try{N({slug:e});let t=await s(e,b);if(t.status!==`published`&&!b){F(`이 하루는 아직 발행되지 않았습니다.`,`Not published`);return}await S(d(t),t.id,t)}catch(e){F(r(e),`Daily not found`)}}async function S(i,a=``,o=null){try{N({dayKey:i});let r=C(b?await e():await t(),i,o);if(r.length===0){F(`${n(i)}에는 아직 공개된 나으 하루가 없습니다.`,`Daily not found`);return}document.title=`${n(i)}의 하루 — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`나으 하루`,document.getElementById(`timeline-note`).innerHTML=`<b>${n(i)}의 하루</b> · 기록 ${r.length}개 · 시간순`,b&&w(),T(r,a),D(),a&&O(a)}catch(e){F(r(e),`Daily not found`)}}function C(e,t,n=null){let r=c(t);return(n&&!e.some(e=>e.id===n.id)?[...e,n]:e).filter(e=>d(e)===r).sort((e,t)=>{let n=P(j(e))-P(j(t));if(n!==0)return n;let r=P(e?.created)-P(t?.created);return r===0?String(e?.id||``).localeCompare(String(t?.id||``)):r})}function w(){document.getElementById(`owner-tools`).innerHTML=`
                <div class="owner-bar">
                    <b>OWNER MODE</b> ·
                    <a href="../admin/daily.html?new=1">새 나으 하루</a> ·
                    <a href="../admin/media.html">미디어</a> ·
                    <a href="#" id="logoutLink">로그아웃</a>
                </div>
            `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),i(),window.location.reload()})}function T(e,t=``){let n=document.getElementById(`daily-timeline`);n.innerHTML=e.map(e=>E(e,e.id===t)).join(``),e.forEach(e=>{let t=n.querySelector(`[data-daily-id="${CSS.escape(e.id)}"]`);t&&h(t,e.id)}),p(n),m(n)}function E(e,t){let n=d(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,i=t?`<div class="timeline-focus-badge">★ FROM OLD LINK ★</div>`:``,o=b?`
                <span class="timeline-owner-actions">
                    <a href="../admin/daily.html?id=${encodeURIComponent(e.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-daily-id="${e.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${k(e.id)}" class="timeline-post${t?` timeline-post--focused`:``}" data-daily-id="${e.id}">
                    ${i}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="/daily/${encodeURIComponent(n)}/">${a(e.title||`${n} 나으 하루`)}</a>${r}
                        </h2>
                        <div class="timeline-post-meta">
                            Time: ${a(A(e))}
                            ${o}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${f(e.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function D(){b&&document.querySelectorAll(`[data-delete-daily-id]`).forEach(e=>{e.addEventListener(`click`,async()=>{let t=e.getAttribute(`data-delete-daily-id`);if(!(!t||!confirm(`이 하루 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{await l(t),document.getElementById(k(t))?.remove(),document.querySelector(`[data-daily-id]`)||(document.getElementById(`daily-timeline`).innerHTML=`<p>이 날의 기록이 모두 삭제되었습니다.</p>`)}catch(e){alert(`삭제 실패: `+r(e))}})})}function O(e){let t=document.getElementById(k(e));t&&(t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0}))}function k(e){return`daily-${e}`}function A(e){let t=j(e),r=new Date(t);return Number.isNaN(r.getTime())?n(d(e)):new Intl.DateTimeFormat(`ko-KR`,{year:`numeric`,month:`long`,day:`numeric`,hour:`2-digit`,minute:`2-digit`,hour12:!1}).format(r)}function j(e){let t=String(e?.published_at||``).trim();return t&&M(t)?t:e?.created||o(e)}function M(e){let t=String(e||``).trim();if(!t||/^\d{4}-\d{2}-\d{2}$/.test(t))return!1;let n=new Date(t);return Number.isNaN(n.getTime())?!0:!(n.getUTCHours()===0&&n.getUTCMinutes()===0&&n.getUTCSeconds()===0&&n.getUTCMilliseconds()===0)}function N({dayKey:e=``,slug:t=``}={}){let n=document.querySelector(`.secret-login`);if(!n)return;let r=e?`/daily/view.html?day=${encodeURIComponent(e)}`:`/daily/view.html?slug=${encodeURIComponent(t)}`;n.href=`/admin/login.html?next=${encodeURIComponent(r)}`}function P(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}function F(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`daily-timeline`).innerHTML=`<p>${a(e)}</p>`}