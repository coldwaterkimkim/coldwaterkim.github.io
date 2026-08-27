import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-A7W--5uY.js";import{Ct as e,E as t,Z as n,_t as r,ct as i,ht as a,k as o,l as s,w as c,z as l}from"../pb-DMqTlCfb.js";import{n as u}from"../editor-publish-navigation-Bn3FTZ0G.js";var d=1,f=10,p=a();window.goToPage=y,window.deleteOwnerPost=_,p&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="/admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="/admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),r(),window.location.reload()}));async function m(r=1){let a=document.getElementById(`posts-list`);a.innerHTML=`<tr><td colspan="${h()}">불러오는 중...</td></tr>`;try{let s=p?await l(r,f):await i(r,f);if(d=r,s.items.length===0){a.innerHTML=`<tr><td colspan="${h()}">아직 글이 없습니다.</td></tr>`;return}let c=p?await n(s.items.map(e=>e.id)):{};a.innerHTML=s.items.map(n=>{let r=e(n),i=n.status===`published`?``:` <small class="note">[초안]</small>`,a=u(n,{ownerMode:p}),s=p?`<td align="center" class="post-view-count">${g(c[n.id])}</td>`:``,l=p?`<td class="owner-actions">
                <a class="owner-btn" href="/admin/posts.html?id=${n.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${n.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="${a}">${t(n.title)}</a>${i}</td>
              <td align="center">${o(r)}</td>
              ${s}
              ${l}
            </tr>
          `}).join(``),v(s.totalPages,r)}catch(e){a.innerHTML=`<tr><td colspan="${h()}">${t(s(e))}</td></tr>`}}function h(){return p?4:2}function g(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}async function _(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await c(e),m(d)}catch(e){alert(`삭제 실패: `+s(e))}}function v(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function y(e){m(e)}m();