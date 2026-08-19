import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-DiYjCTiC.js";import{W as e,a as t,at as n,ct as r,d as i,ft as a,k as o,u as s,w as c,x as l}from"../pb-BM5ATIiH.js";var u=null,d=[],f=10,p=n();window.goToDailyPage=b,p&&(document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`daily-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="/admin/daily.html?new=1">새 나으 하루 쓰기</a> ·
          <a href="/admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),r(),window.location.reload()})),document.getElementById(`prevMonthButton`).addEventListener(`click`,()=>{u=S(u,-1),_()}),document.getElementById(`nextMonthButton`).addEventListener(`click`,()=>{u=S(u,1),_()});async function m(n=1){let r=document.getElementById(`daily-list`);r.innerHTML=`<tr><td colspan="${v()}">불러오는 중...</td></tr>`;try{let t=p?await o():await e(),i=h(t),l=Math.ceil(i.length/f),m=i.slice((n-1)*f,n*f);if(d=t,u||=x(s(t[0])||a(new Date)),_(),m.length===0){r.innerHTML=`<tr><td colspan="${v()}">아직 나으 하루가 없습니다.</td></tr>`,y(0,n);return}r.innerHTML=m.map(e=>{let t=p?`<td class="owner-actions">
                <a class="owner-btn" href="view.html?day=${encodeURIComponent(e.dayKey)}">보기</a>
                <a class="owner-btn" href="/admin/daily.html?new=1">추가</a>
              </td>`:``;return`
            <tr>
              <td>
                <a href="${g(e.dayKey)}">${c(e.dayKey)}의 하루</a>
                <div class="daily-list-meta">기록 ${e.entries.length}개 · updated ${c(e.latestDate)}</div>
              </td>
              <td align="center">${c(e.dayKey)}</td>
              ${t}
            </tr>
          `}).join(``),y(l,n)}catch(e){r.innerHTML=`<tr><td colspan="${v()}">${l(t(e))}</td></tr>`,document.getElementById(`daily-calendar-body`).innerHTML=`<tr><td colspan="7">${l(t(e))}</td></tr>`}}function h(e=[]){let t=new Map;return e.forEach(e=>{let n=s(e);t.has(n)||t.set(n,{dayKey:n,entries:[],latestDate:i(e)});let r=t.get(n);r.entries.push(e),T(i(e))>T(r.latestDate)&&(r.latestDate=i(e))}),Array.from(t.values()).sort((e,t)=>{let n=String(t.dayKey).localeCompare(String(e.dayKey));return n===0?T(t.latestDate)-T(e.latestDate):n})}function g(e){let t=encodeURIComponent(e);return p?`/daily/view.html?day=${t}`:`/daily/${t}/`}function _(){let e=document.getElementById(`daily-calendar-body`),t=document.getElementById(`calendarMonthLabel`);if(!u)return;let n=new Map;d.forEach(e=>{let t=s(e);n.has(t)||n.set(t,[]),n.get(t).push(e)});let{year:r,monthIndex:i}=u,o=a(new Date),c=new Date(r,i,1).getDay(),l=new Date(r,i+1,0).getDate(),f=[];for(let e=0;e<c;e+=1)f.push(`<td class="daily-calendar-empty">&nbsp;</td>`);for(let e=1;e<=l;e+=1){let t=C(r,i,e),a=n.get(t)||[],s=a[0],c=[`daily-calendar-day`,a.length?`daily-calendar-day--has-entry`:``,t===o?`daily-calendar-day--today`:``].filter(Boolean).join(` `);f.push(`
          <td class="${c}">
            ${s?`<a href="${g(t)}"><b>${e}</b></a><br><span class="daily-calendar-mark">기록 ${a.length}개</span>`:`<span>${e}</span>`}
          </td>
        `)}for(;f.length%7!=0;)f.push(`<td class="daily-calendar-empty">&nbsp;</td>`);t.textContent=`${r}.${String(i+1).padStart(2,`0`)}`,e.innerHTML=w(f,7).map(e=>`<tr>${e.join(``)}</tr>`).join(``)}function v(){return p?3:2}function y(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n+=1)r+=n===t?`<b>${n}</b> `:`<a href="javascript:void(0)" onclick="goToDailyPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function b(e){m(e)}function x(e){let[t,n]=a(e).split(`-`).map(Number);return{year:t,monthIndex:n-1}}function S(e,t){let n=new Date(e.year,e.monthIndex+t,1);return{year:n.getFullYear(),monthIndex:n.getMonth()}}function C(e,t,n){return`${e}-${String(t+1).padStart(2,`0`)}-${String(n).padStart(2,`0`)}`}function w(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}function T(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}m();