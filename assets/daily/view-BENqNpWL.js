import{J as e,R as t,T as n,Z as r,i,k as a,l as o,p as s,tt as c,u as l,x as u,y as d}from"../pb-Bri0wDAz.js";import"../site-BhKtXl4S.js";import{i as f,n as p,o as m,t as h}from"../media-embeds-B1FsvN1D.js";var g=new URLSearchParams(window.location.search),_=g.get(`day`),v=g.get(`slug`),y=e();_?x(c(_)):v?b(v):P(`나으 하루를 찾을 수 없습니다.`,`Daily not found`);async function b(e){try{M({slug:e});let t=await a(e,y);if(t.status!==`published`&&!y){P(`이 하루는 아직 발행되지 않았습니다.`,`Not published`);return}await x(o(t),t.id,t)}catch(e){P(i(e),`Daily not found`)}}async function x(e,r=``,a=null){try{M({dayKey:e});let i=S(y?await n():await t(),e,a);if(i.length===0){P(`${u(e)}에는 아직 공개된 나으 하루가 없습니다.`,`Daily not found`);return}document.title=`${u(e)}의 하루 — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`나으 하루`,document.getElementById(`timeline-note`).innerHTML=`<b>${u(e)}의 하루</b> · 기록 ${i.length}개 · 시간순`,y&&C(),w(i,r),E(),r&&D(r)}catch(e){P(i(e),`Daily not found`)}}function S(e,t,n=null){let r=c(t);return(n&&!e.some(e=>e.id===n.id)?[...e,n]:e).filter(e=>o(e)===r).sort((e,t)=>{let n=N(A(e))-N(A(t));if(n!==0)return n;let r=N(e?.created)-N(t?.created);return r===0?String(e?.id||``).localeCompare(String(t?.id||``)):r})}function C(){document.getElementById(`owner-tools`).innerHTML=`
                <div class="owner-bar">
                    <b>OWNER MODE</b> ·
                    <a href="../admin/daily.html?new=1">새 나으 하루</a> ·
                    <a href="../admin/media.html">미디어</a> ·
                    <a href="#" id="logoutLink">로그아웃</a>
                </div>
            `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),r(),window.location.reload()})}function w(e,t=``){let n=document.getElementById(`daily-timeline`);n.innerHTML=e.map(e=>T(e,e.id===t)).join(``),e.forEach(e=>{let t=n.querySelector(`[data-daily-id="${CSS.escape(e.id)}"]`);t&&h(t,e.id)}),p(n),m(n)}function T(e,t){let n=o(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,i=t?`<div class="timeline-focus-badge">★ FROM OLD LINK ★</div>`:``,a=y?`
                <span class="timeline-owner-actions">
                    <a href="../admin/daily.html?id=${encodeURIComponent(e.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-daily-id="${e.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${O(e.id)}" class="timeline-post${t?` timeline-post--focused`:``}" data-daily-id="${e.id}">
                    ${i}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?day=${encodeURIComponent(n)}">${d(e.title||`${n} 나으 하루`)}</a>${r}
                        </h2>
                        <div class="timeline-post-meta">
                            Time: ${d(k(e))}
                            ${a}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${f(e.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function E(){y&&document.querySelectorAll(`[data-delete-daily-id]`).forEach(e=>{e.addEventListener(`click`,async()=>{let t=e.getAttribute(`data-delete-daily-id`);if(!(!t||!confirm(`이 하루 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{await s(t),document.getElementById(O(t))?.remove(),document.querySelector(`[data-daily-id]`)||(document.getElementById(`daily-timeline`).innerHTML=`<p>이 날의 기록이 모두 삭제되었습니다.</p>`)}catch(e){alert(`삭제 실패: `+i(e))}})})}function D(e){let t=document.getElementById(O(e));t&&(t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0}))}function O(e){return`daily-${e}`}function k(e){let t=A(e),n=new Date(t);return Number.isNaN(n.getTime())?u(o(e)):new Intl.DateTimeFormat(`ko-KR`,{year:`numeric`,month:`long`,day:`numeric`,hour:`2-digit`,minute:`2-digit`,hour12:!1}).format(n)}function A(e){let t=String(e?.published_at||``).trim();return t&&j(t)?t:e?.created||l(e)}function j(e){let t=String(e||``).trim();if(!t||/^\d{4}-\d{2}-\d{2}$/.test(t))return!1;let n=new Date(t);return Number.isNaN(n.getTime())?!0:!(n.getUTCHours()===0&&n.getUTCMinutes()===0&&n.getUTCSeconds()===0&&n.getUTCMilliseconds()===0)}function M({dayKey:e=``,slug:t=``}={}){let n=document.querySelector(`.secret-login`);if(!n)return;let r=e?`/daily/view.html?day=${encodeURIComponent(e)}`:`/daily/view.html?slug=${encodeURIComponent(t)}`;n.href=`/admin/login.html?next=${encodeURIComponent(r)}`}function N(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}function P(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`daily-timeline`).innerHTML=`<p>${d(e)}</p>`}