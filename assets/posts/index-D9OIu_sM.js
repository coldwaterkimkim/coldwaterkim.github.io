import{C as e,I as t,V as n,W as r,Z as i,g as a,j as o,r as s,v as c,y as l}from"../pb-qCP2p06G.js";import"../site-BJI4wsm8.js";var u=1,d=10,f=n();window.goToPage=v,window.deleteOwnerPost=g,f&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),r(),window.location.reload()}));async function p(n=1){let r=document.getElementById(`posts-list`);r.innerHTML=`<tr><td colspan="${m()}">불러오는 중...</td></tr>`;try{let a=f?await e(n,d):await t(n,d);if(u=n,a.items.length===0){r.innerHTML=`<tr><td colspan="${m()}">아직 글이 없습니다.</td></tr>`;return}let s=f?await o(a.items.map(e=>e.id)):{};r.innerHTML=a.items.map(e=>{let t=i(e),n=e.status===`published`?``:` <small class="note">[초안]</small>`,r=f?`<td align="center" class="post-view-count">${h(s[e.id])}</td>`:``,a=f?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${e.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${e.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${c(e.title)}</a>${n}</td>
              <td align="center">${l(t)}</td>
              ${r}
              ${a}
            </tr>
          `}).join(``),_(a.totalPages,n)}catch(e){r.innerHTML=`<tr><td colspan="${m()}">${c(s(e))}</td></tr>`}}function m(){return f?4:2}function h(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}async function g(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await a(e),p(u)}catch(e){alert(`삭제 실패: `+s(e))}}function _(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function v(e){p(e)}p();