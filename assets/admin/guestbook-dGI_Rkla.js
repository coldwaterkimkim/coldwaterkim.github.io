import{_ as e,c as t,h as n,i as r,n as i,s as a,u as o}from"../pb-jiI6snNn.js";/* empty css               */n()||(window.location.replace(`/admin/login.html`),await new Promise(()=>{})),document.getElementById(`logoutBtn`).addEventListener(`click`,t=>{t.preventDefault(),e(),window.location.href=`/admin/login.html`});var s=1;window.confirmDelete=f,window.goToPage=d;function c(e,t){let n=document.getElementById(`alert`);n.textContent=e,n.className=`alert alert-${t}`,n.style.display=`block`,setTimeout(()=>n.style.display=`none`,5e3)}async function l(e=1){let n=document.querySelector(`#guestbookTable tbody`);n.innerHTML=`<tr><td colspan="4" class="loading">불러오는 중</td></tr>`;try{let r=await o(e,20);if(s=e,document.getElementById(`stats`).textContent=`전체 방명록 수: ${r.totalItems}개`,r.items.length===0){n.innerHTML=`<tr><td colspan="4">방명록이 비어있습니다.</td></tr>`;return}n.innerHTML=r.items.map(e=>`
          <tr>
            <td><b>${a(e.name)}</b></td>
            <td>${a(e.message)}</td>
            <td>${t(e.created)}</td>
            <td>
              <button class="btn btn-danger" onclick="confirmDelete('${e.id}')" style="padding: 4px 8px;">🗑️</button>
            </td>
          </tr>
        `).join(``),u(r.totalPages,e)}catch(e){n.innerHTML=`<tr><td colspan="4">불러오기 실패: `+i(e)+`</td></tr>`}}function u(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=``;for(let n=1;n<=e;n++)n===t?r+=`<span class="current">${n}</span>`:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a>`;n.innerHTML=r}function d(e){l(e)}async function f(e){if(confirm(`정말 이 방명록을 삭제하시겠습니까?`))try{await r(e),c(`방명록이 삭제되었습니다.`,`success`),l(s)}catch(e){c(`삭제 실패: `+i(e),`error`)}}l();