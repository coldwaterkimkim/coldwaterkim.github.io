import{K as e,N as t,V as n,ct as r,g as i,l as a,rt as o,ut as s,v as c}from"./pb-BfDeohDR.js";import{t as l}from"./preload-helper-CZgWQFsJ.js";import{C as u,E as d,S as f,T as p,_ as m,a as h,b as g,c as _,f as v,g as y,h as b,i as x,l as S,m as C,n as w,o as T,p as E,r as D,s as O,u as k,v as A,w as j,x as M,y as N}from"./bgm-runtime-BMAHWtE7.js";var P=`bgm_audio_url`,F=`bgm_audio_title`,I=`bgm_playlist`,L=`bgm_schedule`;function R(e,t){return x([...E(e),...E(t)])}async function z(){return(await Promise.all([n(P),n(F),n(L),n(I)])).map(e=>e||``)}async function B(e){let t=[P,F,L,I];return(await Promise.allSettled(t.map((t,n)=>o(t,e[n]||``)))).every(e=>e.status===`fulfilled`)}async function V(e,t){let n=await z(),r=e[0]||null,i=[r?.url||``,r?.title||``,JSON.stringify(t),JSON.stringify(e)],a=[P,F,L,I];try{for(let e=0;e<a.length;e+=1)await o(a[e],i[e])}catch(e){throw await B(n)||(e.bgmRollbackFailed=!0),e}return n}function H(e,n,r){if(!e||!n)return;let o=document.createElement(`input`);o.type=`file`,o.accept=`audio/mpeg,.mp3`,o.multiple=!0,o.hidden=!0,document.body.appendChild(o);let c=document.createElement(`div`);c.className=`bgm-owner-row`;let l=document.createElement(`button`);l.type=`button`,l.className=`owner-btn bgm-owner-btn`,l.textContent=`MP3 추가`,l.setAttribute(`data-bgm-upload`,``);let d=document.createElement(`button`);d.type=`button`,d.className=`owner-btn bgm-owner-btn`,d.textContent=`BGM 편성표`;let f=document.createElement(`span`);f.className=`bgm-upload-status`,f.setAttribute(`aria-live`,`polite`),c.append(l,` `,d,f),e.appendChild(c),l.addEventListener(`click`,()=>o.click()),d.addEventListener(`click`,()=>U(n,l)),o.addEventListener(`change`,async()=>{let e=Array.from(o.files||[]);if(o.value=``,e.length===0)return;let c=document.querySelector(`[data-bgm-schedule-editor]`);if($(c)){alert(`먼저 편성 저장을 눌러 변경 내용을 저장한 뒤 MP3를 추가해줘.`);return}let d=e.filter(e=>!ee(e));if(d.length>0){alert(`MP3 파일만 올릴 수 있어요.\n\n확인할 파일: ${d.map(e=>e.name).join(`, `)}`);return}l.disabled=!0,Q(c,!0),f.textContent=`업로드 준비 중 (총 ${e.length}곡)`;let p=[],m=[];try{for(let n=0;n<e.length;n+=1){let r=e[n];f.textContent=`업로드 중 (${n+1}/${e.length}) ${r.name}`;try{let e=await s(r,r.name,`Home BGM`);p.push({url:t(e,e.file),title:r.name,uploadedAt:new Date().toISOString(),mediaId:e.id})}catch(e){m.push({file:r,error:e})}}if(p.length===0)throw m[0]?.error||Error(`올라간 MP3가 없음`);let i=await S(n),o=R(p,i.length>0?i:O(n)),c=u(_(n),D(o));await V(o,c),y(n,c,o),C(n,r,o,0),k(n),f.textContent=m.length>0?`${p.length}곡 추가 / ${m.length}곡 실패`:`${p.length}곡 추가됨 (총 ${o.length}곡)`,document.querySelector(`[data-bgm-schedule-editor]`)&&W(n,l,{replace:!0,message:`새 MP3 ${p.length}곡을 모든 시간대에 추가했음. 원하는 시간대만 남기시오.`}),m.length>0&&alert(`일부 MP3 업로드 실패 (${m.length}곡)\n\n${m.map(e=>`${e.file.name}: ${a(e.error)}`).join(`
`)}`),setTimeout(()=>f.textContent=``,1600)}catch(e){await Promise.allSettled(p.map(e=>i(e.mediaId))),f.textContent=`실패`;let t=e.bgmRollbackFailed?`
설정 복구도 끝나지 않았으니 다시 열어 상태를 확인해줘.`:``;alert(`MP3 묶음 저장 실패: `+a(e)+t)}finally{l.disabled=!1,Q(c,!1)}})}function U(e,t){let n=document.querySelector(`[data-bgm-schedule-editor]`);if(n){if($(n)&&!confirm(`저장하지 않은 BGM 편성이 있어. 닫을까?`))return;q(n,e);return}W(e,t)}function W(e,t,n={}){let r=document.querySelector(`.sketch-content`);if(!r||!e)return;let i=document.querySelector(`[data-bgm-schedule-editor]`);if(i){if(!n.replace&&$(i))return;q(i,e)}let a=O(e),o=_(e),s=g(new Date,m),l=A(o.slots,s),u=document.createElement(`section`);u.className=`bgm-schedule-editor`,u.setAttribute(`data-bgm-schedule-editor`,``),u.setAttribute(`aria-labelledby`,`bgmScheduleTitle`);let d=o.slots.map((e,t)=>`
    <th class="bgm-schedule-slot${e.id===l.id?` is-active`:``}" scope="col">
      ${c(e.label)}<br>
      <span>${f(e.startMinute)}–${f(M(o.slots,t))}</span><br>
      <small>${a.filter(t=>o.assignments[w(t)]?.includes(e.id)).length}곡</small>
    </th>
  `).join(``),p=a.map((t,n)=>{let r=w(t),i=o.assignments[r]||[],a=o.slots.map(e=>`
      <td class="${e.id===l.id?`is-active`:``}">
        <input type="checkbox" data-bgm-assignment data-track-index="${n}" data-slot-id="${e.id}"
          aria-label="${c(t.title)} ${c(e.label)} 시간대"
          ${i.includes(e.id)?`checked`:``}>
      </td>
    `).join(``),s=i.length===0?`<small class="bgm-unassigned">미배정</small>`:``,u=t.mediaId||N(t.url);return`
      <tr>
        <th scope="row" class="bgm-schedule-track">
          <span class="bgm-track-actions">
            <button type="button" class="owner-btn bgm-preview-btn" data-bgm-preview="${n}" title="이 곡 미리듣기">▶</button>
			<button type="button" class="owner-btn bgm-trim-btn" data-bgm-trim="${n}"
			  aria-label="${c(t.title)} 자르기"
			  ${u?``:`disabled title="PocketBase에 올린 MP3만 자를 수 있음"`}>자르기</button>
            <button type="button" class="owner-btn owner-btn-danger bgm-delete-btn" data-bgm-delete="${n}"
			  ${u?``:`disabled title="PocketBase에 올린 MP3만 삭제할 수 있음"`}>삭제</button>
          </span>
          <span>${c(t.title||h(e))}</span>
          ${s}
        </th>
        ${a}
      </tr>
	  <tr class="bgm-trim-row" data-bgm-trim-row="${n}" hidden>
		<td colspan="${o.slots.length+1}"></td>
	  </tr>
    `}).join(``),v=o.slots.map((e,t)=>`
    <tr>
      <th scope="row">${t+1}</th>
      <td><input type="text" maxlength="20" value="${c(e.label)}" data-bgm-slot-label="${e.id}" aria-label="${c(e.label)} 이름"></td>
      <td><input type="time" value="${f(e.startMinute)}" data-bgm-slot-start="${e.id}" ${t===0?`disabled`:``}></td>
      <td>${f(M(o.slots,t))}</td>
    </tr>
  `).join(``);u.innerHTML=`
    <div class="bgm-schedule-heading">
      <div>
        <b id="bgmScheduleTitle">★ BGM TIME TABLE</b>
        <span class="note">한국 시간 기준 · 현재 ${f(s)} / ${c(l.label)}</span>
      </div>
      <button type="button" class="owner-btn" data-bgm-editor-close>편집 닫기</button>
    </div>
    <p class="bgm-schedule-help">곡을 여러 시간대에 중복 체크할 수 있음. 현재 곡은 끊지 않고 다음 곡부터 새 편성을 적용함.</p>
    <div class="bgm-schedule-table-wrap">
      <table class="bgm-schedule-table" border="1" cellspacing="0" cellpadding="4">
        <thead><tr><th scope="col">곡 / 시간대</th>${d}</tr></thead>
        <tbody>${p||`<tr><td colspan="6">등록된 MP3가 없음.</td></tr>`}</tbody>
      </table>
    </div>
    <div class="bgm-time-settings" data-bgm-time-settings hidden>
      <b>시간대 설정</b>
      <span class="note">시작 시각만 수정하면 앞 시간대의 종료 시각도 함께 바뀜.</span>
      <table border="1" cellspacing="0" cellpadding="4">
        <thead><tr><th>No.</th><th>이름</th><th>시작</th><th>종료</th></tr></thead>
        <tbody>${v}</tbody>
      </table>
    </div>
    <div class="bgm-schedule-actions">
      <button type="button" class="owner-btn" data-bgm-editor-upload>+ MP3 추가</button>
      <button type="button" class="owner-btn" data-bgm-time-toggle>시간대 설정</button>
      <button type="button" class="owner-btn" data-bgm-editor-save>편성 저장</button>
      <span class="bgm-schedule-status" data-bgm-editor-status aria-live="polite">${c(n.message||``)}</span>
    </div>
  `;let y=r.querySelector(`#homeOwnerTools`)||r.querySelector(`.top-nav`)?.parentElement;y?y.insertAdjacentElement(`afterend`,u):r.prepend(u),G(u,e,t),u.scrollIntoView({block:`start`})}function G(e,t,n){let r=e.querySelector(`[data-bgm-editor-status]`),s=e.querySelector(`[data-bgm-editor-save]`);e.querySelector(`[data-bgm-editor-close]`)?.addEventListener(`click`,()=>{$(e)&&!confirm(`저장하지 않은 BGM 편성이 있어. 닫을까?`)||q(e,t)}),e.querySelector(`[data-bgm-editor-upload]`)?.addEventListener(`click`,()=>n?.click()),e.querySelector(`[data-bgm-time-toggle]`)?.addEventListener(`click`,t=>{let n=e.querySelector(`[data-bgm-time-settings]`);n.hidden=!n.hidden,t.currentTarget.textContent=n.hidden?`시간대 설정`:`시간대 설정 닫기`}),e.querySelectorAll(`[data-bgm-preview]`).forEach(e=>{e.addEventListener(`click`,async()=>{v(t,Number(e.dataset.bgmPreview));try{await t.play(),r.textContent=`미리듣기 재생 중`}catch{r.textContent=`미리듣기 실패. BGM ON을 눌러보시오.`}})}),e.querySelectorAll(`[data-bgm-trim]`).forEach(r=>{r.addEventListener(`click`,()=>K(e,t,n,r))}),e.querySelectorAll(`[data-bgm-delete]`).forEach(o=>{o.addEventListener(`click`,async()=>{if($(e)){alert(`먼저 편성 저장을 눌러 변경 내용을 저장한 뒤 삭제해줘.`);return}let s=O(t),c=Number(o.dataset.bgmDelete),l=s[c],d=l?.mediaId||N(l?.url);if(!l||!d||!confirm(`“${l.title||h(t)}” MP3를 BGM에서 삭제할까?\n\n다른 글에서 쓰지 않는 파일이면 서버에서도 영구 삭제됨.`))return;Q(e,!0),r.classList.remove(`is-error`),r.textContent=`MP3 삭제 중...`;let f=w(s[t._bgmTrackIndex]),p=s.filter((e,t)=>t!==c),m=u(_(t),D(p));try{await V(p,m);let e=!1,r=!1;try{e=await i(d)}catch(e){r=!0,console.warn(`BGM media cleanup failed:`,a(e))}y(t,m,p);let o=p.findIndex(e=>w(e)===f);C(t,t._bgmTrackTitle,p,Math.max(0,o)),p.length>0&&f===w(l)&&k(t),W(t,n,{replace:!0,message:r?`“${l.title}”을 BGM에서 제거함. 서버 파일 정리 여부는 확인하지 못했음.`:e?`“${l.title}” 삭제 완료.`:`“${l.title}”을 BGM에서 제거함. 다른 콘텐츠에서 사용 중인 원본 파일은 보존했음.`})}catch(t){r.textContent=`삭제 실패: ${a(t)}`,t.bgmRollbackFailed&&(r.textContent+=` · 설정 복구 상태 확인 필요`),r.classList.add(`is-error`),Q(e,!1)}})}),e.addEventListener(`input`,t=>{t.target.matches(`[data-bgm-assignment], [data-bgm-slot-label], [data-bgm-slot-start]`)&&(Z(e,!0),r.textContent=`저장 안 됨`)}),s?.addEventListener(`click`,async()=>{let i;try{i=X(e,t,O(t))}catch(e){r.textContent=e.message,r.classList.add(`is-error`);return}s.disabled=!0,r.classList.remove(`is-error`),r.textContent=`저장 중...`;try{await o(L,JSON.stringify(i)),y(t,i),Z(e,!1),W(t,n,{replace:!0,message:`편성 저장 완료.`})}catch(e){r.textContent=`저장 실패: ${a(e)}`,r.classList.add(`is-error`),s.disabled=!1}})}async function K(e,n,o,s){let u=Number(s.dataset.bgmTrim),f=O(n)[u],m=f?.mediaId||N(f?.url),h=e.querySelector(`[data-bgm-trim-row="${u}"]`),g=h?.querySelector(`td`);if(!f||!m||!h||!g)return;let v=e.querySelector(`[data-bgm-trim-row]:not([hidden])`);if(v&&v!==h&&J(v,n,!1),!h.hidden){J(h,n,!0);return}h.hidden=!1,g.innerHTML=`
		<div class="bgm-trim-editor" data-bgm-trim-editor>
			<div class="bgm-trim-heading">
				<b>✂ ${c(f.title)} 자르기</b>
				<button type="button" class="owner-btn" data-bgm-trim-close>닫기</button>
			</div>
			<div class="bgm-trim-waveform" data-bgm-trim-waveform aria-label="${c(f.title)} 파형"></div>
			<div class="bgm-trim-fields">
				<label>시작(초) <input type="number" min="0" step="0.01" value="0" data-bgm-trim-start></label>
				<label>끝(초) <input type="number" min="0.25" step="0.01" value="" data-bgm-trim-end></label>
				<span class="note" data-bgm-trim-length>파형 불러오는 중...</span>
			</div>
			<div class="bgm-trim-actions">
				<button type="button" class="owner-btn" data-bgm-trim-preview disabled>▶ 선택 구간</button>
				<button type="button" class="owner-btn" data-bgm-trim-replace disabled>이 구간으로 교체</button>
				<span class="bgm-schedule-status" data-bgm-trim-status aria-live="polite">곡 하나만 불러오는 중...</span>
			</div>
		</div>
	`;let x=g.querySelector(`[data-bgm-trim-editor]`),S=x.querySelector(`[data-bgm-trim-waveform]`),E=x.querySelector(`[data-bgm-trim-start]`),k=x.querySelector(`[data-bgm-trim-end]`),A=x.querySelector(`[data-bgm-trim-length]`),M=x.querySelector(`[data-bgm-trim-preview]`),P=x.querySelector(`[data-bgm-trim-replace]`),F=x.querySelector(`[data-bgm-trim-status]`),I=null,L=0,R=!1,z=``,B=(e,t,n=!0)=>{let r=Math.max(0,Math.min(Number(e)||0,L)),i=Math.max(r,Math.min(Number(t)||0,L));n&&(E.value=r.toFixed(2),k.value=i.toFixed(2)),A.textContent=`전체 ${Y(L)} · 선택 ${Y(i-r)}`};try{let[{default:s},{default:c}]=await Promise.all([l(()=>import(`./wavesurfer.esm-BV61c4jR.js`),[]),l(()=>import(`./regions.esm-DneiaUfL.js`),[])]);if(!h.isConnected||h.hidden)return;let g=c.create(),v=s.create({container:S,url:f.url,height:72,waveColor:`#777777`,progressColor:`#000080`,cursorColor:`#cc0000`,barWidth:2,barGap:1,plugins:[g]});h._bgmWaveSurfer=v,h._bgmResumeMainAudio=()=>R,v.on(`decode`,e=>{L=e,k.max=L.toFixed(3),E.max=Math.max(0,L-.25).toFixed(3),I=g.addRegion({start:0,end:L,drag:!0,resize:!0,minLength:.25,color:`rgba(255, 233, 122, 0.45)`}),B(0,L),M.disabled=!1,P.disabled=!1,F.textContent=`노란 구간 양끝을 끌거나 초 단위 값을 입력하시오.`}),v.on(`error`,e=>{F.textContent=`파형 로딩 실패: ${a(e)}`,F.classList.add(`is-error`)}),g.on(`region-updated`,e=>{e===I&&B(I.start,I.end)});let x=()=>{if(!I||L<=0)return;let e=Number(E.value),t=Number(k.value);return!Number.isFinite(e)||!Number.isFinite(t)||e<0||t-e<.25||t>L+.01?(F.textContent=`시작보다 최소 0.25초 뒤의 끝 지점을 골라줘.`,F.classList.add(`is-error`),M.disabled=!0,P.disabled=!0,!1):(F.classList.remove(`is-error`),I.setOptions({start:e,end:t}),B(e,t),M.disabled=!1,P.disabled=!1,!0)};E.addEventListener(`input`,x),k.addEventListener(`input`,x),M.addEventListener(`click`,()=>{I&&(n.paused||(R=!0,p(n)),I.play(!0))}),P.addEventListener(`click`,async()=>{if($(e)){alert(`먼저 편성 저장을 눌러 변경 내용을 저장한 뒤 MP3를 잘라줘.`);return}if(!I||L<=0||x()===!1||I.end-I.start<.25)return;if(I.start<.01&&Math.abs(I.end-L)<.01){alert(`곡 전체가 선택되어 있어. 앞이나 뒤를 줄인 다음 교체해줘.`);return}if(!confirm(`“${f.title}”을 ${Y(I.start)} ~ ${Y(I.end)} 구간으로 교체할까?\n\n교체 성공 뒤 이전 파일은 다른 콘텐츠에서 쓰지 않을 때 서버에서도 삭제됨.`))return;v.pause(),Q(e,!0),F.classList.remove(`is-error`),F.textContent=`iMac에서 MP3 자르는 중...`;let s=``;try{z||=crypto.randomUUID();let e=await r(m,I.start,I.end,z),c=e.media;s=c.id;let l={url:t(c,c.file),title:f.title,uploadedAt:new Date().toISOString(),mediaId:c.id},p=O(n),g=w(f),v=w(p[n._bgmTrackIndex]),x=!n.paused||R,S=p.map((e,t)=>t===u?l:e),E=j(_(n),g,w(l),D(S));await V(S,E),y(n,E,S);let k=v===g?u:Math.max(0,S.findIndex(e=>w(e)===v));C(n,n._bgmTrackTitle,S,k),x&&d(n).catch(()=>b(T(n.closest(`.mini-player`),n),!0));let A=!1;try{await i(m)}catch(e){A=!0,console.warn(`Previous BGM cleanup failed:`,a(e))}J(h,n,!1),W(n,o,{replace:!0,message:A?`“${f.title}” 교체 완료. 이전 파일 정리 여부는 확인하지 못했음.`:`“${f.title}”을 ${Y(e.duration_seconds||I.end-I.start)} 길이로 교체 완료.`})}catch(t){s&&await i(s).catch(()=>{}),F.textContent=`교체 실패: ${a(t)}`,t.bgmRollbackFailed&&(F.textContent+=` · 설정 복구 상태 확인 필요`),F.classList.add(`is-error`),Q(e,!1)}})}catch(e){F.textContent=`파형 준비 실패: ${a(e)}`,F.classList.add(`is-error`)}x.querySelector(`[data-bgm-trim-close]`)?.addEventListener(`click`,()=>J(h,n,!0)),h.scrollIntoView({block:`nearest`})}function q(e,t){let n=e.querySelector(`[data-bgm-trim-row]:not([hidden])`);n&&J(n,t,!1),e.remove()}function J(e,t,n){let r=e.dataset.bgmTrimRow,i=e._bgmResumeMainAudio?.()===!0;e._bgmWaveSurfer?.destroy(),delete e._bgmWaveSurfer,delete e._bgmResumeMainAudio,e.hidden=!0,e.querySelector(`td`)?.replaceChildren(),i&&d(t).catch(()=>{}),n&&e.closest(`[data-bgm-schedule-editor]`)?.querySelector(`[data-bgm-trim="${r}"]`)?.focus()}function Y(e){let t=Math.max(0,Number(e)||0),n=Math.floor(t/60);return`${n}:${(t-n*60).toFixed(2).padStart(5,`0`)}`}function X(e,t,n){let r=_(t).slots.map((t,n)=>{let r=e.querySelector(`[data-bgm-slot-label="${t.id}"]`)?.value.trim()||t.label,[i,a]=(e.querySelector(`[data-bgm-slot-start="${t.id}"]`)?.value||`00:00`).split(`:`).map(Number);return{id:t.id,label:r,startMinute:n===0?0:i*60+a}});if(r.some((e,t)=>t>0&&e.startMinute<=r[t-1].startMinute))throw Error(`시간대 시작 시각은 앞 시간대보다 늦어야 함.`);let i={};return n.forEach((t,n)=>{i[w(t)]=r.filter(t=>e.querySelector(`[data-bgm-assignment][data-track-index="${n}"][data-slot-id="${t.id}"]`)?.checked).map(e=>e.id)}),u({version:1,timezone:m,slots:r,assignments:i},D(n))}function Z(e,t){e.dataset.bgmEditorDirty=t?`true`:`false`,e.setAttribute(`data-version-refresh-block`,t?`true`:`false`)}function Q(e,t){e&&(e.setAttribute(`aria-busy`,t?`true`:`false`),e.querySelectorAll(`button, input`).forEach(e=>{if(t){e.dataset.bgmWasDisabled=e.disabled?`true`:`false`,e.disabled=!0;return}e.disabled=e.dataset.bgmWasDisabled===`true`,delete e.dataset.bgmWasDisabled}))}function $(e){return e?.dataset.bgmEditorDirty===`true`}function ee(e){return e.type===`audio/mpeg`||/\.mp3$/i.test(e.name)}function te(t,n){if(!e()||document.querySelector(`.sk-owner-music`))return;let r=document.querySelector(`.sk-music-dock`);if(!r)return;let i=document.createElement(`details`);i.className=`sk-owner-music`,i.innerHTML=`<summary>음악 관리</summary>`,r.append(i),H(i,t,n)}window.addEventListener(`beforeunload`,e=>{document.querySelector(`[data-bgm-schedule-editor][data-bgm-editor-dirty="true"]`)&&(e.preventDefault(),e.returnValue=``)});export{te as mountBgmOwnerTools};