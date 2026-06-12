import{$ as e,K as t,R as n,U as r,g as i,r as a,v as o,w as s,y as c}from"../pb-DICpD8mJ.js";import"../site-CTZcziHx.js";var l=1,u=10,d=r();window.goToPage=h,window.deleteOwnerPost=p,d&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),t(),window.location.reload()}));async function f(t=1){let r=document.getElementById(`posts-list`);r.innerHTML=`<tr><td colspan="3">불러오는 중...</td></tr>`;try{let i=d?await s(t,u):await n(t,u);if(l=t,i.items.length===0){r.innerHTML=`<tr><td colspan="3">아직 글이 없습니다.</td></tr>`;return}r.innerHTML=i.items.map(t=>{let n=e(t),r=t.status===`published`?``:` <small class="note">[초안]</small>`,i=d?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${t.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${t.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="view.html?slug=${t.slug}">${o(t.title)}</a>${r}</td>
              <td align="center">${c(n)}</td>
              ${i}
            </tr>
          `}).join(``),m(i.totalPages,t)}catch(e){r.innerHTML=`<tr><td colspan="3">${o(a(e))}</td></tr>`}}async function p(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await i(e),f(l)}catch(e){alert(`삭제 실패: `+a(e))}}function m(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function h(e){f(e)}f();