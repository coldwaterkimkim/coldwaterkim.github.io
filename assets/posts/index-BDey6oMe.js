import{I as e,T as t,c as n,f as r,h as i,j as a,k as o,n as s,u as c}from"../pb-CRPh0QTz.js";import"../site-XRIgoWjI.js";var l=1,u=10,d=o();window.goToPage=h,window.deleteOwnerPost=p,d&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),a(),window.location.reload()}));async function f(n=1){let a=document.getElementById(`posts-list`);a.innerHTML=`<tr><td colspan="3">불러오는 중...</td></tr>`;try{let o=d?await i(n,u):await t(n,u);if(l=n,o.items.length===0){a.innerHTML=`<tr><td colspan="3">아직 글이 없습니다.</td></tr>`;return}a.innerHTML=o.items.map(t=>{let n=e(t),i=t.status===`published`?``:` <small class="note">[초안]</small>`,a=d?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${t.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${t.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="view.html?slug=${t.slug}">${c(t.title)}</a>${i}</td>
              <td align="center">${r(n)}</td>
              ${a}
            </tr>
          `}).join(``),m(o.totalPages,n)}catch(e){a.innerHTML=`<tr><td colspan="3">${c(s(e))}</td></tr>`}}async function p(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await n(e),f(l)}catch(e){alert(`삭제 실패: `+s(e))}}function m(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function h(e){f(e)}f();