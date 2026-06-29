import{A as e,V as t,W as n,Z as r,g as i,j as a,nt as o,r as s,v as c,y as l}from"../pb-C-i25jnJ.js";import"../site-DesET0dC.js";import{t as u}from"../media-embeds-C5gWzuu7.js";var d=new URLSearchParams(window.location.search).get(`slug`),f=t();d?p(d):v(`글을 찾을 수 없습니다.`,`Post not found`);async function p(t){try{_(t);let r=await e(t,f);if(r.status!==`published`&&!f){v(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${r.title} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=`글방`,document.getElementById(`timeline-note`).innerHTML=`<b>${c(r.title)}</b> · 단일 글 페이지`;let l=f?await a([r.id]):{};f&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            현재 글 조회수 <span class="post-view-count">${g(l[r.id])}</span> ·
                            <a href="../admin/posts.html?id=${r.id}">현재 글 수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">현재 글 삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await i(r.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+s(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),n(),window.location.reload()})),m(r,l[r.id]),f||o(r).catch(e=>{console.warn(`Post view count failed:`,s(e))})}catch(e){v(s(e),`Post not found`)}}function m(e,t=null){let n=document.getElementById(`post-timeline`);n.innerHTML=h(e,t),u(n)}function h(e,t=null){let n=r(e),i=e.status===`published`?``:` <small class="note">[초안]</small>`,a=f?` · 조회수 <span class="post-view-count">${g(t)}</span>`:``;return`
                <article class="timeline-post" data-post-id="${e.id}">
                    <div class="timeline-post-header">
                        <h2 class="timeline-post-title">
                            <a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${c(e.title||`Untitled`)}</a>${i}
                        </h2>
                        <div class="timeline-post-meta">
                            Published: ${l(n)}
                            ${a}
                        </div>
                    </div>
                    <div class="post-content timeline-post-content ql-editor">
                        ${e.content||`<p>내용이 없습니다.</p>`}
                    </div>
                </article>
            `}function g(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function _(e){let t=document.querySelector(`.secret-login`);if(!t)return;let n=`/posts/view.html?slug=${encodeURIComponent(e)}`;t.href=`/admin/login.html?next=${encodeURIComponent(n)}`}function v(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`timeline-title`).textContent=t,document.getElementById(`timeline-note`).textContent=``,document.getElementById(`post-timeline`).innerHTML=`<p>${c(e)}</p>`}