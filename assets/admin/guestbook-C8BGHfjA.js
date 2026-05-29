import{_ as e,c as t,g as n,n as r,o as i,r as a,u as o,y as s}from"../pb-CirAqrGl.js";/* empty css               */e()||(window.location.replace(`/admin/login.html`),await new Promise(()=>{})),document.getElementById(`logoutBtn`).addEventListener(`click`,e=>{e.preventDefault(),s(),window.location.href=`/admin/login.html`});var c=1;window.confirmDelete=p,window.goToPage=f;function l(e,t){let n=document.getElementById(`alert`);n.textContent=e,n.className=`alert alert-${t}`,n.style.display=`block`,setTimeout(()=>n.style.display=`none`,5e3)}async function u(e=1){let a=document.querySelector(`#guestbookTable tbody`);a.innerHTML=`<tr><td colspan="4" class="loading">불러오는 중</td></tr>`;try{let r=await o(e,20);if(c=e,document.getElementById(`stats`).textContent=`전체 방명록 수: ${r.totalItems}개`,r.items.length===0){a.innerHTML=`<tr><td colspan="4">방명록이 비어있습니다.</td></tr>`;return}a.innerHTML=r.items.map(e=>`
          <tr>
            <td><b>${i(e.name)}</b></td>
            <td>${i(e.message)}</td>
            <td>${t(n(e))}</td>
            <td>
              <button class="btn btn-danger" onclick="confirmDelete('${e.id}')" style="padding: 4px 8px;">🗑️</button>
            </td>
          </tr>
        `).join(``),d(r.totalPages,e)}catch(e){a.innerHTML=`<tr><td colspan="4">불러오기 실패: `+r(e)+`</td></tr>`}}function d(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=``;for(let n=1;n<=e;n++)n===t?r+=`<span class="current">${n}</span>`:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a>`;n.innerHTML=r}function f(e){u(e)}async function p(e){if(confirm(`정말 이 방명록을 삭제하시겠습니까?`))try{await a(e),l(`방명록이 삭제되었습니다.`,`success`),u(c)}catch(e){l(`삭제 실패: `+r(e),`error`)}}u();