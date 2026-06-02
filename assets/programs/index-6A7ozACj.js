import{B as e,L as t,M as n,O as r,P as i,U as a,c as o,j as s,n as c,p as l,r as u,s as d,u as f,v as p,w as m,x as h}from"../pb-CrrKWHU8.js";import"../site-C15qtE1W.js";var g=m(),_=[],v=``,y=[{id:`fallback-onecut`,title:`OneCut`,slug:`onecut`,status:`beta`,platform:`iOS · TestFlight · 하루 기록`,status_note:`공개 준비`,tagline:`a day in one frame`,story_intro:`하루를 한 컷으로 붙잡는 앱.`,why:`하루가 너무 쉽게 흘러가서, 최소한 한 컷만큼은 붙잡아두려고.`,pain_point:`사진은 많은데 하루의 감정과 맥락은 흩어지는 문제.`,sort_order:10,is_public:!0},{id:`fallback-doodle-dolmeng`,title:`Doodle 돌멩`,slug:`doodle-dolmeng`,status:`beta`,platform:`iOS · 위치 기반 지도 · 캠퍼스`,status_note:`실험중`,tagline:`campus map scribbles`,story_intro:`캠퍼스 생활권을 낙서처럼 남기는 지도.`,why:`장소에는 말로 설명하기 어려운 분위기와 낙서 같은 기억이 있어서.`,pain_point:`지도는 정확하지만, 사람들이 실제로 느끼는 생활권은 너무 납작하게 보이는 문제.`,sort_order:20,is_public:!0},{id:`fallback-wisdom-dolmeng`,title:`중생돌멩`,slug:`wisdom-dolmeng`,status:`released`,platform:`macOS · 메뉴바 앱 · .dmg 예정`,status_note:`파일 준비`,tagline:`floating wisdom panel`,story_intro:`메뉴바에서 잠깐씩 정신을 붙잡아주는 작은 앱.`,why:`하루 중 잠깐씩 정신을 붙잡아주는 이상한 문장이 필요해서.`,pain_point:`집중이 풀릴 때마다 거창한 앱을 여는 건 너무 큰 행동이라는 문제.`,sort_order:30,is_public:!0},{id:`fallback-quick-dump-dolmeng`,title:`브덤돌멩`,slug:`quick-dump-dolmeng`,status:`prototype`,platform:`macOS · 빠른 메모 · GitHub 예정`,status_note:`손보는중`,tagline:`throw thoughts fast`,story_intro:`생각이 지나가기 전에 아무 데나 던져놓는 메모 도구.`,why:`생각이 지나가기 전에 어디든 빠르게 던져놓고 싶어서.`,pain_point:`메모 앱을 고르는 순간 이미 쓰려던 말이 사라지는 문제.`,sort_order:40,is_public:!0},{id:`fallback-coming-soon-program`,title:`이름 미정`,slug:`coming-soon-program`,status:`unreleased`,platform:`Web · 예고편 · 아직 비밀`,status_note:`예고편`,tagline:`unreleased trailer`,story_intro:`아직 이름을 붙이지 않은 예고편 row.`,why:`아직 말하면 김이 빠지는 종류의 빡침에서 시작됨.`,pain_point:`공개 전이라 자세한 설명은 봉인. 대신 예고편 row로 먼저 입장.`,sort_order:50,is_public:!0}],b=document.getElementById(`programsList`),x=document.getElementById(`downloadIndexBody`),S=document.getElementById(`programOwnerPanel`),C=document.getElementById(`programOwnerStatus`),w=document.getElementById(`programForm`),T=document.getElementById(`programFormTitle`),E=document.getElementById(`cancelProgramEdit`),D=document.getElementById(`newProgramButton`),O={title:document.getElementById(`programTitle`),slug:document.getElementById(`programSlug`),status:document.getElementById(`programStatus`),platform:document.getElementById(`programPlatform`),version:document.getElementById(`programVersion`),statusNote:document.getElementById(`programStatusNote`),sortOrder:document.getElementById(`programSortOrder`),publishedAt:document.getElementById(`programPublishedAt`),primaryLinkLabel:document.getElementById(`programPrimaryLinkLabel`),primaryLinkUrl:document.getElementById(`programPrimaryLinkUrl`),externalLinks:document.getElementById(`programExternalLinks`),storyIntro:document.getElementById(`programStoryIntro`),why:document.getElementById(`programWhy`),painPoint:document.getElementById(`programPainPoint`),storyDetail:document.getElementById(`programStoryDetail`),solution:document.getElementById(`programSolution`),buildNotes:document.getElementById(`programBuildNotes`),screenshots:document.getElementById(`programScreenshots`),coverImage:document.getElementById(`programCoverImage`),downloadFiles:document.getElementById(`programDownloadFiles`),isPublic:document.getElementById(`programIsPublic`)};g&&(S.hidden=!1,W(`OWNER MODE: 이 페이지에서 바로 프로그램을 추가/수정할 수 있음.`)),D?.addEventListener(`click`,()=>{H({hidden:!1}),w.scrollIntoView({block:`start`}),O.title.focus()}),E?.addEventListener(`click`,()=>H({hidden:!0})),O.title?.addEventListener(`input`,()=>{v||O.slug.value.trim()||(O.slug.value=U(O.title.value))}),w?.addEventListener(`submit`,async e=>{e.preventDefault(),await z()}),b?.addEventListener(`click`,async e=>{let t=e.target.closest(`[data-program-action]`);if(!t)return;let n=t.getAttribute(`data-program-id`),r=t.getAttribute(`data-program-action`);r===`edit`?await B(n):r===`delete`&&await V(n)}),k();async function k(){b.innerHTML=`<tr><td colspan="3" class="loading">프로그램 목록 불러오는 중...</td></tr>`,x.innerHTML=`<tr><td colspan="4" class="loading">다운로드 목록 불러오는 중...</td></tr>`;try{_=g?await l():await h(),A(),R()}catch(e){if(!g&&e?.status===404){_=y,A(),R();return}let t=c(e);b.innerHTML=`<tr><td colspan="3">불러오기 실패: ${o(t)}</td></tr>`,x.innerHTML=`<tr><td colspan="4">불러오기 실패: ${o(t)}</td></tr>`,W(`CMS 확인 필요: ${t}`,`error`)}}function A(){if(!_.length){b.innerHTML=`
            <tr>
                <td colspan="3">
                    아직 등록된 프로그램이 없습니다.
                    ${g?`OWNER MODE에서 첫 프로그램을 올려보면 됨.`:`곧 채워질 예정.`}
                </td>
            </tr>
        `;return}b.innerHTML=_.map(j).join(``)}function j(e){let a=r(e.status),c=i(a),l=e.title||`(이름 없음)`,u=t(e),d=s(e),f=n(e),p=f.length?f.slice(0,3).map(e=>`<a href="${q(e.url)}" target="_blank" rel="noopener">${o(e.label)}</a>`).join(`<br>`):`<span class="note">준비중</span>`,m=g?`
        <hr>
        <button type="button" class="owner-btn" data-program-action="edit" data-program-id="${q(e.id)}">수정</button>
        <button type="button" class="owner-btn owner-btn-danger" data-program-action="delete" data-program-id="${q(e.id)}">삭제</button>
        ${e.is_public?``:`<br><span class="note">비공개</span>`}
    `:``;return`
        <tr>
            <td class="program-cover-cell">
                <a href="${q(d)}" class="program-cover-link" aria-label="${q(l)} 상세 보기">
                    ${u?M(e,u):N(e)}
                </a>
            </td>
            <td class="program-story-cell">
                <h2><span class="program-label">[${o(c)}]</span> <a href="${q(d)}">${o(l)}</a></h2>
                <p class="program-meta">${I(e)}</p>
                ${e.story_intro?`<p>${G(e.story_intro)}</p>`:``}
                <p><b>왜 만들었냐:</b> ${K(e.why||`아직 작성중.`)}</p>
                <p><b>해결하는 빡침:</b> ${K(e.pain_point||`아직 작성중.`)}</p>
                <p><a href="${q(d)}">상세 이야기 보기</a></p>
            </td>
            <td class="program-action-cell">
                <b>${o(c)}</b><br>
                <small>${o(e.status_note||L(a))}</small>
                <hr>
                ${p}
                ${m}
            </td>
        </tr>
    `}function M(e,t){return`
        <div class="program-cover program-cover--image">
            <div class="program-window-bar">${o(e.slug||`program`)}</div>
            <img src="${q(t)}" alt="${q(e.title||`program cover`)}">
        </div>
    `}function N(e){return`
        <div class="program-cover ${P(e)}">
            <div class="program-window-bar">${o(e.slug||`program`)}</div>
            <div class="program-cover-title">${F(e.title)}</div>
            <div class="program-cover-caption">${o(e.tagline||e.platform||`made by me`)}</div>
        </div>
    `}function P(e){let t=`${e.slug||``} ${e.title||``}`.toLowerCase();return t.includes(`onecut`)||t.includes(`one-cut`)?`program-cover--onecut`:t.includes(`doodle`)||t.includes(`두들`)?`program-cover--doodle`:t.includes(`중생`)||t.includes(`wisdom`)?`program-cover--wisdom`:t.includes(`브덤`)||t.includes(`dump`)?`program-cover--dump`:r(e.status)===`unreleased`?`program-cover--secret`:`program-cover--${r(e.status)}`}function F(e=``){let t=String(e||`???`).trim()||`???`,n=t.split(/\s+/).filter(Boolean);return o((n.length>1?n.slice(0,2).join(`<br>`):t).toUpperCase()).replace(/&lt;BR&gt;/g,`<br>`)}function I(e){return o([e.platform,e.version,e.published_at?f(e.published_at):``].filter(Boolean).join(` · `)||`platform TBD`)}function L(e){return{released:`받을 수 있음`,beta:`실험중`,prototype:`손보는중`,unreleased:`예고편`,archived:`보관됨`}[e]||`진행중`}function R(){if(!_.length){x.innerHTML=`<tr><td colspan="4">아직 다운로드 항목이 없습니다.</td></tr>`;return}x.innerHTML=_.flatMap(e=>{let t=n(e);return t.length?t.map(t=>`
            <tr>
                <td>${o(e.title||`(이름 없음)`)}</td>
                <td align="center">${o(e.platform||`-`)}</td>
                <td align="center">${o(i(e.status))}</td>
                <td><a href="${q(t.url)}" target="_blank" rel="noopener">${o(t.label)}</a></td>
            </tr>
        `):[`
                <tr>
                    <td>${o(e.title||`(이름 없음)`)}</td>
                    <td align="center">${o(e.platform||`-`)}</td>
                    <td align="center">${o(i(e.status))}</td>
                    <td><span class="note">준비중</span></td>
                </tr>
            `]}).join(``)}async function z(){if(!g)return;let e=O.title.value.trim(),t=O.why.value.trim(),n=O.painPoint.value.trim();if(!e||!t||!n){W(`제목, 왜 만들었는지, 해결하는 빡침은 필수임.`,`error`);return}let i=new FormData(w);i.set(`slug`,U(O.slug.value||e)),i.set(`status`,r(O.status.value)),i.set(`is_public`,O.isPublic.checked?`true`:`false`),i.set(`sort_order`,String(Number.parseInt(O.sortOrder.value||`100`,10)||100)),O.publishedAt.value||i.delete(`published_at`),O.coverImage.files.length||i.delete(`cover_image`),O.screenshots.files.length||i.delete(`screenshots`),O.downloadFiles.files.length||i.delete(`download_files`),W(v?`프로그램 수정 중...`:`프로그램 저장 중...`);try{W(`${(v?await a(v,i):await u(i)).title||`프로그램`} 저장 완료.`,`success`),H({hidden:!0}),await k()}catch(e){W(`저장 실패: ${c(e)}`,`error`)}}async function B(e){if(!(!g||!e))try{let t=_.find(t=>t.id===e)||await p(e,!0);v=t.id,w.hidden=!1,T.textContent=`✎ 프로그램 수정: ${t.title||`(이름 없음)`}`,O.title.value=t.title||``,O.slug.value=t.slug||``,O.status.value=r(t.status),O.platform.value=t.platform||``,O.version.value=t.version||``,O.statusNote.value=t.status_note||``,O.sortOrder.value=Number.isFinite(Number(t.sort_order))?String(t.sort_order):`100`,O.publishedAt.value=t.published_at?t.published_at.split(` `)[0].split(`T`)[0]:``,O.primaryLinkLabel.value=t.primary_link_label||``,O.primaryLinkUrl.value=t.primary_link_url||``,O.externalLinks.value=t.external_links||``,O.storyIntro.value=t.story_intro||``,O.why.value=t.why||``,O.painPoint.value=t.pain_point||``,O.storyDetail.value=t.story_detail||``,O.solution.value=t.solution||``,O.buildNotes.value=t.build_notes||``,O.coverImage.value=``,O.screenshots.value=``,O.downloadFiles.value=``,O.isPublic.checked=!!t.is_public,W(`수정 모드. 새 표지/스크린샷/파일을 고르면 CMS에 추가됨.`),w.scrollIntoView({block:`start`}),O.title.focus()}catch(e){W(`프로그램을 불러올 수 없음: ${c(e)}`,`error`)}}async function V(e){if(!g||!e)return;let t=_.find(t=>t.id===e)?.title||`이 프로그램`;if(confirm(`${t}을 삭제할까?\n첨부 파일도 CMS 레코드에서 같이 빠집니다.`))try{await d(e),W(`${t} 삭제 완료.`,`success`),await k()}catch(e){W(`삭제 실패: ${c(e)}`,`error`)}}function H(e={}){w&&(v=``,w.reset(),T.textContent=`✚ 새 프로그램 올리기`,O.status.value=`prototype`,O.sortOrder.value=`100`,O.publishedAt.value=new Date().toISOString().split(`T`)[0],O.isPublic.checked=!0,w.hidden=e.hidden??!0)}function U(t){return e(t)||`program-${Date.now()}`}function W(e,t=`info`){C&&(C.textContent=e,C.className=`program-owner-status program-owner-status--${t}`)}function G(e){return o(e).replace(/\r?\n/g,`<br>`)}function K(e,t=86){let n=String(e||``).replace(/\s+/g,` `).trim();return n.length<=t?o(n):`${o(n.slice(0,t).trim())}...`}function q(e){return String(e||``).replace(/&/g,`&amp;`).replace(/"/g,`&quot;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}