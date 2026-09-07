import"../modulepreload-polyfill-Dezn_h7o.js";import{W as e,Y as t,b as n,j as r,l as i,m as a,q as o,v as s}from"../pb-BypsnA2H.js";/* empty css               */o()||(window.location.replace(`/admin/login.html`),await new Promise(()=>{})),document.getElementById(`logoutBtn`).addEventListener(`click`,e=>{e.preventDefault(),t(),window.location.href=`/admin/login.html`});var c=1;window.confirmDelete=p,window.goToPage=f;function l(e,t){let n=document.getElementById(`alert`);n.textContent=e,n.className=`alert alert-${t}`,n.style.display=`block`,setTimeout(()=>n.style.display=`none`,5e3)}async function u(t=1){let a=document.querySelector(`#guestbookTable tbody`);a.innerHTML=`<tr><td colspan="4" class="loading">불러오는 중</td></tr>`;try{let i=await r(t,20);if(c=t,document.getElementById(`stats`).textContent=`전체 방명록 수: ${i.totalItems}개`,i.items.length===0){a.innerHTML=`<tr><td colspan="4">방명록이 비어있습니다.</td></tr>`;return}a.innerHTML=i.items.map(t=>`
          <tr>
            <td><b>${s(t.name)}</b></td>
            <td>${s(t.message)}</td>
            <td>${n(e(t))}</td>
            <td>
              <button class="btn btn-danger" onclick="confirmDelete('${t.id}')" style="padding: 4px 8px;">🗑️</button>
            </td>
          </tr>
        `).join(``),d(i.totalPages,t)}catch(e){a.innerHTML=`<tr><td colspan="4">불러오기 실패: `+i(e)+`</td></tr>`}}function d(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=``;for(let n=1;n<=e;n++)n===t?r+=`<span class="current">${n}</span>`:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a>`;n.innerHTML=r}function f(e){u(e)}async function p(e){if(confirm(`정말 이 방명록을 삭제하시겠습니까?`))try{await a(e),l(`방명록이 삭제되었습니다.`,`success`),u(c)}catch(e){l(`삭제 실패: `+i(e),`error`)}}u();