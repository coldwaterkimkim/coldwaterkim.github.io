import{E as e,a as t,c as n,h as r,j as i,l as a,m as o,n as s,o as c,s as l,w as u,x as d,y as f}from"../pb-CvlYrerP.js";import"../site-eMvZrrio.js";var p=new URLSearchParams(window.location.search).get(`slug`),m=f();p?h(p):T(`글을 찾을 수 없습니다.`,`Post not found`);async function h(e){try{w(e);let n=await o(e,m);if(n.status!==`published`&&!m){T(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${n.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${c(n.title)}</b>`;let i=g(m?await a():await r(),n);m&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            <a href="../admin/posts.html?id=${n.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await t(n.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+s(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),d(),window.location.reload()})),_(i,n.id),b(n.id),x(n.id)}catch(e){T(s(e),`Post not found`)}}function g(e,t){return i(e.some(e=>e.id===t.id)?e:[...e,t])}function _(e,t){let n=document.getElementById(`post-timeline`);if(e.length===0){n.innerHTML=`<p>아직 글이 없습니다.</p>`;return}n.innerHTML=e.map(e=>v(e,e.id===t)).join(``)}function v(e,t){let r=u(e),i=e.status===`published`?``:` <small class="note">[초안]</small>`,a=t?`<div class="timeline-focus-badge">★ NOW READING ★</div>`:``,o=m?`
                <span class="timeline-owner-actions">
                    <a href="../admin/posts.html?id=${encodeURIComponent(e.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-post-id="${e.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${S(e.id)}" class="timeline-post${t?` timeline-post--focused`:``}" data-post-id="${e.id}">
                    ${a}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${c(e.title||`Untitled`)}</a>${i}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${n(r)}
                            ${o}
                        </div>
                    </div>
                    ${y(e)}
                    <div class="post-content timeline-post-content ql-editor">
                        ${e.content||`<p>내용이 없습니다.</p>`}
                    </div>
                </article>
            `}function y(t){let n=e(t);return!n||l(t.content).includes(n)?``:`
                <div class="timeline-featured-image">
                    <img src="${C(n)}" alt="${C(t.title||``)}">
                </div>
            `}function b(e){m&&document.querySelectorAll(`[data-delete-post-id]`).forEach(n=>{n.addEventListener(`click`,async()=>{let r=n.getAttribute(`data-delete-post-id`);if(!(!r||!confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{if(await t(r),r===e){window.location.href=`index.html`;return}document.getElementById(S(r))?.remove()}catch(e){alert(`삭제 실패: `+s(e))}})})}function x(e){let t=document.getElementById(S(e));if(!t)return;t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0});let n=()=>t.scrollIntoView({block:`start`,inline:`nearest`});requestAnimationFrame(n),setTimeout(n,250),setTimeout(n,1e3)}function S(e){return`post-${e}`}function C(e){return c(e).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function w(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function T(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${c(e)}</p>`}