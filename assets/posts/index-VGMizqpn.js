import{H as e,R as t,W as n,Y as r,g as i,i as a,v as o,w as s,y as c}from"../pb-EGplk_ig.js";import"../site-DCZak0AF.js";var l=1,u=10,d=e();window.goToPage=h,window.deleteOwnerPost=p,d&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),n(),window.location.reload()}));async function f(e=1){let n=document.getElementById(`posts-list`);n.innerHTML=`<tr><td colspan="3">불러오는 중...</td></tr>`;try{let i=d?await s(e,u):await t(e,u);if(l=e,i.items.length===0){n.innerHTML=`<tr><td colspan="3">아직 글이 없습니다.</td></tr>`;return}n.innerHTML=i.items.map(e=>{let t=r(e),n=e.status===`published`?``:` <small class="note">[초안]</small>`,i=d?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${e.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${e.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="view.html?slug=${e.slug}">${o(e.title)}</a>${n}</td>
              <td align="center">${c(t)}</td>
              ${i}
            </tr>
          `}).join(``),m(i.totalPages,e)}catch(e){n.innerHTML=`<tr><td colspan="3">${o(a(e))}</td></tr>`}}async function p(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await i(e),f(l)}catch(e){alert(`삭제 실패: `+a(e))}}function m(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function h(e){f(e)}f();