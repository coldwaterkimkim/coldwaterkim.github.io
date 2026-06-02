import{c as e,d as t,n,o as r,r as i,v as a,x as o,y as s}from"../pb-CvlYrerP.js";/* empty css               */s()||(window.location.replace(`/admin/login.html`),await new Promise(()=>{})),document.getElementById(`logoutBtn`).addEventListener(`click`,e=>{e.preventDefault(),o(),window.location.href=`/admin/login.html`});var c=1;window.confirmDelete=p,window.goToPage=f;function l(e,t){let n=document.getElementById(`alert`);n.textContent=e,n.className=`alert alert-${t}`,n.style.display=`block`,setTimeout(()=>n.style.display=`none`,5e3)}async function u(i=1){let o=document.querySelector(`#guestbookTable tbody`);o.innerHTML=`<tr><td colspan="4" class="loading">불러오는 중</td></tr>`;try{let n=await t(i,20);if(c=i,document.getElementById(`stats`).textContent=`전체 방명록 수: ${n.totalItems}개`,n.items.length===0){o.innerHTML=`<tr><td colspan="4">방명록이 비어있습니다.</td></tr>`;return}o.innerHTML=n.items.map(t=>`
          <tr>
            <td><b>${r(t.name)}</b></td>
            <td>${r(t.message)}</td>
            <td>${e(a(t))}</td>
            <td>
              <button class="btn btn-danger" onclick="confirmDelete('${t.id}')" style="padding: 4px 8px;">🗑️</button>
            </td>
          </tr>
        `).join(``),d(n.totalPages,i)}catch(e){o.innerHTML=`<tr><td colspan="4">불러오기 실패: `+n(e)+`</td></tr>`}}function d(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=``;for(let n=1;n<=e;n++)n===t?r+=`<span class="current">${n}</span>`:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a>`;n.innerHTML=r}function f(e){u(e)}async function p(e){if(confirm(`정말 이 방명록을 삭제하시겠습니까?`))try{await i(e),l(`방명록이 삭제되었습니다.`,`success`),u(c)}catch(e){l(`삭제 실패: `+n(e),`error`)}}u();