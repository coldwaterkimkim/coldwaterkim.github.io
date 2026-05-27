import{_ as e,a as t,d as n,g as r,m as i,n as a,o,s}from"../pb-DsJnrek3.js";import"../site-CrdpBRcK.js";var c=new URLSearchParams(window.location.search).get(`slug`);c?l(c):u(`글을 찾을 수 없습니다.`,`Post not found`);async function l(o){try{let c=await n(o,i());if(c.status!==`published`&&!i()){u(`이 글은 아직 발행되지 않았습니다.`,`Not published`);return}document.title=`${c.title} — coldwaterkim`,document.getElementById(`post-title`).textContent=c.title;let l=c.published_at||c.created;if(document.getElementById(`post-date`).textContent=`Published: ${s(l)}`,i()&&(document.getElementById(`owner-tools`).innerHTML=`
                        <div class="owner-bar">
                            <b>OWNER MODE</b> ·
                            <a href="../admin/posts.html?id=${c.id}">수정</a> ·
                            <a href="../admin/posts.html?new=1">새 글</a> ·
                            <a href="#" id="deletePostLink">삭제</a> ·
                            <a href="#" id="logoutLink">로그아웃</a>
                        </div>
                    `,document.getElementById(`deletePostLink`).addEventListener(`click`,async e=>{if(e.preventDefault(),confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await t(c.id),window.location.href=`index.html`}catch(e){alert(`삭제 실패: `+a(e))}}),document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),r(),window.location.reload()})),c.featured_image){let t=e.files.getURL(c,c.featured_image);document.getElementById(`featured-image`).innerHTML=`
            <img src="${t}" alt="${c.title}" style="max-width: 100%; margin-bottom: 16px;">
          `}document.getElementById(`post-content`).innerHTML=c.content||`<p>내용이 없습니다.</p>`}catch(e){u(a(e),`Post not found`)}}function u(e,t){document.title=`${t} — coldwaterkim`,document.getElementById(`post-title`).textContent=t,document.getElementById(`post-date`).textContent=``,document.getElementById(`post-content`).innerHTML=`<p>${o(e)}</p>`}