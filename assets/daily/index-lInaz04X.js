import{F as e,S as t,W as n,Z as r,b as i,c as a,l as o,q as s,r as c,v as l}from"../pb-Be3WJXcJ.js";import"../site-CGv3t_y3.js";var u=null,d=[],f=10,p=n();window.goToDailyPage=y,p&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`daily-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/daily.html?new=1">새 나으 하루 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),s(),window.location.reload()})),document.getElementById(`prevMonthButton`).addEventListener(`click`,()=>{u=x(u,-1),g()}),document.getElementById(`nextMonthButton`).addEventListener(`click`,()=>{u=x(u,1),g()});async function m(n=1){let o=document.getElementById(`daily-list`);o.innerHTML=`<tr><td colspan="${_()}">불러오는 중...</td></tr>`;try{let s=p?await t():await e(),c=h(s),l=Math.ceil(c.length/f),m=c.slice((n-1)*f,n*f);if(d=s,u||=b(a(s[0])||r(new Date)),g(),m.length===0){o.innerHTML=`<tr><td colspan="${_()}">아직 나으 하루가 없습니다.</td></tr>`,v(0,n);return}o.innerHTML=m.map(e=>{let t=p?`<td class="owner-actions">
                <a class="owner-btn" href="view.html?day=${encodeURIComponent(e.dayKey)}">보기</a>
                <a class="owner-btn" href="../admin/daily.html?new=1">추가</a>
              </td>`:``;return`
            <tr>
              <td>
                <a href="view.html?day=${encodeURIComponent(e.dayKey)}">${i(e.dayKey)}의 하루</a>
                <div class="daily-list-meta">기록 ${e.entries.length}개 · updated ${i(e.latestDate)}</div>
              </td>
              <td align="center">${i(e.dayKey)}</td>
              ${t}
            </tr>
          `}).join(``),v(l,n)}catch(e){o.innerHTML=`<tr><td colspan="${_()}">${l(c(e))}</td></tr>`,document.getElementById(`daily-calendar-body`).innerHTML=`<tr><td colspan="7">${l(c(e))}</td></tr>`}}function h(e=[]){let t=new Map;return e.forEach(e=>{let n=a(e);t.has(n)||t.set(n,{dayKey:n,entries:[],latestDate:o(e)});let r=t.get(n);r.entries.push(e),w(o(e))>w(r.latestDate)&&(r.latestDate=o(e))}),Array.from(t.values()).sort((e,t)=>{let n=String(t.dayKey).localeCompare(String(e.dayKey));return n===0?w(t.latestDate)-w(e.latestDate):n})}function g(){let e=document.getElementById(`daily-calendar-body`),t=document.getElementById(`calendarMonthLabel`);if(!u)return;let n=new Map;d.forEach(e=>{let t=a(e);n.has(t)||n.set(t,[]),n.get(t).push(e)});let{year:i,monthIndex:o}=u,s=r(new Date),c=new Date(i,o,1).getDay(),l=new Date(i,o+1,0).getDate(),f=[];for(let e=0;e<c;e+=1)f.push(`<td class="daily-calendar-empty">&nbsp;</td>`);for(let e=1;e<=l;e+=1){let t=S(i,o,e),r=n.get(t)||[],a=r[0],c=[`daily-calendar-day`,r.length?`daily-calendar-day--has-entry`:``,t===s?`daily-calendar-day--today`:``].filter(Boolean).join(` `);f.push(`
          <td class="${c}">
            ${a?`<a href="view.html?day=${encodeURIComponent(t)}"><b>${e}</b></a><br><span class="daily-calendar-mark">기록 ${r.length}개</span>`:`<span>${e}</span>`}
          </td>
        `)}for(;f.length%7!=0;)f.push(`<td class="daily-calendar-empty">&nbsp;</td>`);t.textContent=`${i}.${String(o+1).padStart(2,`0`)}`,e.innerHTML=C(f,7).map(e=>`<tr>${e.join(``)}</tr>`).join(``)}function _(){return p?3:2}function v(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n+=1)r+=n===t?`<b>${n}</b> `:`<a href="javascript:void(0)" onclick="goToDailyPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function y(e){m(e)}function b(e){let[t,n]=r(e).split(`-`).map(Number);return{year:t,monthIndex:n-1}}function x(e,t){let n=new Date(e.year,e.monthIndex+t,1);return{year:n.getFullYear(),monthIndex:n.getMonth()}}function S(e,t,n){return`${e}-${String(t+1).padStart(2,`0`)}-${String(n).padStart(2,`0`)}`}function C(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}function w(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}m();