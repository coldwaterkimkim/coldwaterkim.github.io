import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-A7W--5uY.js";import{Ct as e,E as t,Tt as n,X as r,Z as i,_t as a,ht as o,k as s,l as c,w as l}from"../pb-DMqTlCfb.js";import{a as u,n as d,s as f,t as p}from"../media-embeds-TJbdquAd.js";var m=new URLSearchParams(window.location.search),h=window.location.pathname.match(/^\/posts\/([^/]+)\/?$/)?.[1]||``,g=m.get(`slug`)||decodeURIComponent(h),_=o();g?v(g):w(`글을 찾을 수 없습니다.`,`Post not found`);async function v(e){try{C(e);let n=await r(e,_);if(n.status!==`published`&&!_){w(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${n.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${t(n.title)}</b> · 단일 글 페이지`;let o=_?await i([n.id]):{};_&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            현재 글 조회수 <span class="post-view-count">${S(o[n.id])}</span> ·
                            <a href="/admin/posts.html?id=${n.id}">현재 글 수정</a> ·
                            <a href="/admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await l(n.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+c(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),a(),window.location.reload()})),b(n,o[n.id]),_||y(n)}catch(e){w(c(e),`Post not found`)}}function y(e){let t=()=>{n(e).catch(e=>{console.warn(`Post view count failed:`,c(e))})};if(!(document.documentElement.classList.contains(`entry-gate-pending`)||document.documentElement.classList.contains(`entry-gate-open`))||window.__coldwaterkimEntryAdmitted===!0||document.documentElement.dataset.entryAdmitted===`true`){t();return}window.addEventListener(`coldwaterkim:entry-admitted`,t,{once:!0})}function b(e,t=null){let n=document.getElementById(`post-timeline`);n.innerHTML=x(e,t),p(n,e.id),d(n),f(n)}function x(n,r=null){let i=e(n),a=n.status===`published`?``:` <small class="note">[초안]</small>`,o=_?` · 조회수 <span class="post-view-count">${S(r)}</span>`:``;return`
                <article class="timeline-post" data-post-id="${n.id}">
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="/posts/${encodeURIComponent(n.slug||``)}/">${t(n.title||`Untitled`)}</a>${a}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${s(i)}
                            ${o}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${u(n.content||`<p>내용이 없습니다.</p>`)}
                    </div>
                </article>
            `}function S(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function C(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function w(e,n){document.title=`${n} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=n,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${t(e)}</p>`}