import{$ as e,C as t,K as n,L as r,M as i,U as a,g as o,r as s,v as c,y as l}from"../pb-CzcZ7ROJ.js";import"../site-DjOpJTYZ.js";var u=1,d=10,f=a();window.goToPage=v,window.deleteOwnerPost=g,f&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),n(),window.location.reload()}));async function p(n=1){let a=document.getElementById(`posts-list`);a.innerHTML=`<tr><td colspan="${m()}">불러오는 중...</td></tr>`;try{let o=f?await t(n,d):await r(n,d);if(u=n,o.items.length===0){a.innerHTML=`<tr><td colspan="${m()}">아직 글이 없습니다.</td></tr>`;return}let s=f?await i(o.items.map(e=>e.id)):{};a.innerHTML=o.items.map(t=>{let n=e(t),r=t.status===`published`?``:` <small class="note">[초안]</small>`,i=f?`<td align="center" class="post-view-count">${h(s[t.id])}</td>`:``,a=f?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${t.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${t.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="view.html?slug=${encodeURIComponent(t.slug||``)}">${c(t.title)}</a>${r}</td>
              <td align="center">${l(n)}</td>
              ${i}
              ${a}
            </tr>
          `}).join(``),_(o.totalPages,n)}catch(e){a.innerHTML=`<tr><td colspan="${m()}">${c(s(e))}</td></tr>`}}function m(){return f?4:2}function h(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}async function g(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await o(e),p(u)}catch(e){alert(`삭제 실패: `+s(e))}}function _(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function v(e){p(e)}p();