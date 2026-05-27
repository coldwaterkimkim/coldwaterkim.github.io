import{a as e,c as t,f as n,g as r,m as i,n as a,o,s}from"../pb-DsJnrek3.js";import"../site-CrdpBRcK.js";var c=1,l=10,u=i();window.goToPage=m,window.deleteOwnerPost=f,u&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),r(),window.location.reload()}));async function d(e=1){let r=document.getElementById(`posts-list`);r.innerHTML=`<tr><td colspan="3">불러오는 중...</td></tr>`;try{let i=u?await t(e,l):await n(e,l);if(c=e,i.items.length===0){r.innerHTML=`<tr><td colspan="3">아직 글이 없습니다.</td></tr>`;return}r.innerHTML=i.items.map(e=>{let t=e.published_at||e.created,n=e.status===`published`?``:` <small class="note">[초안]</small>`,r=u?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${e.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${e.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="view.html?slug=${e.slug}">${o(e.title)}</a>${n}</td>
              <td align="center">${s(t)}</td>
              ${r}
            </tr>
          `}).join(``),p(i.totalPages,e)}catch(e){r.innerHTML=`<tr><td colspan="3">${o(a(e))}</td></tr>`}}async function f(t){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await e(t),d(c)}catch(e){alert(`삭제 실패: `+a(e))}}function p(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function m(e){d(e)}d();