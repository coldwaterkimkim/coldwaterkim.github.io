import"../modulepreload-polyfill-Dezn_h7o.js";import"../site-CT9o0dPp.js";import{E as e,Ht as t,I as n,St as r,W as i,gt as a,h as o,k as s,l as c,m as l,nt as u,vt as d}from"../pb-DpAOhH6R.js";var f=null,p=[],m=10,h=a();window.goToDailyPage=C,h&&(document.getElementById(`views-col-head`).style.display=``,document.getElementById(`owner-col-head`).style.display=``,document.getElementById(`daily-note`).textContent=`OWNER MODE: 초안까지 같이 보입니다.`,document.getElementById(`owner-tools`).innerHTML=`
        <div class="owner-bar">
          <b>OWNER MODE</b> ·
          <a href="/admin/daily.html?new=1">새 나으 하루 쓰기</a> ·
          <a href="/admin/media.html">미디어</a> ·
          <a href="#" id="logoutLink">로그아웃</a>
        </div>
      `,document.getElementById(`logoutLink`).addEventListener(`click`,e=>{e.preventDefault(),d(),window.location.reload()})),document.getElementById(`prevMonthButton`).addEventListener(`click`,()=>{f=T(f,-1),y()}),document.getElementById(`nextMonthButton`).addEventListener(`click`,()=>{f=T(f,1),y()});async function g(a=1){let o=document.getElementById(`daily-list`);o.innerHTML=`<tr><td colspan="${b()}">불러오는 중...</td></tr>`;try{let e=h?await n():await u(),c=_(e),d=Math.ceil(c.length/m),g=c.slice((a-1)*m,a*m);if(p=e,f||=w(l(e[0])||r(new Date)),y(),g.length===0){o.innerHTML=`<tr><td colspan="${b()}">아직 나으 하루가 없습니다.</td></tr>`,S(0,a);return}let C=h?await i(g.map(e=>({kind:`daily`,id:e.dayKey}))):{};o.innerHTML=g.map(e=>{let n=h?`<td align="center" class="post-view-count">${x(C[t(`daily`,e.dayKey)])}</td>`:``,r=h?`<td class="owner-actions">
                <a class="owner-btn" href="view.html?day=${encodeURIComponent(e.dayKey)}">보기</a>
                <a class="owner-btn" href="/admin/daily.html?new=1">추가</a>
              </td>`:``;return`
            <tr>
              <td>
                <a href="${v(e.dayKey)}">${s(e.dayKey)}의 하루</a>
                <div class="daily-list-meta">기록 ${e.entries.length}개 · updated ${s(e.latestDate)}</div>
              </td>
              <td align="center">${s(e.dayKey)}</td>
              ${n}
              ${r}
            </tr>
          `}).join(``),S(d,a)}catch(t){o.innerHTML=`<tr><td colspan="${b()}">${e(c(t))}</td></tr>`,document.getElementById(`daily-calendar-body`).innerHTML=`<tr><td colspan="7">${e(c(t))}</td></tr>`}}function _(e=[]){let t=new Map;return e.forEach(e=>{let n=l(e);t.has(n)||t.set(n,{dayKey:n,entries:[],latestDate:o(e)});let r=t.get(n);r.entries.push(e),O(o(e))>O(r.latestDate)&&(r.latestDate=o(e))}),Array.from(t.values()).sort((e,t)=>{let n=String(t.dayKey).localeCompare(String(e.dayKey));return n===0?O(t.latestDate)-O(e.latestDate):n})}function v(e){let t=encodeURIComponent(e);return h?`/daily/view.html?day=${t}`:`/daily/${t}/`}function y(){let e=document.getElementById(`daily-calendar-body`),t=document.getElementById(`calendarMonthLabel`);if(!f)return;let n=new Map;p.forEach(e=>{let t=l(e);n.has(t)||n.set(t,[]),n.get(t).push(e)});let{year:i,monthIndex:a}=f,o=r(new Date),s=new Date(i,a,1).getDay(),c=new Date(i,a+1,0).getDate(),u=[];for(let e=0;e<s;e+=1)u.push(`<td class="daily-calendar-empty">&nbsp;</td>`);for(let e=1;e<=c;e+=1){let t=E(i,a,e),r=n.get(t)||[],s=r[0],c=[`daily-calendar-day`,r.length?`daily-calendar-day--has-entry`:``,t===o?`daily-calendar-day--today`:``].filter(Boolean).join(` `);u.push(`
          <td class="${c}">
            ${s?`<a href="${v(t)}"><b>${e}</b></a><br><span class="daily-calendar-mark">기록 ${r.length}개</span>`:`<span>${e}</span>`}
          </td>
        `)}for(;u.length%7!=0;)u.push(`<td class="daily-calendar-empty">&nbsp;</td>`);t.textContent=`${i}.${String(a+1).padStart(2,`0`)}`,e.innerHTML=D(u,7).map(e=>`<tr>${e.join(``)}</tr>`).join(``)}function b(){return h?4:2}function x(e){return Number.isFinite(e)?Number(e).toLocaleString(`ko-KR`):`-`}function S(e,t){let n=document.getElementById(`pagination`);if(e<=1){n.innerHTML=``;return}let r=`[ `;for(let n=1;n<=e;n+=1)r+=n===t?`<b>${n}</b> `:`<a href="javascript:void(0)" onclick="goToDailyPage(${n})">${n}</a> `;r+=`]`,n.innerHTML=r}function C(e){g(e)}function w(e){let[t,n]=r(e).split(`-`).map(Number);return{year:t,monthIndex:n-1}}function T(e,t){let n=new Date(e.year,e.monthIndex+t,1);return{year:n.getFullYear(),monthIndex:n.getMonth()}}function E(e,t,n){return`${e}-${String(t+1).padStart(2,`0`)}-${String(n).padStart(2,`0`)}`}function D(e,t){let n=[];for(let r=0;r<e.length;r+=t)n.push(e.slice(r,r+t));return n}function O(e){let t=Date.parse(e||``);return Number.isFinite(t)?t:0}g();