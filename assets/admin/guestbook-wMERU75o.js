import{A as e,D as t,O as n,a as r,d as i,g as a,n as o,u as s}from"../pb-BpG7gW_X.js";/* empty css               */n()||(window.location.replace(`/admin/login.html`),await new Promise(()=>{})),document.getElementById(`logoutBtn`).addEventListener(`click`,t=>{t.preventDefault(),e(),window.location.href=`/admin/login.html`});var c=1;window.confirmDelete=p,window.goToPage=f;function l(e,t){let n=document.getElementById(`alert`);n.textContent=e,n.className=`alert alert-${t}`,n.style.display=`block`,setTimeout(()=>n.style.display=`none`,5e3)}async function u(e=1){let n=document.querySelector(`#guestbookTable tbody`);n.innerHTML=`<tr><td colspan="4" class="loading">불러오는 중</td></tr>`;try{let r=await a(e,20);if(c=e,document.getElementById(`stats`).textContent=`전체 방명록 수: ${r.totalItems}개`,r.items.length===0){n.innerHTML=`<tr><td colspan="4">방명록이 비어있습니다.</td></tr>`;return}n.innerHTML=r.items.map(e=>`
          <tr>
            <td><b>${s(e.name)}</b></td>
            <td>${s(e.message)}</td>
            <td>${i(t(e))}</td>
            <td>
              <button class="btn btn-danger" onclick="confirmDelete('${e.id}')" style="padding: 4px 8px;">🗑️</button>
            </td>
          </tr>
        `).join(``),d(r.totalPages,e)}catch(e){n.innerHTML=`<tr><td colspan="4">불러오기 실패: `+o(e)+`</td></tr>`}}function d(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=``;for(let n=1;n<=e;n++)n===t?r+=`<span class="current">${n}</span>`:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a>`;n.innerHTML=r}function f(e){u(e)}async function p(e){if(confirm(`정말 이 방명록을 삭제하시겠습니까?`))try{await r(e),l(`방명록이 삭제되었습니다.`,`success`),u(c)}catch(e){l(`삭제 실패: `+o(e),`error`)}}u();