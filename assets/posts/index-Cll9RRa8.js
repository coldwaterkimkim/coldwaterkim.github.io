import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-Oq5f-W7k.js";import{A as e,C as t,Y as n,a as r,b as i,ot as a,pt as o,rt as s,v as c,z as l}from"../pb-yXaCmYDJ.js";import{n as u}from"../editor-publish-navigation-C4m2O0q3.js";var d=1,f=10,p=s();window.goToPage=y,window.deleteOwnerPost=_,p&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),a(),window.location.reload()}));async function m(a=1){let s=document.getElementById(`posts-list`);s.innerHTML=`<tr><td colspan="${h()}">불러오는 중...</td></tr>`;try{let r=p?await e(a,f):await n(a,f);if(d=a,r.items.length===0){s.innerHTML=`<tr><td colspan="${h()}">아직 글이 없습니다.</td></tr>`;return}let c=p?await l(r.items.map(e=>e.id)):{};s.innerHTML=r.items.map(e=>{let n=o(e),r=e.status===`published`?``:` <small class="note">[초안]</small>`,a=u(e,{ownerMode:p}),s=p?`<td align="center" class="post-view-count">${g(c[e.id])}</td>`:``,l=p?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/posts.html?id=${e.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${e.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="${a}">${i(e.title)}</a>${r}</td>
              <td align="center">${t(n)}</td>
              ${s}
              ${l}
            </tr>
          `}).join(``),v(r.totalPages,a)}catch(e){s.innerHTML=`<tr><td colspan="${h()}">${i(r(e))}</td></tr>`}}function h(){return p?4:2}function g(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}async function _(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await c(e),m(d)}catch(e){alert(`삭제 실패: `+r(e))}}function v(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function y(e){m(e)}m();