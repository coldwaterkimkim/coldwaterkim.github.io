import{M as e,N as t,W as n,at as r,b as i,et as a,g as o,q as s,r as c,v as l}from"../pb-Diol6JGC.js";import"../site-D52x1Gg4.js";import{r as u,t as d}from"../media-embeds-YUn1hw-_.js";var f=new URLSearchParams(window.location.search).get(`slug`),p=n();f?m(f):y(`글을 찾을 수 없습니다.`,`Post not found`);async function m(n){try{v(n);let i=await e(n,p);if(i.status!==`published`&&!p){y(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${i.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${l(i.title)}</b> · 단일 글 페이지`;let a=p?await t([i.id]):{};p&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            현재 글 조회수 <span class="post-view-count">${_(a[i.id])}</span> ·
                            <a href="../admin/posts.html?id=${i.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await o(i.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+c(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),s(),window.location.reload()})),h(i,a[i.id]),p||r(i).catch(e=>{console.warn(`Post view count failed:`,c(e))})}catch(e){y(c(e),`Post not found`)}}function h(e,t=null){let n=document.getElementById(`post-timeline`);n.innerHTML=g(e,t),d(n)}function g(e,t=null){let n=a(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,o=p?` · 조회수 <span class="post-view-count">${_(t)}</span>`:``;return`
                <article class="timeline-post" data-post-id="${e.id}">
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${l(e.title||`Untitled`)}</a>${r}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${i(n)}
                            ${o}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${u(e.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function _(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function v(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function y(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${l(e)}</p>`}