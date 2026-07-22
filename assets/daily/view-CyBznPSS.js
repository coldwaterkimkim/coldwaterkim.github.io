import{E as e,F as t,S as n,W as r,Z as i,b as a,c as o,f as s,l as c,q as l,r as u,v as d}from"../pb-DO2QDeQh.js";import"../site-B6hRsRta.js";import{r as f,t as p}from"../media-embeds-h4FUltIX.js";var m=new URLSearchParams(window.location.search),h=m.get(`day`),g=m.get(`slug`),_=r();h?y(i(h)):g?v(g):M(`나으 하루를 찾을 수 없습니다.`,`Daily not found`);async function v(t){try{A({slug:t});let n=await e(t,_);if(n.status!==`published`&&!_){M(`이 하루는 아직 발행되지 않았습니다.`,`Not published`);return}await y(o(n),n.id,n)}catch(e){M(u(e),`Daily not found`)}}async function y(e,r=``,i=null){try{A({dayKey:e});let o=b(_?await n():await t(),e,i);if(o.length===0){M(`${a(e)}에는 아직 공개된 나으 하루가 없습니다.`,`Daily not found`);return}document.title=`${a(e)}의 하루 — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`나으 하루`,document.getElementById(`timeline-note`).innerHTML=`<b>${a(e)}의 하루</b> · 기록 ${o.length}개 · 시간순`,_&&x(),S(o,r),w(),r&&T(r)}catch(e){M(u(e),`Daily not found`)}}function b(e,t,n=null){let r=i(t);return(n&&!e.some(e=>e.id===n.id)?[...e,n]:e).filter(e=>o(e)===r).sort((e,t)=>{let n=j(O(e))-j(O(t));if(n!==0)return n;let r=j(e?.created)-j(t?.created);return r===0?String(e?.id||``).localeCompare(String(t?.id||``)):r})}function x(){document.getElementById(`owner-tools`).innerHTML=`
                <div class="owner-bar">
                    <b>OWNER MODE</b> ·
                    <a href="../admin/daily.html?new=1">새 나으 하루</a> ·
                    <a href="../admin/media.html">미디어</a> ·
                    <a href="#" id="logoutLink">로그아웃</a>
                </div>
            `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),l(),window.location.reload()})}function S(e,t=``){let n=document.getElementById(`daily-timeline`);n.innerHTML=e.map(e=>C(e,e.id===t)).join(``),p(n)}function C(e,t){let n=o(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,i=t?`<div class="timeline-focus-badge">★ FROM OLD LINK ★</div>`:``,a=_?`
                <span class="timeline-owner-actions">
                    <a href="../admin/daily.html?id=${encodeURIComponent(e.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-daily-id="${e.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${E(e.id)}" class="timeline-post${t?` timeline-post--focused`:``}" data-daily-id="${e.id}">
                    ${i}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?day=${encodeURIComponent(n)}">${d(e.title||`${n} 나으 하루`)}</a>${r}
                        </h2>
                        <div class="timeline-post-meta">
                            Time: ${d(D(e))}
                            ${a}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${f(e.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function w(){_&&document.querySelectorAll(`[data-delete-daily-id]`).forEach(e=>{e.addEventListener(`click`,async()=>{let t=e.getAttribute(`data-delete-daily-id`);if(!(!t||!confirm(`이 하루 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{await s(t),document.getElementById(E(t))?.remove(),document.querySelector(`[data-daily-id]`)||(document.getElementById(`daily-timeline`).innerHTML=`<p>이 날의 기록이 모두 삭제되었습니다.</p>`)}catch(e){alert(`삭제 실패: `+u(e))}})})}function T(e){let t=document.getElementById(E(e));t&&(t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0}))}function E(e){return`daily-${e}`}function D(e){let t=O(e),n=new Date(t);return Number.isNaN(n.getTime())?a(o(e)):new Intl.DateTimeFormat(`ko-KR`,{year:`numeric`,month:`long`,day:`numeric`,hour:`2-digit`,minute:`2-digit`,hour12:!1}).format(n)}function O(e){let t=String(e?.published_at||``).trim();return t&&k(t)?t:e?.created||c(e)}function k(e){let t=String(e||``).trim();if(!t||/^\d{4}-\d{2}-\d{2}$/.test(t))return!1;let n=new Date(t);return Number.isNaN(n.getTime())?!0:!(n.getUTCHours()===0&&n.getUTCMinutes()===0&&n.getUTCSeconds()===0&&n.getUTCMilliseconds()===0)}function A({dayKey:e=``,slug:t=``}={}){let n=document.querySelector(`.secret-login`);if(!n)return;let r=e?`/daily/view.html?day=${encodeURIComponent(e)}`:`/daily/view.html?slug=${encodeURIComponent(t)}`;n.href=`/admin/login.html?next=${encodeURIComponent(r)}`}function j(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}function M(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`daily-timeline`).innerHTML=`<p>${d(e)}</p>`}