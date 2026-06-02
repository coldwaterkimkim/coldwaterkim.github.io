import{H as e,I as t,J as n,c as r,d as i,f as a,j as o,k as s,m as c,n as l,u,w as d,x as f}from"../pb-CRPh0QTz.js";import"../site-DRoJnSiC.js";var p=new URLSearchParams(window.location.search).get(`slug`),m=s();p?h(p):T(`글을 찾을 수 없습니다.`,`Post not found`);async function h(e){try{w(e);let t=await f(e,m);if(t.status!==`published`&&!m){T(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${t.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${u(t.title)}</b>`;let n=g(m?await c():await d(),t);m&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            <a href="../admin/posts.html?id=${t.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await r(t.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+l(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),o(),window.location.reload()})),_(n,t.id),b(t.id),x(t.id)}catch(e){T(l(e),`Post not found`)}}function g(e,t){return n(e.some(e=>e.id===t.id)?e:[...e,t])}function _(e,t){let n=document.getElementById(`post-timeline`);if(e.length===0){n.innerHTML=`<p>아직 글이 없습니다.</p>`;return}n.innerHTML=e.map(e=>v(e,e.id===t)).join(``)}function v(e,n){let r=t(e),i=e.status===`published`?``:` <small class="note">[초안]</small>`,o=n?`<div class="timeline-focus-badge">★ NOW READING ★</div>`:``,s=m?`
                <span class="timeline-owner-actions">
                    <a href="../admin/posts.html?id=${encodeURIComponent(e.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-post-id="${e.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${S(e.id)}" class="timeline-post${n?` timeline-post--focused`:``}" data-post-id="${e.id}">
                    ${o}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${u(e.title||`Untitled`)}</a>${i}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${a(r)}
                            ${s}
                        </div>
                    </div>
                    ${y(e)}
                    <div class="post-content timeline-post-content ql-editor">
                        ${e.content||`<p>내용이 없습니다.</p>`}
                    </div>
                </article>
            `}function y(t){let n=e(t);return!n||i(t.content).includes(n)?``:`
                <div class="timeline-featured-image">
                    <img src="${C(n)}" alt="${C(t.title||``)}">
                </div>
            `}function b(e){m&&document.querySelectorAll(`[data-delete-post-id]`).forEach(t=>{t.addEventListener(`click`,async()=>{let n=t.getAttribute(`data-delete-post-id`);if(!(!n||!confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{if(await r(n),n===e){window.location.href=`index.html`;return}document.getElementById(S(n))?.remove()}catch(e){alert(`삭제 실패: `+l(e))}})})}function x(e){let t=document.getElementById(S(e));if(!t)return;t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0});let n=()=>t.scrollIntoView({block:`start`,inline:`nearest`});requestAnimationFrame(n),setTimeout(n,250),setTimeout(n,1e3)}function S(e){return`post-${e}`}function C(e){return u(e).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function w(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function T(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${u(e)}</p>`}