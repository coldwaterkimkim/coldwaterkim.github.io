import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-CNI49moz.js";import{E as e,I as t,U as n,Vt as r,_t as i,h as a,ht as o,k as s,l as c,m as l,tt as u,xt as d}from"../pb-DMqTlCfb.js";var f=null,p=[],m=10,h=o();window.goToDailyPage=C,h&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`daily-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="/admin/daily.html?new=1">새 나으 하루 쓰기</a> ·
          <a href="/admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),i(),window.location.reload()})),document.getElementById(`prevMonthButton`).addEventListener(`click`,()=>{f=T(f,-1),y()}),document.getElementById(`nextMonthButton`).addEventListener(`click`,()=>{f=T(f,1),y()});async function g(i=1){let a=document.getElementById(`daily-list`);a.innerHTML=`<tr><td colspan="${b()}">불러오는 중...</td></tr>`;try{let e=h?await t():await u(),o=_(e),c=Math.ceil(o.length/m),g=o.slice((i-1)*m,i*m);if(p=e,f||=w(l(e[0])||d(new Date)),y(),g.length===0){a.innerHTML=`<tr><td colspan="${b()}">아직 나으 하루가 없습니다.</td></tr>`,S(0,i);return}let C=h?await n(g.map(e=>({kind:`daily`,id:e.dayKey}))):{};a.innerHTML=g.map(e=>{let t=h?`<td align="center" class="post-view-count">${x(C[r(`daily`,e.dayKey)])}</td>`:``,n=h?`<td class="owner-actions">
                <a class="owner-btn" href="view.html?day=${encodeURIComponent(e.dayKey)}">보기</a>
                <a class="owner-btn" href="/admin/daily.html?new=1">추가</a>
              </td>`:``;return`
            <tr>
              <td>
                <a href="${v(e.dayKey)}">${s(e.dayKey)}의 하루</a>
                <div class="daily-list-meta">기록 ${e.entries.length}개 · updated ${s(e.latestDate)}</div>
              </td>
              <td align="center">${s(e.dayKey)}</td>
              ${t}
              ${n}
            </tr>
          `}).join(``),S(c,i)}catch(t){a.innerHTML=`<tr><td colspan="${b()}">${e(c(t))}</td></tr>`,document.getElementById(`daily-calendar-body`).innerHTML=`<tr><td colspan="7">${e(c(t))}</td></tr>`}}function _(e=[]){let t=new Map;return e.forEach(e=>{let n=l(e);t.has(n)||t.set(n,{dayKey:n,entries:[],latestDate:a(e)});let r=t.get(n);r.entries.push(e),O(a(e))>O(r.latestDate)&&(r.latestDate=a(e))}),Array.from(t.values()).sort((e,t)=>{let n=String(t.dayKey).localeCompare(String(e.dayKey));return n===0?O(t.latestDate)-O(e.latestDate):n})}function v(e){let t=encodeURIComponent(e);return h?`/daily/view.html?day=${t}`:`/daily/${t}/`}function y(){let e=document.getElementById(`daily-calendar-body`),t=document.getElementById(`calendarMonthLabel`);if(!f)return;let n=new Map;p.forEach(e=>{let t=l(e);n.has(t)||n.set(t,[]),n.get(t).push(e)});let{year:r,monthIndex:i}=f,a=d(new Date),o=new Date(r,i,1).getDay(),s=new Date(r,i+1,0).getDate(),c=[];for(let e=0;e<o;e+=1)c.push(`<td class="daily-calendar-empty">&nbsp;</td>`);for(let e=1;e<=s;e+=1){let t=E(r,i,e),o=n.get(t)||[],s=o[0],l=[`daily-calendar-day`,o.length?`daily-calendar-day--has-entry`:``,t===a?`daily-calendar-day--today`:``].filter(Boolean).join(` `);c.push(`
          <td class="${l}">
            ${s?`<a href="${v(t)}"><b>${e}</b></a><br><span class="daily-calendar-mark">기록 ${o.length}개</span>`:`<span>${e}</span>`}
          </td>
        `)}for(;c.length%7!=0;)c.push(`<td class="daily-calendar-empty">&nbsp;</td>`);t.textContent=`${r}.${String(i+1).padStart(2,`0`)}`,e.innerHTML=D(c,7).map(e=>`<tr>${e.join(``)}</tr>`).join(``)}function b(){return h?4:2}function x(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function S(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n+=1)r+=n===t?`<b>${n}</b> `:`<a href="javascript:void(0)" onclick="goToDailyPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function C(e){g(e)}function w(e){let[t,n]=d(e).split(`-`).map(Number);return{year:t,monthIndex:n-1}}function T(e,t){let n=new Date(e.year,e.monthIndex+t,1);return{year:n.getFullYear(),monthIndex:n.getMonth()}}function E(e,t,n){return`${e}-${String(t+1).padStart(2,`0`)}-${String(n).padStart(2,`0`)}`}function D(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}function O(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}g();