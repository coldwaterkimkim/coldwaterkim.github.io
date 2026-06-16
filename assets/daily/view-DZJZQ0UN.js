import{J as e,N as t,T as n,V as r,W as i,c as a,f as o,l as s,r as c,v as l,x as u,y as d}from"../pb-qCP2p06G.js";import"../site-DX3MCTEh.js";var f=new URLSearchParams(window.location.search),p=f.get(`day`),m=f.get(`slug`),h=r();p?_(e(p)):m?g(m):A(`나으 하루를 찾을 수 없습니다.`,`Daily not found`);async function g(e){try{O({slug:e});let t=await n(e,h);if(t.status!==`published`&&!h){A(`이 하루는 아직 발행되지 않았습니다.`,`Not published`);return}await _(a(t),t.id,t)}catch(e){A(c(e),`Daily not found`)}}async function _(e,n=``,r=null){try{O({dayKey:e});let i=v(h?await u():await t(),e,r);if(i.length===0){A(`${d(e)}에는 아직 공개된 나으 하루가 없습니다.`,`Daily not found`);return}document.title=`${d(e)}의 하루 — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`나으 하루`,document.getElementById(`timeline-note`).innerHTML=`<b>${d(e)}의 하루</b> · 기록 ${i.length}개 · 시간순`,h&&y(),b(i,n),S(),n&&C(n)}catch(e){A(c(e),`Daily not found`)}}function v(t,n,r=null){let i=e(n);return(r&&!t.some(e=>e.id===r.id)?[...t,r]:t).filter(e=>a(e)===i).sort((e,t)=>{let n=k(E(e))-k(E(t));if(n!==0)return n;let r=k(e?.created)-k(t?.created);return r===0?String(e?.id||``).localeCompare(String(t?.id||``)):r})}function y(){document.getElementById(`owner-tools`).innerHTML=`
                <div class="owner-bar">
                    <b>OWNER MODE</b> ·
                    <a href="../admin/daily.html?new=1">새 나으 하루</a> ·
                    <a href="../admin/media.html">미디어</a> ·
                    <a href="#" id="logoutLink">로그아웃</a>
                </div>
            `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),i(),window.location.reload()})}function b(e,t=``){let n=document.getElementById(`daily-timeline`);n.innerHTML=e.map(e=>x(e,e.id===t)).join(``)}function x(e,t){let n=a(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,i=t?`<div class="timeline-focus-badge">★ FROM OLD LINK ★</div>`:``,o=h?`
                <span class="timeline-owner-actions">
                    <a href="../admin/daily.html?id=${encodeURIComponent(e.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-daily-id="${e.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${w(e.id)}" class="timeline-post${t?` timeline-post--focused`:``}" data-daily-id="${e.id}">
                    ${i}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?day=${encodeURIComponent(n)}">${l(e.title||`${n} 나으 하루`)}</a>${r}
                        </h2>
                        <div class="timeline-post-meta">
                            Time: ${l(T(e))}
                            ${o}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${e.content||`<p>내용이 없습니다.</p>`}
                    </div>
                </article>
            `}function S(){h&&document.querySelectorAll(`[data-delete-daily-id]`).forEach(e=>{e.addEventListener(`click`,async()=>{let t=e.getAttribute(`data-delete-daily-id`);if(!(!t||!confirm(`이 하루 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{await o(t),document.getElementById(w(t))?.remove(),document.querySelector(`[data-daily-id]`)||(document.getElementById(`daily-timeline`).innerHTML=`<p>이 날의 기록이 모두 삭제되었습니다.</p>`)}catch(e){alert(`삭제 실패: `+c(e))}})})}function C(e){let t=document.getElementById(w(e));t&&(t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0}))}function w(e){return`daily-${e}`}function T(e){let t=E(e),n=new Date(t);return Number.isNaN(n.getTime())?d(a(e)):new Intl.DateTimeFormat(`ko-KR`,{year:`numeric`,month:`long`,day:`numeric`,hour:`2-digit`,minute:`2-digit`,hour12:!1}).format(n)}function E(e){let t=String(e?.published_at||``).trim();return t&&D(t)?t:e?.created||s(e)}function D(e){let t=String(e||``).trim();if(!t||/^\d{4}-\d{2}-\d{2}$/.test(t))return!1;let n=new Date(t);return Number.isNaN(n.getTime())?!0:!(n.getUTCHours()===0&&n.getUTCMinutes()===0&&n.getUTCSeconds()===0&&n.getUTCMilliseconds()===0)}function O({dayKey:e=``,slug:t=``}={}){let n=document.querySelector(`.secret-login`);if(!n)return;let r=e?`/daily/view.html?day=${encodeURIComponent(e)}`:`/daily/view.html?slug=${encodeURIComponent(t)}`;n.href=`/admin/login.html?next=${encodeURIComponent(r)}`}function k(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}function A(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`daily-timeline`).innerHTML=`<p>${l(e)}</p>`}