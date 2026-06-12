import{C as e,M as t,R as n,W as r,at as i,et as a,ft as o,g as s,j as c,q as l,r as u,v as d,y as f}from"../pb-BvbDVthX.js";import"../site-BPK0sjAz.js";var p=new URLSearchParams(window.location.search).get(`slug`),m=r();p?h(p):w(`글을 찾을 수 없습니다.`,`Post not found`);async function h(r){try{C(r);let a=await c(r,m);if(a.status!==`published`&&!m){w(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${a.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${d(a.title)}</b>`;let o=g(m?await e():await n(),a),f=m?await t(o.map(e=>e.id)):{};m&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            현재 글 조회수 <span class="post-view-count">${S(f[a.id])}</span> ·
                            <a href="../admin/posts.html?id=${a.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await s(a.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+u(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),l(),window.location.reload()})),_(o,a.id,f),y(a.id),b(a.id),m||i(a).catch(e=>{console.warn(`Post view count failed:`,u(e))})}catch(e){w(u(e),`Post not found`)}}function g(e,t){return o(e.some(e=>e.id===t.id)?e:[...e,t])}function _(e,t,n={}){let r=document.getElementById(`post-timeline`);if(e.length===0){r.innerHTML=`<p>아직 글이 없습니다.</p>`;return}r.innerHTML=e.map(e=>v(e,e.id===t,n)).join(``)}function v(e,t,n={}){let r=a(e),i=e.status===`published`?``:` <small class="note">[초안]</small>`,o=t?`<div class="timeline-focus-badge">★ NOW READING ★</div>`:``,s=m?` · 조회수 <span class="post-view-count">${S(n[e.id])}</span>`:``,c=m?`
                <span class="timeline-owner-actions">
                    <a href="../admin/posts.html?id=${encodeURIComponent(e.id)}">수정</a>
                    <button type="button" class="owner-btn owner-btn-danger" data-delete-post-id="${e.id}">삭제</button>
                </span>
            `:``;return`
                <article id="${x(e.id)}" class="timeline-post${t?` timeline-post--focused`:``}" data-post-id="${e.id}">
                    ${o}
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${d(e.title||`Untitled`)}</a>${i}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${f(r)}
                            ${s}
                            ${c}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${e.content||`<p>내용이 없습니다.</p>`}
                    </div>
                </article>
            `}function y(e){m&&document.querySelectorAll(`[data-delete-post-id]`).forEach(t=>{t.addEventListener(`click`,async()=>{let n=t.getAttribute(`data-delete-post-id`);if(!(!n||!confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)))try{if(await s(n),n===e){window.location.href=`index.html`;return}document.getElementById(x(n))?.remove()}catch(e){alert(`삭제 실패: `+u(e))}})})}function b(e){let t=document.getElementById(x(e));if(!t)return;t.setAttribute(`tabindex`,`-1`),t.focus({preventScroll:!0});let n=()=>t.scrollIntoView({block:`start`,inline:`nearest`});requestAnimationFrame(n),setTimeout(n,250),setTimeout(n,1e3)}function x(e){return`post-${e}`}function S(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function C(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function w(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${d(e)}</p>`}