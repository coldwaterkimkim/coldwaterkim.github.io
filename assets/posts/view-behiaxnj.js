import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-Bsomhk8K.js";import{Ct as e,D as t,K as n,S as r,ct as i,dt as a,o,q as s,vt as c,w as l}from"../pb-KbECgTlc.js";import{a as u,n as d,s as f,t as p}from"../media-embeds-TJbdquAd.js";var m=new URLSearchParams(window.location.search),h=window.location.pathname.match(/^\/posts\/([^/]+)\/?$/)?.[1]||``,g=m.get(`slug`)||decodeURIComponent(h),_=i();g?v(g):w(`글을 찾을 수 없습니다.`,`Post not found`);async function v(e){try{C(e);let t=await n(e,_);if(t.status!==`published`&&!_){w(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${t.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${l(t.title)}</b> · 단일 글 페이지`;let i=_?await s([t.id]):{};_&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            현재 글 조회수 <span class="post-view-count">${S(i[t.id])}</span> ·
                            <a href="/admin/posts.html?id=${t.id}">현재 글 수정</a> ·
                            <a href="/admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await r(t.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+o(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),a(),window.location.reload()})),b(t,i[t.id]),_||y(t)}catch(e){w(o(e),`Post not found`)}}function y(t){let n=()=>{e(t).catch(e=>{console.warn(`Post view count failed:`,o(e))})};if(!(document.documentElement.classList.contains(`entry-gate-pending`)||document.documentElement.classList.contains(`entry-gate-open`))||window.__coldwaterkimEntryAdmitted===!0||document.documentElement.dataset.entryAdmitted===`true`){n();return}window.addEventListener(`coldwaterkim:entry-admitted`,n,{once:!0})}function b(e,t=null){let n=document.getElementById(`post-timeline`);n.innerHTML=x(e,t),p(n,e.id),d(n),f(n)}function x(e,n=null){let r=c(e),i=e.status===`published`?``:` <small class="note">[초안]</small>`,a=_?` · 조회수 <span class="post-view-count">${S(n)}</span>`:``;return`
                <article class="timeline-post" data-post-id="${e.id}">
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="/posts/${encodeURIComponent(e.slug||``)}/">${l(e.title||`Untitled`)}</a>${i}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${t(r)}
                            ${a}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${u(e.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function S(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function C(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function w(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${l(e)}</p>`}