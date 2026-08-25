import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-Dgseme4s.js";import{B as e,Bt as t,D as n,P as r,Z as i,f as a,ft as o,gt as s,lt as c,o as l,p as u,w as d}from"../pb-DEzKlkVX.js";var f=null,p=[],m=10,h=c();window.goToDailyPage=C,h&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`daily-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="/admin/daily.html?new=1">새 나으 하루 쓰기</a> ·
          <a href="/admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),o(),window.location.reload()})),document.getElementById(`prevMonthButton`).addEventListener(`click`,()=>{f=T(f,-1),y()}),document.getElementById(`nextMonthButton`).addEventListener(`click`,()=>{f=T(f,1),y()});async function g(o=1){let c=document.getElementById(`daily-list`);c.innerHTML=`<tr><td colspan="${b()}">불러오는 중...</td></tr>`;try{let l=h?await r():await i(),u=_(l),d=Math.ceil(u.length/m),g=u.slice((o-1)*m,o*m);if(p=l,f||=w(a(l[0])||s(new Date)),y(),g.length===0){c.innerHTML=`<tr><td colspan="${b()}">아직 나으 하루가 없습니다.</td></tr>`,S(0,o);return}let C=h?await e(g.map(e=>({kind:`daily`,id:e.dayKey}))):{};c.innerHTML=g.map(e=>{let r=h?`<td align="center" class="post-view-count">${x(C[t(`daily`,e.dayKey)])}</td>`:``,i=h?`<td class="owner-actions">
                <a class="owner-btn" href="view.html?day=${encodeURIComponent(e.dayKey)}">보기</a>
                <a class="owner-btn" href="/admin/daily.html?new=1">추가</a>
              </td>`:``;return`
            <tr>
              <td>
                <a href="${v(e.dayKey)}">${n(e.dayKey)}의 하루</a>
                <div class="daily-list-meta">기록 ${e.entries.length}개 · updated ${n(e.latestDate)}</div>
              </td>
              <td align="center">${n(e.dayKey)}</td>
              ${r}
              ${i}
            </tr>
          `}).join(``),S(d,o)}catch(e){c.innerHTML=`<tr><td colspan="${b()}">${d(l(e))}</td></tr>`,document.getElementById(`daily-calendar-body`).innerHTML=`<tr><td colspan="7">${d(l(e))}</td></tr>`}}function _(e=[]){let t=new Map;return e.forEach(e=>{let n=a(e);t.has(n)||t.set(n,{dayKey:n,entries:[],latestDate:u(e)});let r=t.get(n);r.entries.push(e),O(u(e))>O(r.latestDate)&&(r.latestDate=u(e))}),Array.from(t.values()).sort((e,t)=>{let n=String(t.dayKey).localeCompare(String(e.dayKey));return n===0?O(t.latestDate)-O(e.latestDate):n})}function v(e){let t=encodeURIComponent(e);return h?`/daily/view.html?day=${t}`:`/daily/${t}/`}function y(){let e=document.getElementById(`daily-calendar-body`),t=document.getElementById(`calendarMonthLabel`);if(!f)return;let n=new Map;p.forEach(e=>{let t=a(e);n.has(t)||n.set(t,[]),n.get(t).push(e)});let{year:r,monthIndex:i}=f,o=s(new Date),c=new Date(r,i,1).getDay(),l=new Date(r,i+1,0).getDate(),u=[];for(let e=0;e<c;e+=1)u.push(`<td class="daily-calendar-empty">&nbsp;</td>`);for(let e=1;e<=l;e+=1){let t=E(r,i,e),a=n.get(t)||[],s=a[0],c=[`daily-calendar-day`,a.length?`daily-calendar-day--has-entry`:``,t===o?`daily-calendar-day--today`:``].filter(Boolean).join(` `);u.push(`
          <td class="${c}">
            ${s?`<a href="${v(t)}"><b>${e}</b></a><br><span class="daily-calendar-mark">기록 ${a.length}개</span>`:`<span>${e}</span>`}
          </td>
        `)}for(;u.length%7!=0;)u.push(`<td class="daily-calendar-empty">&nbsp;</td>`);t.textContent=`${r}.${String(i+1).padStart(2,`0`)}`,e.innerHTML=D(u,7).map(e=>`<tr>${e.join(``)}</tr>`).join(``)}function b(){return h?4:2}function x(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function S(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n+=1)r+=n===t?`<b>${n}</b> `:`<a href="javascript:void(0)" onclick="goToDailyPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function C(e){g(e)}function w(e){let[t,n]=s(e).split(`-`).map(Number);return{year:t,monthIndex:n-1}}function T(e,t){let n=new Date(e.year,e.monthIndex+t,1);return{year:n.getFullYear(),monthIndex:n.getMonth()}}function E(e,t,n){return`${e}-${String(t+1).padStart(2,`0`)}-${String(n).padStart(2,`0`)}`}function D(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}function O(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}g();