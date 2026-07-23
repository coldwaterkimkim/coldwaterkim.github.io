import{G as e,J as t,M as n,N as r,b as i,g as a,ot as o,r as s,tt as c,v as l}from"../pb-CfOIkPGQ.js";import"../site-ByyxUcZJ.js";import{r as u,t as d}from"../media-embeds-h4FUltIX.js";var f=new URLSearchParams(window.location.search).get(`slug`),p=e();f?m(f):b(`글을 찾을 수 없습니다.`,`Post not found`);async function m(e){try{y(e);let i=await n(e,p);if(i.status!==`published`&&!p){b(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${i.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${l(i.title)}</b> · 단일 글 페이지`;let o=p?await r([i.id]):{};p&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            현재 글 조회수 <span class="post-view-count">${v(o[i.id])}</span> ·
                            <a href="../admin/posts.html?id=${i.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await a(i.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+s(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),t(),window.location.reload()})),g(i,o[i.id]),p||h(i)}catch(e){b(s(e),`Post not found`)}}function h(e){let t=()=>{o(e).catch(e=>{console.warn(`Post view count failed:`,s(e))})};if(window.__coldwaterkimEntryAdmitted===!0||document.documentElement.dataset.entryAdmitted===`true`){t();return}window.addEventListener(`coldwaterkim:entry-admitted`,t,{once:!0})}function g(e,t=null){let n=document.getElementById(`post-timeline`);n.innerHTML=_(e,t),d(n)}function _(e,t=null){let n=c(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,a=p?` · 조회수 <span class="post-view-count">${v(t)}</span>`:``;return`
                <article class="timeline-post" data-post-id="${e.id}">
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${l(e.title||`Untitled`)}</a>${r}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${i(n)}
                            ${a}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${u(e.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function v(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function y(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function b(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${l(e)}</p>`}