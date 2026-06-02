import{O as e,_ as t,a as n,f as r,j as i,k as a,n as o,u as s}from"../pb-CRPh0QTz.js";/* empty css               */a()||(window.location.replace(`/admin/login.html`),await new Promise(()=>{})),document.getElementById(`logoutBtn`).addEventListener(`click`,e=>{e.preventDefault(),i(),window.location.href=`/admin/login.html`});var c=1;window.confirmDelete=p,window.goToPage=f;function l(e,t){let n=document.getElementById(`alert`);n.textContent=e,n.className=`alert alert-${t}`,n.style.display=`block`,setTimeout(()=>n.style.display=`none`,5e3)}async function u(n=1){let i=document.querySelector(`#guestbookTable tbody`);i.innerHTML=`<tr><td colspan="4" class="loading">불러오는 중</td></tr>`;try{let a=await t(n,20);if(c=n,document.getElementById(`stats`).textContent=`전체 방명록 수: ${a.totalItems}개`,a.items.length===0){i.innerHTML=`<tr><td colspan="4">방명록이 비어있습니다.</td></tr>`;return}i.innerHTML=a.items.map(t=>`
          <tr>
            <td><b>${s(t.name)}</b></td>
            <td>${s(t.message)}</td>
            <td>${r(e(t))}</td>
            <td>
              <button class="btn btn-danger" onclick="confirmDelete('${t.id}')" style="padding: 4px 8px;">🗑️</button>
            </td>
          </tr>
        `).join(``),d(a.totalPages,n)}catch(e){i.innerHTML=`<tr><td colspan="4">불러오기 실패: `+o(e)+`</td></tr>`}}function d(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=``;for(let n=1;n<=e;n++)n===t?r+=`<span class="current">${n}</span>`:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a>`;n.innerHTML=r}function f(e){u(e)}async function p(e){if(confirm(`정말 이 방명록을 삭제하시겠습니까?`))try{await n(e),l(`방명록이 삭제되었습니다.`,`success`),u(c)}catch(e){l(`삭제 실패: `+o(e),`error`)}}u();