import{$ as e,C as t,I as n,K as r,Y as i,b as a,c as o,l as s,r as c,v as l}from"../pb-UUPSdoxh.js";import"../site-DoPvrf4n.js";var u=null,d=[],f=10,p=r();window.goToDailyPage=y,p&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`daily-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/daily.html?new=1">새 나으 하루 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),i(),window.location.reload()})),document.getElementById(`prevMonthButton`).addEventListener(`click`,()=>{u=x(u,-1),g()}),document.getElementById(`nextMonthButton`).addEventListener(`click`,()=>{u=x(u,1),g()});async function m(r=1){let i=document.getElementById(`daily-list`);i.innerHTML=`<tr><td colspan="${_()}">불러오는 중...</td></tr>`;try{let s=p?await t():await n(),c=h(s),l=Math.ceil(c.length/f),m=c.slice((r-1)*f,r*f);if(d=s,u||=b(o(s[0])||e(new Date)),g(),m.length===0){i.innerHTML=`<tr><td colspan="${_()}">아직 나으 하루가 없습니다.</td></tr>`,v(0,r);return}i.innerHTML=m.map(e=>{let t=p?`<td class="owner-actions">
                <a class="owner-btn" href="view.html?day=${encodeURIComponent(e.dayKey)}">보기</a>
                <a class="owner-btn" href="../admin/daily.html?new=1">추가</a>
              </td>`:``;return`
            <tr>
              <td>
                <a href="view.html?day=${encodeURIComponent(e.dayKey)}">${a(e.dayKey)}의 하루</a>
                <div class="daily-list-meta">기록 ${e.entries.length}개 · updated ${a(e.latestDate)}</div>
              </td>
              <td align="center">${a(e.dayKey)}</td>
              ${t}
            </tr>
          `}).join(``),v(l,r)}catch(e){i.innerHTML=`<tr><td colspan="${_()}">${l(c(e))}</td></tr>`,document.getElementById(`daily-calendar-body`).innerHTML=`<tr><td colspan="7">${l(c(e))}</td></tr>`}}function h(e=[]){let t=new Map;return e.forEach(e=>{let n=o(e);t.has(n)||t.set(n,{dayKey:n,entries:[],latestDate:s(e)});let r=t.get(n);r.entries.push(e),w(s(e))>w(r.latestDate)&&(r.latestDate=s(e))}),Array.from(t.values()).sort((e,t)=>{let n=String(t.dayKey).localeCompare(String(e.dayKey));return n===0?w(t.latestDate)-w(e.latestDate):n})}function g(){let t=document.getElementById(`daily-calendar-body`),n=document.getElementById(`calendarMonthLabel`);if(!u)return;let r=new Map;d.forEach(e=>{let t=o(e);r.has(t)||r.set(t,[]),r.get(t).push(e)});let{year:i,monthIndex:a}=u,s=e(new Date),c=new Date(i,a,1).getDay(),l=new Date(i,a+1,0).getDate(),f=[];for(let e=0;e<c;e+=1)f.push(`<td class="daily-calendar-empty">&nbsp;</td>`);for(let e=1;e<=l;e+=1){let t=S(i,a,e),n=r.get(t)||[],o=n[0],c=[`daily-calendar-day`,n.length?`daily-calendar-day--has-entry`:``,t===s?`daily-calendar-day--today`:``].filter(Boolean).join(` `);f.push(`
          <td class="${c}">
            ${o?`<a href="view.html?day=${encodeURIComponent(t)}"><b>${e}</b></a><br><span class="daily-calendar-mark">기록 ${n.length}개</span>`:`<span>${e}</span>`}
          </td>
        `)}for(;f.length%7!=0;)f.push(`<td class="daily-calendar-empty">&nbsp;</td>`);n.textContent=`${i}.${String(a+1).padStart(2,`0`)}`,t.innerHTML=C(f,7).map(e=>`<tr>${e.join(``)}</tr>`).join(``)}function _(){return p?3:2}function v(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n+=1)r+=n===t?`<b>${n}</b> `:`<a href="javascript:void(0)" onclick="goToDailyPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function y(e){m(e)}function b(t){let[n,r]=e(t).split(`-`).map(Number);return{year:n,monthIndex:r-1}}function x(e,t){let n=new Date(e.year,e.monthIndex+t,1);return{year:n.getFullYear(),monthIndex:n.getMonth()}}function S(e,t,n){return`${e}-${String(t+1).padStart(2,`0`)}-${String(n).padStart(2,`0`)}`}function C(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}function w(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}m();