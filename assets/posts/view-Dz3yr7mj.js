import{A as e,E as t,H as n,I as r,_ as i,c as a,d as o,l as s,n as c,o as l,u,w as d,y as f}from"../pb-CrrKWHU8.js";import"../site-C15qtE1W.js";var p=new URLSearchParams(window.location.search).get(`slug`),m=d();p?h(p):T(`글을 찾을 수 없습니다.`,`Post not found`);async function h(e){try{w(e);let n=await i(e,m);if(n.status!==`published`&&!m){T(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${n.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${a(n.title)}</b>`;let r=g(m?await o():await f(),n);m&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            <a href="../admin/posts.html?id=${n.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await l(n.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+c(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),t(),window.location.reload()})),_(r,n.id),b(n.id),x(n.id)}catch(e){T(c(e),`Post not found`)}}function g(e,t){return n(e.some(e=>e.id===t.id)?e:[...e,t])}function _(e,t){let n=document.getElementById(`post-timeline`);if(e.length===0){n.innerHTML=`<p>아직 글이 없습니다.</p>`;return}n.innerHTML=e.map(e=>v(e,e.id===t)).join(``)}function v(t,n){let r=e(t),i=t.status===`published`?``:` <small class="note">[초안]</small>`,o=n?`<div class="timeline-focus-badge">★ NOW READING ★</div>`:``,s=m?`
                <span class="timeline-owner-actions">
                    <a href="../admin/posts.html?id=${encodeURIComponent(t.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-post-id="${t.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${S(t.id)}" class="timeline-post${n?` timeline-post--focused`:``}" data-post-id="${t.id}">
                    ${o}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(t.slug||``)}">${a(t.title||`Untitled`)}</a>${i}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${u(r)}
                            ${s}
                        </div>
                    </div>
                    ${y(t)}
                    <div class="post-content timeline-post-content ql-editor">
                        ${t.content||`<p>내용이 없습니다.</p>`}
                    </div>
                </article>
            `}function y(e){let t=r(e);return!t||s(e.content).includes(t)?``:`
                <div class="timeline-featured-image">
                    <img src="${C(t)}" alt="${C(e.title||``)}">
                </div>
            `}function b(e){m&&document.querySelectorAll(`[data-delete-post-id]`).forEach(t=>{t.addEventListener(`click`,async()=>{let n=t.getAttribute(`data-delete-post-id`);if(!(!n||!confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{if(await l(n),n===e){window.location.href=`index.html`;return}document.getElementById(S(n))?.remove()}catch(e){alert(`삭제 실패: `+c(e))}})})}function x(e){let t=document.getElementById(S(e));if(!t)return;t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0});let n=()=>t.scrollIntoView({block:`start`,inline:`nearest`});requestAnimationFrame(n),setTimeout(n,250),setTimeout(n,1e3)}function S(e){return`post-${e}`}function C(e){return a(e).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`)}function w(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function T(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${a(e)}</p>`}