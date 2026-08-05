import{F as e,I as t,J as n,Z as r,_ as i,i as a,it as o,lt as s,x as c,y as l}from"../pb-Bri0wDAz.js";import"../site-CZ7TyuOs.js";import{i as u,n as d,o as f,t as p}from"../media-embeds-B1FsvN1D.js";var m=new URLSearchParams(window.location.search).get(`slug`),h=n();m?g(m):S(`글을 찾을 수 없습니다.`,`Post not found`);async function g(n){try{x(n);let o=await e(n,h);if(o.status!==`published`&&!h){S(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${o.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${l(o.title)}</b> · 단일 글 페이지`;let s=h?await t([o.id]):{};h&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            현재 글 조회수 <span class="post-view-count">${b(s[o.id])}</span> ·
                            <a href="../admin/posts.html?id=${o.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await i(o.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+a(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),r(),window.location.reload()})),v(o,s[o.id]),h||_(o)}catch(e){S(a(e),`Post not found`)}}function _(e){let t=()=>{s(e).catch(e=>{console.warn(`Post view count failed:`,a(e))})};if(!(document.documentElement.classList.contains(`entry-gate-pending`)||document.documentElement.classList.contains(`entry-gate-open`))||window.__coldwaterkimEntryAdmitted===!0||document.documentElement.dataset.entryAdmitted===`true`){t();return}window.addEventListener(`coldwaterkim:entry-admitted`,t,{once:!0})}function v(e,t=null){let n=document.getElementById(`post-timeline`);n.innerHTML=y(e,t),p(n,e.id),d(n),f(n)}function y(e,t=null){let n=o(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,i=h?` · 조회수 <span class="post-view-count">${b(t)}</span>`:``;return`
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