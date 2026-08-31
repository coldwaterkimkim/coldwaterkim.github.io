import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-RdzMK2Zk.js";import{E as e,Q as t,gt as n,k as r,l as i,lt as a,vt as o,w as s,wt as c,z as l}from"../pb-DkqvpIev.js";import{n as u}from"../editor-publish-navigation-Bn3FTZ0G.js";var d=1,f=10,p=n();window.goToPage=y,window.deleteOwnerPost=_,p&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`posts-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="/admin/posts.html?new=1">새 글 쓰기</a> ·
          <a href="/admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),o(),window.location.reload()}));async function m(n=1){let o=document.getElementById(`posts-list`);o.innerHTML=`<tr><td colspan="${h()}">불러오는 중...</td></tr>`;try{let i=p?await l(n,f):await a(n,f);if(d=n,i.items.length===0){o.innerHTML=`<tr><td colspan="${h()}">아직 글이 없습니다.</td></tr>`;return}let s=p?await t(i.items.map(e=>e.id)):{};o.innerHTML=i.items.map(t=>{let n=c(t),i=t.status===`published`?``:` <small class="note">[초안]</small>`,a=u(t,{ownerMode:p}),o=p?`<td align="center" class="post-view-count">${g(s[t.id])}</td>`:``,l=p?`<td class="owner-actions">
                <a class="owner-btn" href="/admin/posts.html?id=${t.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerPost('${t.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td><a href="${a}">${e(t.title)}</a>${i}</td>
              <td align="center">${r(n)}</td>
              ${o}
              ${l}
            </tr>
          `}).join(``),v(i.totalPages,n)}catch(t){o.innerHTML=`<tr><td colspan="${h()}">${e(i(t))}</td></tr>`}}function h(){return p?4:2}function g(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}async function _(e){if(confirm(`이 글을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await s(e),m(d)}catch(e){alert(`삭제 실패: `+i(e))}}function v(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function y(e){m(e)}m();