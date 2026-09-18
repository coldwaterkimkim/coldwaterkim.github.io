import{A as e,K as t,U as n,a as r,at as i,c as a,i as o,l as s,m as c,nt as l,st as u,v as d}from"./pb-BfDeohDR.js";import{t as f}from"./display-date-BpN6gW0H.js";function p(e=document){let t=e.querySelector(`#guestbookForm`),n=e.querySelector(`#guestbookEntries`);if(!t||!n||t.dataset.guestbookReady===`true`)return;t.dataset.guestbookReady=`true`;let i=t.querySelector(`button[type="submit"]`),a=t.querySelector(`#guestbookSubmitStatus`),c=t.querySelector(`#message`),l=t.querySelector(`#guestbookMessageCount`),d=()=>{l&&(l.textContent=String(c?.value.length||0))};c?.addEventListener(`input`,d),d();function f(e){t.dataset.guestbookSubmitting=String(e),t.setAttribute(`aria-busy`,String(e)),t.querySelectorAll(`button, input, select, textarea`).forEach(t=>{t.disabled=e}),i&&i.setAttribute(`aria-busy`,String(e))}function p(e=``){a&&(a.textContent=e)}t.addEventListener(`submit`,async e=>{if(e.preventDefault(),t.dataset.guestbookSubmitting===`true`)return;let i=t.querySelector(`#guestName`),a=t.querySelector(`#message`)?.value.trim()||``;if(!a){alert(`메시지를 입력해주세요.`);return}f(!0),p(`방명록을 남기는 중...`);try{await o(i?.value.trim()||await h(),a),u(`guestbook_complete`,{pageKey:r(),action:`submit`}).catch(e=>console.warn(`Anonymous analytics failed:`,s(e))),t.reset(),d(),await m(n),p(`방명록을 남겼습니다.`)}catch(e){p(`작성에 실패했습니다. 다시 시도해주세요.`),alert(`방명록 작성 실패: `+s(e))}finally{f(!1)}}),m(n)}async function m(r){if(r){r.innerHTML=`<p>불러오는 중...</p>`;try{let o=i((await e(1,200)).items);if(o.length===0){r.innerHTML=`<p>아직 방명록이 없습니다. 첫 번째로 인사해주세요!</p>`;return}let u=t();r.innerHTML=o.map(e=>{let t=f(n(e)),r=t?`[${t}] `:``,i=String(e.owner_reply||``).trim(),a=f(e.owner_replied_at),o=u?`<button class="del-btn" data-id="${e.id}" style="font-size:10px; color:red; border:1px solid red; background:white; cursor:pointer; margin-left:5px;">[삭제]</button>`:``,s=i?`
          <div class="guestbook-owner-reply">
            <div class="guestbook-owner-reply-meta">↳ <b>coldwaterkim의 답글</b>${a?` · ${a}`:``}</div>
            <div>${g(d(i))}</div>
            ${u?`
              <div class="guestbook-reply-actions">
                <button type="button" class="reply-toggle-btn">[답글 수정]</button>
                <button type="button" class="reply-delete-btn" data-id="${e.id}">[답글 삭제]</button>
              </div>
            `:``}
          </div>
        `:u?`<div class="guestbook-reply-actions"><button type="button" class="reply-toggle-btn">[답글 달기]</button></div>`:``,c=u?`
          <form class="guestbook-reply-form" data-id="${e.id}" hidden>
            <label><b>coldwaterkim의 답글</b></label>
            <textarea rows="3" maxlength="1000" required>${d(i)}</textarea>
            <div>
              <button type="submit">[저장]</button>
              <button type="button" class="reply-cancel-btn">[취소]</button>
            </div>
          </form>
        `:``;return`
        <div class="entry" data-guestbook-entry-id="${e.id}">
          <div class="meta">
            ${r}by <b>${d(e.name)}</b>
            ${o}
          </div>
          <div>${g(d(e.message))}</div>
          ${s}
          ${c}
        </div>
      `}).join(``),u&&(r.querySelectorAll(`.del-btn`).forEach(e=>{e.addEventListener(`click`,async()=>{if(confirm(`이 방명록을 삭제하시겠습니까?`))try{await c(e.dataset.id),m(r)}catch(e){alert(`삭제 실패: `+s(e))}})}),r.querySelectorAll(`.reply-toggle-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.closest(`.entry`)?.querySelector(`.guestbook-reply-form`);t&&(t.hidden=!t.hidden,t.hidden||t.querySelector(`textarea`)?.focus())})}),r.querySelectorAll(`.reply-cancel-btn`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.closest(`.guestbook-reply-form`);t&&(t.hidden=!0)})}),r.querySelectorAll(`.guestbook-reply-form`).forEach(e=>{e.addEventListener(`submit`,async t=>{t.preventDefault();let n=e.querySelector(`textarea`),i=e.querySelector(`button[type="submit"]`),a=n?.value.trim()||``;if(!a){alert(`답글 내용을 입력해주세요.`);return}i&&(i.disabled=!0);try{await l(e.dataset.id,a),m(r)}catch(e){alert(`답글 저장 실패: `+s(e)),i&&(i.disabled=!1)}})}),r.querySelectorAll(`.reply-delete-btn`).forEach(e=>{e.addEventListener(`click`,async()=>{if(confirm(`이 답글을 삭제하시겠습니까?`)){e.disabled=!0;try{await a(e.dataset.id),m(r)}catch(t){alert(`답글 삭제 실패: `+s(t)),e.disabled=!1}}})}))}catch(e){r.innerHTML=`<p>${d(s(e))}</p>`}}}async function h(){return`익명의 누군가${(await e(1,200)).items.reduce((e,t)=>{let n=String(t.name||``).match(/^익명의 누군가(\d+)$/);return n?Math.max(e,Number(n[1])):e},0)+1}`}function g(e){return e.replace(/(https?:\/\/[^\s]+)/g,`<a href="$1" target="_blank">$1</a>`)}export{p as initGuestbookPage};