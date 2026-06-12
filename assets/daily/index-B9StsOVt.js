import{K as e,N as t,P as n,U as r,X as i,b as a,c as o,f as s,l as c,r as l,v as u,x as d,y as f}from"../pb-DICpD8mJ.js";import"../site-HfHz-Ie8.js";var p=1,m=null,h=[],g=10,_=r();window.goToDailyPage=S,window.deleteOwnerDailyEntry=b,_&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`daily-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/daily.html?new=1">새 나으 하루 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,t=>{t.preventDefault(),e(),window.location.reload()})),document.getElementById(`prevMonthButton`).addEventListener(`click`,()=>{m=w(m,-1),y()}),document.getElementById(`nextMonthButton`).addEventListener(`click`,()=>{m=w(m,1),y()});async function v(e=1){let r=document.getElementById(`daily-list`);r.innerHTML=`<tr><td colspan="3">불러오는 중...</td></tr>`;try{let[s,l]=await Promise.all([_?a(e,g):t(e,g),_?d():n()]);if(p=e,h=l,m||=C(o(l[0])||i(new Date)),y(),s.items.length===0){r.innerHTML=`<tr><td colspan="3">아직 나으 하루가 없습니다.</td></tr>`,x(0,e);return}r.innerHTML=s.items.map(e=>{let t=o(e),n=e.status===`published`?``:` <small class="note">[초안]</small>`,r=_?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/daily.html?id=${e.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerDailyEntry('${e.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td>
                <a href="view.html?slug=${encodeURIComponent(e.slug||t)}">${u(e.title||`${t} 나으 하루`)}</a>${n}
                <div class="daily-list-meta">updated ${f(e.updated||c(e))}</div>
              </td>
              <td align="center">${f(c(e))}</td>
              ${r}
            </tr>
          `}).join(``),x(s.totalPages,e)}catch(e){r.innerHTML=`<tr><td colspan="3">${u(l(e))}</td></tr>`,document.getElementById(`daily-calendar-body`).innerHTML=`<tr><td colspan="7">${u(l(e))}</td></tr>`}}function y(){let e=document.getElementById(`daily-calendar-body`),t=document.getElementById(`calendarMonthLabel`);if(!m)return;let n=new Map;h.forEach(e=>{let t=o(e);n.has(t)||n.set(t,[]),n.get(t).push(e)});let{year:r,monthIndex:a}=m,s=i(new Date),c=new Date(r,a,1).getDay(),l=new Date(r,a+1,0).getDate(),u=[];for(let e=0;e<c;e+=1)u.push(`<td class="daily-calendar-empty">&nbsp;</td>`);for(let e=1;e<=l;e+=1){let t=T(r,a,e),i=n.get(t)||[],o=i[0],c=[`daily-calendar-day`,i.length?`daily-calendar-day--has-entry`:``,t===s?`daily-calendar-day--today`:``].filter(Boolean).join(` `);u.push(`
          <td class="${c}">
            ${o?`<a href="view.html?slug=${encodeURIComponent(o.slug||t)}"><b>${e}</b></a><br><span class="daily-calendar-mark">기록 ${i.length>1?`${i.length}개`:`있음`}</span>`:`<span>${e}</span>`}
          </td>
        `)}for(;u.length%7!=0;)u.push(`<td class="daily-calendar-empty">&nbsp;</td>`);t.textContent=`${r}.${String(a+1).padStart(2,`0`)}`,e.innerHTML=E(u,7).map(e=>`<tr>${e.join(``)}</tr>`).join(``)}async function b(e){if(confirm(`이 하루 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await s(e),v(p)}catch(e){alert(`삭제 실패: `+l(e))}}function x(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n+=1)r+=n===t?`<b>${n}</b> `:`<a href="javascript:void(0)" onclick="goToDailyPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function S(e){v(e)}function C(e){let[t,n]=i(e).split(`-`).map(Number);return{year:t,monthIndex:n-1}}function w(e,t){let n=new Date(e.year,e.monthIndex+t,1);return{year:n.getFullYear(),monthIndex:n.getMonth()}}function T(e,t,n){return`${e}-${String(t+1).padStart(2,`0`)}-${String(n).padStart(2,`0`)}`}function E(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}v();