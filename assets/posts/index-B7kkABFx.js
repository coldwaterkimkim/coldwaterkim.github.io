import{G as e,J as t,N as n,b as r,g as i,r as a,tt as o,v as s,w as c,z as l}from"../pb-CfOIkPGQ.js";import"../site-B-JC9vJj.js";var u=1,d=10,f=e();window.goToPage=v,window.deleteOwnerPost=g,f&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),t(),window.location.reload()}));async function p(e=1){let t=document.getElementById(`posts-list`);t.innerHTML=`<tr><td colspan="${m()}">불러오는 중...</td></tr>`;try{let i=f?await c(e,d):await l(e,d);if(u=e,i.items.length===0){t.innerHTML=`<tr><td colspan="${m()}">아직 글이 없습니다.</td></tr>`;return}let a=f?await n(i.items.map(e=>e.id)):{};t.innerHTML=i.items.map(e=>{let t=o(e),n=e.status===`published`?``:` <small class="note">[초안]</small>`,i=f?`<td align="center" class="post-view-count">${h(a[e.id])}</td>`:``,c=f?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${e.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${e.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="view.html?slug=${encodeURIComponent(e.slug||``)}">${s(e.title)}</a>${n}</td>
              <td align="center">${r(t)}</td>
              ${i}
              ${c}
            </tr>
          `}).join(``),_(i.totalPages,e)}catch(e){t.innerHTML=`<tr><td colspan="${m()}">${s(a(e))}</td></tr>`}}function m(){return f?4:2}function h(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}async function g(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await i(e),p(u)}catch(e){alert(`삭제 실패: `+a(e))}}function _(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function v(e){p(e)}p();