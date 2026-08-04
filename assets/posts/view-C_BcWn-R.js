import{F as e,P as t,X as n,b as r,ct as i,g as a,q as o,r as s,rt as c,v as l}from"../pb-DbLjBjog.js";import"../site-CaxTqsYB.js";import{i as u,n as d,o as f,t as p}from"../media-embeds-DNO73Xll.js";var m=new URLSearchParams(window.location.search).get(`slug`),h=o();m?g(m):S(`글을 찾을 수 없습니다.`,`Post not found`);async function g(r){try{x(r);let i=await t(r,h);if(i.status!==`published`&&!h){S(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${i.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${l(i.title)}</b> · 단일 글 페이지`;let o=h?await e([i.id]):{};h&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            현재 글 조회수 <span class="post-view-count">${b(o[i.id])}</span> ·
                            <a href="../admin/posts.html?id=${i.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await a(i.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+s(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),n(),window.location.reload()})),v(i,o[i.id]),h||_(i)}catch(e){S(s(e),`Post not found`)}}function _(e){let t=()=>{i(e).catch(e=>{console.warn(`Post view count failed:`,s(e))})};if(!(document.documentElement.classList.contains(`entry-gate-pending`)||document.documentElement.classList.contains(`entry-gate-open`))||window.__coldwaterkimEntryAdmitted===!0||document.documentElement.dataset.entryAdmitted===`true`){t();return}window.addEventListener(`coldwaterkim:entry-admitted`,t,{once:!0})}function v(e,t=null){let n=document.getElementById(`post-timeline`);n.innerHTML=y(e,t),p(n,e.id),d(n),f(n)}function y(e,t=null){let n=c(e),i=e.status===`published`?``:` <small class="note">[초안]</small>`,a=h?` · 조회수 <span class="post-view-count">${b(t)}</span>`:``;return`
                <article class="timeline-post" data-post-id="${e.id}">
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${l(e.title||`Untitled`)}</a>${i}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${r(n)}
                            ${a}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${u(e.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function b(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function x(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function S(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${l(e)}</p>`}