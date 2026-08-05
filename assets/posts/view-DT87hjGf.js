import{$ as e,F as t,I as n,_ as r,i,lt as a,mt as o,nt as s,x as c,y as l}from"../pb-DtPAwrG4.js";import"../site-YaH4EePH.js";import{i as u,n as d,o as f,t as p}from"../media-embeds-B1FsvN1D.js";var m=new URLSearchParams(window.location.search).get(`slug`),h=e();m?g(m):S(`글을 찾을 수 없습니다.`,`Post not found`);async function g(e){try{x(e);let a=await t(e,h);if(a.status!==`published`&&!h){S(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${a.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${l(a.title)}</b> · 단일 글 페이지`;let o=h?await n([a.id]):{};h&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            현재 글 조회수 <span class="post-view-count">${b(o[a.id])}</span> ·
                            <a href="../admin/posts.html?id=${a.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await r(a.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+i(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),s(),window.location.reload()})),v(a,o[a.id]),h||_(a)}catch(e){S(i(e),`Post not found`)}}function _(e){let t=()=>{o(e).catch(e=>{console.warn(`Post view count failed:`,i(e))})};if(!(document.documentElement.classList.contains(`entry-gate-pending`)||document.documentElement.classList.contains(`entry-gate-open`))||window.__coldwaterkimEntryAdmitted===!0||document.documentElement.dataset.entryAdmitted===`true`){t();return}window.addEventListener(`coldwaterkim:entry-admitted`,t,{once:!0})}function v(e,t=null){let n=document.getElementById(`post-timeline`);n.innerHTML=y(e,t),p(n,e.id),d(n),f(n)}function y(e,t=null){let n=a(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,i=h?` · 조회수 <span class="post-view-count">${b(t)}</span>`:``;return`
                <article class="timeline-post" data-post-id="${e.id}">
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${l(e.title||`Untitled`)}</a>${r}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${c(n)}
                            ${i}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${u(e.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function b(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function x(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function S(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${l(e)}</p>`}