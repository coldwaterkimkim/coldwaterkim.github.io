import{G as e,I as t,O as n,S as r,U as i,b as a,i as o,l as s,p as c,u as l,y as u}from"../pb-BIchPP5n.js";import"../site-Dmd5ZFKW.js";var d=new URLSearchParams(window.location.search).get(`slug`),f=i();d?p(d):x(`나으 하루를 찾을 수 없습니다.`,`Daily not found`);async function p(i){try{b(i);let a=await n(i,f);if(a.status!==`published`&&!f){x(`이 하루는 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${a.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`나으 하루`,document.getElementById(`timeline-note`).innerHTML=`<b>${u(a.title)}</b>`;let s=m(f?await r():await t(),a);f&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            <a href="../admin/daily.html?id=${a.id}">현재 하루 수정</a> ·
                            <a href="../admin/daily.html?new=1">새 나으 하루</a> ·
                            <a href="#" id="deleteEntryLink">현재 하루 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deleteEntryLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 하루 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await c(a.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+o(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,t=>{t.preventDefault(),e(),window.location.reload()})),h(s,a.id),_(a.id),v(a.id)}catch(e){x(o(e),`Daily not found`)}}function m(e,t){return(e.some(e=>e.id===t.id)?e:[...e,t]).sort((e,t)=>String(s(t)).localeCompare(String(s(e))))}function h(e,t){let n=document.getElementById(`daily-timeline`);if(e.length===0){n.innerHTML=`<p>아직 나으 하루가 없습니다.</p>`;return}n.innerHTML=e.map(e=>g(e,e.id===t)).join(``)}function g(e,t){let n=s(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,i=t?`<div class="timeline-focus-badge">★ NOW READING ★</div>`:``,o=f?`
                <span class="timeline-owner-actions">
                    <a href="../admin/daily.html?id=${encodeURIComponent(e.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-daily-id="${e.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${y(e.id)}" class="timeline-post${t?` timeline-post--focused`:``}" data-daily-id="${e.id}">
                    ${i}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(e.slug||n)}">${u(e.title||`${n} 나으 하루`)}</a>${r}
                        </h2>
                        <div class="timeline-post-meta">
                            Day: ${a(l(e))}
                            ${o}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${e.content||`<p>내용이 없습니다.</p>`}
                    </div>
                </article>
            `}function _(e){f&&document.querySelectorAll(`[data-delete-daily-id]`).forEach(t=>{t.addEventListener(`click`,async()=>{let n=t.getAttribute(`data-delete-daily-id`);if(!(!n||!confirm(`이 하루 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{if(await c(n),n===e){window.location.href=`index.html`;return}document.getElementById(y(n))?.remove()}catch(e){alert(`삭제 실패: `+o(e))}})})}function v(e){let t=document.getElementById(y(e));if(!t)return;t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0});let n=()=>t.scrollIntoView({block:`start`,inline:`nearest`});requestAnimationFrame(n),setTimeout(n,250),setTimeout(n,1e3)}function y(e){return`daily-${e}`}function b(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/daily/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function x(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`daily-timeline`).innerHTML=`<p>${u(e)}</p>`}