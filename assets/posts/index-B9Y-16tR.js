/* empty css                */import{c as e,n as t,p as n,s as r}from"../pb-jiI6snNn.js";var i=10;window.goToPage=s;async function a(a=1){let s=document.getElementById(`posts-list`);s.innerHTML=`<tr><td colspan="2">불러오는 중...</td></tr>`;try{let t=await n(a,i);if(t.items.length===0){s.innerHTML=`<tr><td colspan="2">아직 발행된 글이 없습니다.</td></tr>`;return}s.innerHTML=t.items.map(t=>{let n=t.published_at||t.created;return`
            <tr>
              <td><a href="view.html?slug=${t.slug}">${r(t.title)}</a></td>
              <td align="center">${e(n)}</td>
            </tr>
          `}).join(``),o(t.totalPages,a)}catch(e){s.innerHTML=`<tr><td colspan="2">${r(t(e))}</td></tr>`}}function o(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n++)n===t?r+=`<b>${n}</b> `:r+=`<a href="javascript:void(0)" onclick="goToPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function s(e){a(e)}a();