import{L as e,X as t,b as n,c as r,et as i,l as a,q as o,r as s,v as c,w as l}from"../pb-DbLjBjog.js";import"../site-CaxTqsYB.js";var u=null,d=[],f=10,p=o();window.goToDailyPage=y,p&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`daily-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="../admin/daily.html?new=1">새 나으 하루 쓰기</a> ·
          <a href="../admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),t(),window.location.reload()})),document.getElementById(`prevMonthButton`).addEventListener(`click`,()=>{u=x(u,-1),g()}),document.getElementById(`nextMonthButton`).addEventListener(`click`,()=>{u=x(u,1),g()});async function m(t=1){let a=document.getElementById(`daily-list`);a.innerHTML=`<tr><td colspan="${_()}">불러오는 중...</td></tr>`;try{let o=p?await l():await e(),s=h(o),c=Math.ceil(s.length/f),m=s.slice((t-1)*f,t*f);if(d=o,u||=b(r(o[0])||i(new Date)),g(),m.length===0){a.innerHTML=`<tr><td colspan="${_()}">아직 나으 하루가 없습니다.</td></tr>`,v(0,t);return}a.innerHTML=m.map(e=>{let t=p?`<td class="owner-actions">
                <a class="owner-btn" href="view.html?day=${encodeURIComponent(e.dayKey)}">보기</a>
                <a class="owner-btn" href="../admin/daily.html?new=1">추가</a>
              </td>`:``;return`
            <tr>
              <td>
                <a href="view.html?day=${encodeURIComponent(e.dayKey)}">${n(e.dayKey)}의 하루</a>
                <div class="daily-list-meta">기록 ${e.entries.length}개 · updated ${n(e.latestDate)}</div>
              </td>
              <td align="center">${n(e.dayKey)}</td>
              ${t}
            </tr>
          `}).join(``),v(c,t)}catch(e){a.innerHTML=`<tr><td colspan="${_()}">${c(s(e))}</td></tr>`,document.getElementById(`daily-calendar-body`).innerHTML=`<tr><td colspan="7">${c(s(e))}</td></tr>`}}function h(e=[]){let t=new Map;return e.forEach(e=>{let n=r(e);t.has(n)||t.set(n,{dayKey:n,entries:[],latestDate:a(e)});let i=t.get(n);i.entries.push(e),w(a(e))>w(i.latestDate)&&(i.latestDate=a(e))}),Array.from(t.values()).sort((e,t)=>{let n=String(t.dayKey).localeCompare(String(e.dayKey));return n===0?w(t.latestDate)-w(e.latestDate):n})}function g(){let e=document.getElementById(`daily-calendar-body`),t=document.getElementById(`calendarMonthLabel`);if(!u)return;let n=new Map;d.forEach(e=>{let t=r(e);n.has(t)||n.set(t,[]),n.get(t).push(e)});let{year:a,monthIndex:o}=u,s=i(new Date),c=new Date(a,o,1).getDay(),l=new Date(a,o+1,0).getDate(),f=[];for(let e=0;e<c;e+=1)f.push(`<td class="daily-calendar-empty">&nbsp;</td>`);for(let e=1;e<=l;e+=1){let t=S(a,o,e),r=n.get(t)||[],i=r[0],c=[`daily-calendar-day`,r.length?`daily-calendar-day--has-entry`:``,t===s?`daily-calendar-day--today`:``].filter(Boolean).join(` `);f.push(`
          <td class="${c}">
            ${i?`<a href="view.html?day=${encodeURIComponent(t)}"><b>${e}</b></a><br><span class="daily-calendar-mark">기록 ${r.length}개</span>`:`<span>${e}</span>`}
          </td>
        `)}for(;f.length%7!=0;)f.push(`<td class="daily-calendar-empty">&nbsp;</td>`);t.textContent=`${a}.${String(o+1).padStart(2,`0`)}`,e.innerHTML=C(f,7).map(e=>`<tr>${e.join(``)}</tr>`).join(``)}function _(){return p?3:2}function v(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n+=1)r+=n===t?`<b>${n}</b> `:`<a href="javascript:void(0)" onclick="goToDailyPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function y(e){m(e)}function b(e){let[t,n]=i(e).split(`-`).map(Number);return{year:t,monthIndex:n-1}}function x(e,t){let n=new Date(e.year,e.monthIndex+t,1);return{year:n.getFullYear(),monthIndex:n.getMonth()}}function S(e,t,n){return`${e}-${String(t+1).padStart(2,`0`)}-${String(n).padStart(2,`0`)}`}function C(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}function w(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}m();