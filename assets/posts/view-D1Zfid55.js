import{$ as e,C as t,K as n,L as r,U as i,g as a,j as o,r as s,ut as c,v as l,y as u}from"../pb-DICpD8mJ.js";import"../site-DNuQH2a5.js";var d=new URLSearchParams(window.location.search).get(`slug`),f=i();d?p(d):x(`글을 찾을 수 없습니다.`,`Post not found`);async function p(e){try{b(e);let i=await o(e,f);if(i.status!==`published`&&!f){x(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${i.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${l(i.title)}</b>`;let c=m(f?await t():await r(),i);f&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            <a href="../admin/posts.html?id=${i.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await a(i.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+s(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),n(),window.location.reload()})),h(c,i.id),_(i.id),v(i.id)}catch(e){x(s(e),`Post not found`)}}function m(e,t){return c(e.some(e=>e.id===t.id)?e:[...e,t])}function h(e,t){let n=document.getElementById(`post-timeline`);if(e.length===0){n.innerHTML=`<p>아직 글이 없습니다.</p>`;return}n.innerHTML=e.map(e=>g(e,e.id===t)).join(``)}function g(t,n){let r=e(t),i=t.status===`published`?``:` <small class="note">[초안]</small>`,a=n?`<div class="timeline-focus-badge">★ NOW READING ★</div>`:``,o=f?`
                <span class="timeline-owner-actions">
                    <a href="../admin/posts.html?id=${encodeURIComponent(t.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-post-id="${t.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${y(t.id)}" class="timeline-post${n?` timeline-post--focused`:``}" data-post-id="${t.id}">
                    ${a}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(t.slug||``)}">${l(t.title||`Untitled`)}</a>${i}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${u(r)}
                            ${o}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${t.content||`<p>내용이 없습니다.</p>`}
                    </div>
                </article>
            `}function _(e){f&&document.querySelectorAll(`[data-delete-post-id]`).forEach(t=>{t.addEventListener(`click`,async()=>{let n=t.getAttribute(`data-delete-post-id`);if(!(!n||!confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{if(await a(n),n===e){window.location.href=`index.html`;return}document.getElementById(y(n))?.remove()}catch(e){alert(`삭제 실패: `+s(e))}})})}function v(e){let t=document.getElementById(y(e));if(!t)return;t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0});let n=()=>t.scrollIntoView({block:`start`,inline:`nearest`});requestAnimationFrame(n),setTimeout(n,250),setTimeout(n,1e3)}function y(e){return`post-${e}`}function b(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function x(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${l(e)}</p>`}