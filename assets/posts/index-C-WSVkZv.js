import{A as e,E as t,b as n,c as r,f as i,n as a,o,u as s,w as c}from"../pb-CrrKWHU8.js";import"../site-2Sn0TLyi.js";var l=1,u=10,d=c();window.goToPage=h,window.deleteOwnerPost=p,d&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),t(),window.location.reload()}));async function f(t=1){let o=document.getElementById(`posts-list`);o.innerHTML=`<tr><td colspan="3">불러오는 중...</td></tr>`;try{let a=d?await i(t,u):await n(t,u);if(l=t,a.items.length===0){o.innerHTML=`<tr><td colspan="3">아직 글이 없습니다.</td></tr>`;return}o.innerHTML=a.items.map(t=>{let n=e(t),i=t.status===`published`?``:` <small class="note">[초안]</small>`,a=d?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${t.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${t.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="view.html?slug=${t.slug}">${r(t.title)}</a>${i}</td>
              <td align="center">${s(n)}</td>
              ${a}
            </tr>
          `}).join(``),m(a.totalPages,t)}catch(e){o.innerHTML=`<tr><td colspan="3">${r(a(e))}</td></tr>`}}async function p(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await o(e),f(l)}catch(e){alert(`삭제 실패: `+a(e))}}function m(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function h(e){f(e)}f();