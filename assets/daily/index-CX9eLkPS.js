import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-C3DPzNnY.js";import{C as e,O as t,U as n,a as r,b as i,d as a,ot as o,rt as s,u as c,ut as l}from"../pb-yXaCmYDJ.js";var u=null,d=[],f=10,p=s();window.goToDailyPage=b,p&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`daily-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="/admin/daily.html?new=1">새 나으 하루 쓰기</a> ·
          <a href="/admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),o(),window.location.reload()})),document.getElementById(`prevMonthButton`).addEventListener(`click`,()=>{u=S(u,-1),_()}),document.getElementById(`nextMonthButton`).addEventListener(`click`,()=>{u=S(u,1),_()});async function m(a=1){let o=document.getElementById(`daily-list`);o.innerHTML=`<tr><td colspan="${v()}">불러오는 중...</td></tr>`;try{let r=p?await t():await n(),i=h(r),s=Math.ceil(i.length/f),m=i.slice((a-1)*f,a*f);if(d=r,u||=x(c(r[0])||l(new Date)),_(),m.length===0){o.innerHTML=`<tr><td colspan="${v()}">아직 나으 하루가 없습니다.</td></tr>`,y(0,a);return}o.innerHTML=m.map(t=>{let n=p?`<td class="owner-actions">
                <a class="owner-btn" href="view.html?day=${encodeURIComponent(t.dayKey)}">보기</a>
                <a class="owner-btn" href="/admin/daily.html?new=1">추가</a>
              </td>`:``;return`
            <tr>
              <td>
                <a href="${g(t.dayKey)}">${e(t.dayKey)}의 하루</a>
                <div class="daily-list-meta">기록 ${t.entries.length}개 · updated ${e(t.latestDate)}</div>
              </td>
              <td align="center">${e(t.dayKey)}</td>
              ${n}
            </tr>
          `}).join(``),y(s,a)}catch(e){o.innerHTML=`<tr><td colspan="${v()}">${i(r(e))}</td></tr>`,document.getElementById(`daily-calendar-body`).innerHTML=`<tr><td colspan="7">${i(r(e))}</td></tr>`}}function h(e=[]){let t=new Map;return e.forEach(e=>{let n=c(e);t.has(n)||t.set(n,{dayKey:n,entries:[],latestDate:a(e)});let r=t.get(n);r.entries.push(e),T(a(e))>T(r.latestDate)&&(r.latestDate=a(e))}),Array.from(t.values()).sort((e,t)=>{let n=String(t.dayKey).localeCompare(String(e.dayKey));return n===0?T(t.latestDate)-T(e.latestDate):n})}function g(e){let t=encodeURIComponent(e);return p?`/daily/view.html?day=${t}`:`/daily/${t}/`}function _(){let e=document.getElementById(`daily-calendar-body`),t=document.getElementById(`calendarMonthLabel`);if(!u)return;let n=new Map;d.forEach(e=>{let t=c(e);n.has(t)||n.set(t,[]),n.get(t).push(e)});let{year:r,monthIndex:i}=u,a=l(new Date),o=new Date(r,i,1).getDay(),s=new Date(r,i+1,0).getDate(),f=[];for(let e=0;e<o;e+=1)f.push(`<td class="daily-calendar-empty">&nbsp;</td>`);for(let e=1;e<=s;e+=1){let t=C(r,i,e),o=n.get(t)||[],s=o[0],c=[`daily-calendar-day`,o.length?`daily-calendar-day--has-entry`:``,t===a?`daily-calendar-day--today`:``].filter(Boolean).join(` `);f.push(`
          <td class="${c}">
            ${s?`<a href="${g(t)}"><b>${e}</b></a><br><span class="daily-calendar-mark">기록 ${o.length}개</span>`:`<span>${e}</span>`}
          </td>
        `)}for(;f.length%7!=0;)f.push(`<td class="daily-calendar-empty">&nbsp;</td>`);t.textContent=`${r}.${String(i+1).padStart(2,`0`)}`,e.innerHTML=w(f,7).map(e=>`<tr>${e.join(``)}</tr>`).join(``)}function v(){return p?3:2}function y(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n+=1)r+=n===t?`<b>${n}</b> `:`<a href="javascript:void(0)" onclick="goToDailyPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function b(e){m(e)}function x(e){let[t,n]=l(e).split(`-`).map(Number);return{year:t,monthIndex:n-1}}function S(e,t){let n=new Date(e.year,e.monthIndex+t,1);return{year:n.getFullYear(),monthIndex:n.getMonth()}}function C(e,t,n){return`${e}-${String(t+1).padStart(2,`0`)}-${String(n).padStart(2,`0`)}`}function w(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}function T(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}m();