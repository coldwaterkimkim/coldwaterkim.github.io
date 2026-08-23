import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-DY6P_V2h.js";import{H as e,Y as t,a as n,j as r,ot as i,pt as a,rt as o,w as s,x as c,y as l}from"../pb-0R5qcpJ9.js";import{n as u}from"../editor-publish-navigation-C4m2O0q3.js";var d=1,f=10,p=o();window.goToPage=y,window.deleteOwnerPost=_,p&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="/admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="/admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),i(),window.location.reload()}));async function m(i=1){let o=document.getElementById(`posts-list`);o.innerHTML=`<tr><td colspan="${h()}">불러오는 중...</td></tr>`;try{let n=p?await r(i,f):await t(i,f);if(d=i,n.items.length===0){o.innerHTML=`<tr><td colspan="${h()}">아직 글이 없습니다.</td></tr>`;return}let l=p?await e(n.items.map(e=>e.id)):{};o.innerHTML=n.items.map(e=>{let t=a(e),n=e.status===`published`?``:` <small class="note">[초안]</small>`,r=u(e,{ownerMode:p}),i=p?`<td align="center" class="post-view-count">${g(l[e.id])}</td>`:``,o=p?`<td class="owner-actions">
                <a class="owner-btn" href="/admin/posts.html?id=${e.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${e.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="${r}">${c(e.title)}</a>${n}</td>
              <td align="center">${s(t)}</td>
              ${i}
              ${o}
            </tr>
          `}).join(``),v(n.totalPages,i)}catch(e){o.innerHTML=`<tr><td colspan="${h()}">${c(n(e))}</td></tr>`}}function h(){return p?4:2}function g(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}async function _(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await l(e),m(d)}catch(e){alert(`삭제 실패: `+n(e))}}function v(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function y(e){m(e)}m();