import{A as e,O as t,P as n,c as r,d as i,m as a,n as o,u as s,w as c}from"../pb-BpG7gW_X.js";import"../site-Ru_1E4HZ.js";var l=1,u=10,d=t();window.goToPage=h,window.deleteOwnerPost=p,d&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,t=>{t.preventDefault(),e(),window.location.reload()}));async function f(e=1){let t=document.getElementById(`posts-list`);t.innerHTML=`<tr><td colspan="3">불러오는 중...</td></tr>`;try{let r=d?await a(e,u):await c(e,u);if(l=e,r.items.length===0){t.innerHTML=`<tr><td colspan="3">아직 글이 없습니다.</td></tr>`;return}t.innerHTML=r.items.map(e=>{let t=n(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,a=d?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${e.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${e.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="view.html?slug=${e.slug}">${s(e.title)}</a>${r}</td>
              <td align="center">${i(t)}</td>
              ${a}
            </tr>
          `}).join(``),m(r.totalPages,e)}catch(e){t.innerHTML=`<tr><td colspan="3">${s(o(e))}</td></tr>`}}async function p(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await r(e),f(l)}catch(e){alert(`삭제 실패: `+o(e))}}function m(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function h(e){f(e)}f();