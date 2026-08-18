import"../modulepreload-polyfill-Dezn_h7o.js";import{P as e,a as t,at as n,ct as r,h as i,rt as a,w as o,x as s}from"../pb-BM5ATIiH.js";/* empty css               */n()||(window.location.replace(`/admin/login.html`),await new Promise(()=>{})),document.getElementById(`logoutBtn`).addEventListener(`click`,e=>{e.preventDefault(),r(),window.location.href=`/admin/login.html`});var c=1;window.confirmDelete=p,window.goToPage=f;function l(e,t){let n=document.getElementById(`alert`);n.textContent=e,n.className=`alert alert-${t}`,n.style.display=`block`,setTimeout(()=>n.style.display=`none`,5e3)}async function u(n=1){let r=document.querySelector(`#guestbookTable tbody`);r.innerHTML=`<tr><td colspan="4" class="loading">불러오는 중</td></tr>`;try{let t=await e(n,20);if(c=n,document.getElementById(`stats`).textContent=`전체 방명록 수: ${t.totalItems}개`,t.items.length===0){r.innerHTML=`<tr><td colspan="4">방명록이 비어있습니다.</td></tr>`;return}r.innerHTML=t.items.map(e=>`
          <tr>
            <td><b>${s(e.name)}</b></td>
            <td>${s(e.message)}</td>
            <td>${o(a(e))}</td>
            <td>
              <button class="btn btn-danger" onclick="confirmDelete('${e.id}')" style="padding: 4px 8px;">🗑️</button>
            </td>
          </tr>
        `).join(``),d(t.totalPages,n)}catch(e){r.innerHTML=`<tr><td colspan="4">불러오기 실패: `+t(e)+`</td></tr>`}}function d(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=``;for(let n=1;n<=e;n++)n===t?r+=`<span class="current">${n}</span>`:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a>`;n.innerHTML=r}function f(e){u(e)}async function p(e){if(confirm(`정말 이 방명록을 삭제하시겠습니까?`))try{await i(e),l(`방명록이 삭제되었습니다.`,`success`),u(c)}catch(e){l(`삭제 실패: `+t(e),`error`)}}u();