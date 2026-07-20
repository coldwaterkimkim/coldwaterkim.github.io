import{C as e,G as t,H as n,L as r,M as i,Q as a,g as o,r as s,v as c,y as l}from"../pb-cvsptIAI.js";import"../site-BIsMVvW0.js";var u=1,d=10,f=n();window.goToPage=v,window.deleteOwnerPost=g,f&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),t(),window.location.reload()}));async function p(t=1){let n=document.getElementById(`posts-list`);n.innerHTML=`<tr><td colspan="${m()}">불러오는 중...</td></tr>`;try{let o=f?await e(t,d):await r(t,d);if(u=t,o.items.length===0){n.innerHTML=`<tr><td colspan="${m()}">아직 글이 없습니다.</td></tr>`;return}let s=f?await i(o.items.map(e=>e.id)):{};n.innerHTML=o.items.map(e=>{let t=a(e),n=e.status===`published`?``:` <small class="note">[초안]</small>`,r=f?`<td align="center" class="post-view-count">${h(s[e.id])}</td>`:``,i=f?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${e.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${e.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${c(e.title)}</a>${n}</td>
              <td align="center">${l(t)}</td>
              ${r}
              ${i}
            </tr>
          `}).join(``),_(o.totalPages,t)}catch(e){n.innerHTML=`<tr><td colspan="${m()}">${c(s(e))}</td></tr>`}}function m(){return f?4:2}function h(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}async function g(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await o(e),p(u)}catch(e){alert(`삭제 실패: `+s(e))}}function _(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function v(e){p(e)}p();