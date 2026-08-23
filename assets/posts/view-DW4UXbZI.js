import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-CgcJwe17.js";import{H as e,V as t,a as n,ot as r,pt as i,rt as a,vt as o,w as s,x as c,y as l}from"../pb-DDRU6IVh.js";import{a as u,n as d,s as f,t as p}from"../media-embeds-D2FHsf_r.js";var m=new URLSearchParams(window.location.search),h=window.location.pathname.match(/^\/posts\/([^/]+)\/?$/)?.[1]||``,g=m.get(`slug`)||decodeURIComponent(h),_=a();g?v(g):w(`글을 찾을 수 없습니다.`,`Post not found`);async function v(i){try{C(i);let a=await t(i,_);if(a.status!==`published`&&!_){w(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${a.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${c(a.title)}</b> · 단일 글 페이지`;let o=_?await e([a.id]):{};_&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            현재 글 조회수 <span class="post-view-count">${S(o[a.id])}</span> ·
                            <a href="/admin/posts.html?id=${a.id}">현재 글 수정</a> ·
                            <a href="/admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await l(a.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+n(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),r(),window.location.reload()})),b(a,o[a.id]),_||y(a)}catch(e){w(n(e),`Post not found`)}}function y(e){let t=()=>{o(e).catch(e=>{console.warn(`Post view count failed:`,n(e))})};if(!(document.documentElement.classList.contains(`entry-gate-pending`)||document.documentElement.classList.contains(`entry-gate-open`))||window.__coldwaterkimEntryAdmitted===!0||document.documentElement.dataset.entryAdmitted===`true`){t();return}window.addEventListener(`coldwaterkim:entry-admitted`,t,{once:!0})}function b(e,t=null){let n=document.getElementById(`post-timeline`);n.innerHTML=x(e,t),p(n,e.id),d(n),f(n)}function x(e,t=null){let n=i(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,a=_?` · 조회수 <span class="post-view-count">${S(t)}</span>`:``;return`
                <article class="timeline-post" data-post-id="${e.id}">
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="/posts/${encodeURIComponent(e.slug||``)}/">${c(e.title||`Untitled`)}</a>${r}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${s(n)}
                            ${a}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${u(e.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function S(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function C(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function w(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${c(e)}</p>`}