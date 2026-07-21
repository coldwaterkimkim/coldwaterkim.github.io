import{E as e,F as t,S as n,W as r,Z as i,b as a,c as o,f as s,l as c,q as l,r as u,v as d}from"../pb-Be3WJXcJ.js";import"../site-DfE2aIJW.js";import{t as f}from"../media-embeds-_5AMfxNO.js";var p=new URLSearchParams(window.location.search),m=p.get(`day`),h=p.get(`slug`),g=r();m?v(i(m)):h?_(h):j(`나으 하루를 찾을 수 없습니다.`,`Daily not found`);async function _(t){try{k({slug:t});let n=await e(t,g);if(n.status!==`published`&&!g){j(`이 하루는 아직 발행되지 않았습니다.`,`Not published`);return}await v(o(n),n.id,n)}catch(e){j(u(e),`Daily not found`)}}async function v(e,r=``,i=null){try{k({dayKey:e});let o=y(g?await n():await t(),e,i);if(o.length===0){j(`${a(e)}에는 아직 공개된 나으 하루가 없습니다.`,`Daily not found`);return}document.title=`${a(e)}의 하루 — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`나으 하루`,document.getElementById(`timeline-note`).innerHTML=`<b>${a(e)}의 하루</b> · 기록 ${o.length}개 · 시간순`,g&&b(),x(o,r),C(),r&&w(r)}catch(e){j(u(e),`Daily not found`)}}function y(e,t,n=null){let r=i(t);return(n&&!e.some(e=>e.id===n.id)?[...e,n]:e).filter(e=>o(e)===r).sort((e,t)=>{let n=A(D(e))-A(D(t));if(n!==0)return n;let r=A(e?.created)-A(t?.created);return r===0?String(e?.id||``).localeCompare(String(t?.id||``)):r})}function b(){document.getElementById(`owner-tools`).innerHTML=`
                <div class="owner-bar">
                    <b>OWNER MODE</b> ·
                    <a href="../admin/daily.html?new=1">새 나으 하루</a> ·
                    <a href="../admin/media.html">미디어</a> ·
                    <a href="#" id="logoutLink">로그아웃</a>
                </div>
            `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),l(),window.location.reload()})}function x(e,t=``){let n=document.getElementById(`daily-timeline`);n.innerHTML=e.map(e=>S(e,e.id===t)).join(``),f(n)}function S(e,t){let n=o(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,i=t?`<div class="timeline-focus-badge">★ FROM OLD LINK ★</div>`:``,a=g?`
                <span class="timeline-owner-actions">
                    <a href="../admin/daily.html?id=${encodeURIComponent(e.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-daily-id="${e.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${T(e.id)}" class="timeline-post${t?` timeline-post--focused`:``}" data-daily-id="${e.id}">
                    ${i}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?day=${encodeURIComponent(n)}">${d(e.title||`${n} 나으 하루`)}</a>${r}
                        </h2>
                        <div class="timeline-post-meta">
                            Time: ${d(E(e))}
                            ${a}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${e.content||`<p>내용이 없습니다.</p>`}
                    </div>
                </article>
            `}function C(){g&&document.querySelectorAll(`[data-delete-daily-id]`).forEach(e=>{e.addEventListener(`click`,async()=>{let t=e.getAttribute(`data-delete-daily-id`);if(!(!t||!confirm(`이 하루 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{await s(t),document.getElementById(T(t))?.remove(),document.querySelector(`[data-daily-id]`)||(document.getElementById(`daily-timeline`).innerHTML=`<p>이 날의 기록이 모두 삭제되었습니다.</p>`)}catch(e){alert(`삭제 실패: `+u(e))}})})}function w(e){let t=document.getElementById(T(e));t&&(t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0}))}function T(e){return`daily-${e}`}function E(e){let t=D(e),n=new Date(t);return Number.isNaN(n.getTime())?a(o(e)):new Intl.DateTimeFormat(`ko-KR`,{year:`numeric`,month:`long`,day:`numeric`,hour:`2-digit`,minute:`2-digit`,hour12:!1}).format(n)}function D(e){let t=String(e?.published_at||``).trim();return t&&O(t)?t:e?.created||c(e)}function O(e){let t=String(e||``).trim();if(!t||/^\d{4}-\d{2}-\d{2}$/.test(t))return!1;let n=new Date(t);return Number.isNaN(n.getTime())?!0:!(n.getUTCHours()===0&&n.getUTCMinutes()===0&&n.getUTCSeconds()===0&&n.getUTCMilliseconds()===0)}function k({dayKey:e=``,slug:t=``}={}){let n=document.querySelector(`.secret-login`);if(!n)return;let r=e?`/daily/view.html?day=${encodeURIComponent(e)}`:`/daily/view.html?slug=${encodeURIComponent(t)}`;n.href=`/admin/login.html?next=${encodeURIComponent(r)}`}function A(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}function j(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`daily-timeline`).innerHTML=`<p>${d(e)}</p>`}