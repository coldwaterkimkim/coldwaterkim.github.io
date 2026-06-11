import{F as e,G as t,I as n,S as r,U as i,b as a,i as o,l as s,p as c,q as l,u,x as d,y as f}from"../pb-BIchPP5n.js";import"../site-Dmd5ZFKW.js";var p=1,m=null,h=[],g=10,_=i();window.goToDailyPage=S,window.deleteOwnerDailyEntry=b,_&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`daily-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/daily.html?new=1">새 나으 하루 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),t(),window.location.reload()})),document.getElementById(`prevMonthButton`).addEventListener(`click`,()=>{m=w(m,-1),y()}),document.getElementById(`nextMonthButton`).addEventListener(`click`,()=>{m=w(m,1),y()});async function v(t=1){let i=document.getElementById(`daily-list`);i.innerHTML=`<tr><td colspan="3">불러오는 중...</td></tr>`;try{let[o,c]=await Promise.all([_?d(t,g):e(t,g),_?r():n()]);if(p=t,h=c,m||=C(s(c[0])||l(new Date)),y(),o.items.length===0){i.innerHTML=`<tr><td colspan="3">아직 나으 하루가 없습니다.</td></tr>`,x(0,t);return}i.innerHTML=o.items.map(e=>{let t=s(e),n=e.status===`published`?``:` <small class="note">[초안]</small>`,r=_?`<td class="owner-actions">
                <a class="owner-btn" href="../admin/daily.html?id=${e.id}">수정</a>
                <button class="owner-btn owner-btn-danger" type="button" onclick="deleteOwnerDailyEntry('${e.id}')">삭제</button>
              </td>`:``;return`
            <tr>
              <td>
                <a href="view.html?slug=${encodeURIComponent(e.slug||t)}">${f(e.title||`${t} 나으 하루`)}</a>${n}
                <div class="daily-list-meta">updated ${a(e.updated||u(e))}</div>
              </td>
              <td align="center">${a(u(e))}</td>
              ${r}
            </tr>
          `}).join(``),x(o.totalPages,t)}catch(e){i.innerHTML=`<tr><td colspan="3">${f(o(e))}</td></tr>`,document.getElementById(`daily-calendar-body`).innerHTML=`<tr><td colspan="7">${f(o(e))}</td></tr>`}}function y(){let e=document.getElementById(`daily-calendar-body`),t=document.getElementById(`calendarMonthLabel`);if(!m)return;let n=new Map;h.forEach(e=>{let t=s(e);n.has(t)||n.set(t,[]),n.get(t).push(e)});let{year:r,monthIndex:i}=m,a=l(new Date),o=new Date(r,i,1).getDay(),c=new Date(r,i+1,0).getDate(),u=[];for(let e=0;e<o;e+=1)u.push(`<td class="daily-calendar-empty">&nbsp;</td>`);for(let e=1;e<=c;e+=1){let t=T(r,i,e),o=n.get(t)||[],s=o[0],c=[`daily-calendar-day`,o.length?`daily-calendar-day--has-entry`:``,t===a?`daily-calendar-day--today`:``].filter(Boolean).join(` `);u.push(`
          <td class="${c}">
            ${s?`<a href="view.html?slug=${encodeURIComponent(s.slug||t)}"><b>${e}</b></a><br><span class="daily-calendar-mark">기록 있음</span>`:`<span>${e}</span>`}
          </td>
        `)}for(;u.length%7!=0;)u.push(`<td class="daily-calendar-empty">&nbsp;</td>`);t.textContent=`${r}.${String(i+1).padStart(2,`0`)}`,e.innerHTML=E(u,7).map(e=>`<tr>${e.join(``)}</tr>`).join(``)}async function b(e){if(confirm(`이 하루 기록을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`))try{await c(e),v(p)}catch(e){alert(`삭제 실패: `+o(e))}}function x(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n+=1)r+=n===t?`<b>${n}</b> `:`<a href="javascript:void(0)" onclick="goToDailyPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function S(e){v(e)}function C(e){let[t,n]=l(e).split(`-`).map(Number);return{year:t,monthIndex:n-1}}function w(e,t){let n=new Date(e.year,e.monthIndex+t,1);return{year:n.getFullYear(),monthIndex:n.getMonth()}}function T(e,t,n){return`${e}-${String(t+1).padStart(2,`0`)}-${String(n).padStart(2,`0`)}`}function E(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}v();