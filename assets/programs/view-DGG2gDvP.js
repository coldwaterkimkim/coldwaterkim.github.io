import{$ as e,G as t,P as n,at as r,ct as i,it as a,r as o,v as s}from"../pb-CfOIkPGQ.js";import"../site-ByyxUcZJ.js";import{r as c,t as l}from"../media-embeds-h4FUltIX.js";var u=new URLSearchParams(window.location.search).get(`slug`)||``,d=t(),f=document.getElementById(`programDetailTitle`),p=document.getElementById(`programDetailMeta`),m=document.getElementById(`programDetailBody`),h=document.getElementById(`programDetailDownloads`),g=new Map([[`onecut`,{title:`OneCut`,slug:`onecut`,status:`beta`,platform:`iOS · TestFlight · 하루 기록`,tagline:`a day in one frame`,story_intro:`하루를 한 컷으로 붙잡는 앱.`,why:`하루가 너무 쉽게 흘러가서, 최소한 한 컷만큼은 붙잡아두려고.`,pain_point:`사진은 많은데 하루의 감정과 맥락은 흩어지는 문제.`,story_detail:`처음에는 거창한 라이프로그가 아니라, 오늘을 잃어버리지 않는 최소 단위가 필요했다. 매일 완벽하게 기록하는 앱은 오래 못 간다. 그래서 하루에 한 컷만 남겨도 “오늘이 있었음”을 증명하는 쪽으로 잡았다.`,solution:`하루의 대표 장면을 고르고, 감정과 맥락을 얇게 붙여서 나중에 다시 읽을 수 있게 한다.`,build_notes:`TestFlight 공개를 준비하는 중. 공개 링크가 준비되면 이 상세페이지의 받기 영역에 붙일 예정.`,is_public:!0}],[`doodle-dolmeng`,{title:`Doodle 돌멩`,slug:`doodle-dolmeng`,status:`beta`,platform:`iOS · 위치 기반 지도 · 캠퍼스`,tagline:`campus map scribbles`,story_intro:`캠퍼스 생활권을 낙서처럼 남기는 지도.`,why:`장소에는 말로 설명하기 어려운 분위기와 낙서 같은 기억이 있어서.`,pain_point:`지도는 정확하지만, 사람들이 실제로 느끼는 생활권은 너무 납작하게 보이는 문제.`,story_detail:`정확한 좌표보다 더 중요한 건 사람들이 어느 골목을 자기 생활권으로 느끼는지였다. 그래서 캠퍼스를 단순한 핀 목록이 아니라, 낙서와 기억이 붙는 장소 표면으로 보고 있다.`,solution:`학교 주변 생활권을 경계와 핀, 짧은 흔적으로 묶어 “내가 실제로 다니는 지도”처럼 만든다.`,build_notes:`성균관대 생활권 기준으로 실험 중.`,is_public:!0}],[`wisdom-dolmeng`,{title:`중생돌멩`,slug:`wisdom-dolmeng`,status:`released`,platform:`macOS · 메뉴바 앱 · .dmg 예정`,tagline:`floating wisdom panel`,story_intro:`메뉴바에서 잠깐씩 정신을 붙잡아주는 작은 앱.`,why:`하루 중 잠깐씩 정신을 붙잡아주는 이상한 문장이 필요해서.`,pain_point:`집중이 풀릴 때마다 거창한 앱을 여는 건 너무 큰 행동이라는 문제.`,story_detail:`가끔은 생산성 앱보다 이상한 한 문장이 더 잘 먹힌다. 중생돌멩은 그런 문장을 화면 위에 아주 작게 띄우는 쪽에 가깝다.`,solution:`메뉴바에서 가볍게 열리고, 떠 있는 패널이 작업 흐름을 크게 방해하지 않게 움직인다.`,build_notes:`.dmg 배포 파일 준비 중.`,is_public:!0}],[`quick-dump-dolmeng`,{title:`브덤돌멩`,slug:`quick-dump-dolmeng`,status:`prototype`,platform:`macOS · 빠른 메모 · GitHub 예정`,tagline:`throw thoughts fast`,story_intro:`생각이 지나가기 전에 아무 데나 던져놓는 메모 도구.`,why:`생각이 지나가기 전에 어디든 빠르게 던져놓고 싶어서.`,pain_point:`메모 앱을 고르는 순간 이미 쓰려던 말이 사라지는 문제.`,story_detail:`생각은 기다려주지 않는다. 좋은 분류, 좋은 태그, 좋은 폴더보다 먼저 필요한 건 그냥 던져놓는 입구였다.`,solution:`입력 상태를 빠르게 초기화하고, 다음 생각을 바로 받을 수 있게 만드는 흐름을 우선한다.`,build_notes:`프로토타입 상태. 공개 repo 정리 후 링크를 붙일 예정.`,is_public:!0}],[`coming-soon-program`,{title:`이름 미정`,slug:`coming-soon-program`,status:`unreleased`,platform:`Web · 예고편 · 아직 비밀`,tagline:`unreleased trailer`,story_intro:`아직 이름을 붙이지 않은 예고편 row.`,why:`아직 말하면 김이 빠지는 종류의 빡침에서 시작됨.`,pain_point:`공개 전이라 자세한 설명은 봉인. 대신 예고편 row로 먼저 입장.`,story_detail:`아직은 예고편만 올려두는 자리. 이런 상태의 프로젝트도 완성작과 같은 table에 놓고 싶다는 게 프로그램실의 중요한 태도다.`,solution:`준비 전 상태를 숨기지 않고, unreleased 작품으로 먼저 자리를 만들어 둔다.`,build_notes:`이름과 공개 범위가 정해지면 업데이트.`,is_public:!0}]]);_();async function _(){if(!u){C(`프로그램 slug가 없습니다.`);return}try{v(await n(u,d))}catch(e){if(!d&&e?.status===404&&g.has(u)){v(g.get(u));return}C(o(e))}}function v(t){let n=r(e(t.status)),a=t.title||`(이름 없음)`,o=i(t);document.title=`${a} — 프로그램실 — coldwaterkim`,f.innerHTML=`<span class="program-label">[${s(n)}]</span> ${s(a)}`,p.textContent=[t.platform].filter(Boolean).join(` · `),m.innerHTML=c(`
        <div class="program-detail-hero">
            <div class="program-detail-cover">
                ${o?`<img src="${T(o)}" alt="${T(a)} 표지">`:S(t)}
            </div>
            <div class="program-detail-summary">
                <p>${w(t.story_intro||t.tagline||`아직 한 줄 소개를 쓰는 중.`)}</p>
                <table border="1" cellspacing="0" cellpadding="5" width="100%" class="program-detail-meta-table">
                    <tr><th align="left">상태</th><td>${s(n)}</td></tr>
                    <tr><th align="left">플랫폼</th><td>${s(t.platform||`-`)}</td></tr>
                </table>
            </div>
        </div>
        <div class="program-story-block program-body-content ql-editor">
            ${b(t)}
        </div>
    `),l(m),y(t)}function y(e){let t=a(e);if(!t.length){h.innerHTML=`<tr><td colspan="2"><span class="note">아직 받을 수 있는 파일/링크가 없습니다.</span></td></tr>`;return}h.innerHTML=t.map(e=>`
        <tr>
            <td>${s(e.label)}</td>
            <td><a href="${T(e.url)}" target="_blank" rel="noopener">${s(e.type===`file`?`파일 받기`:`열기`)}</a></td>
        </tr>
    `).join(``)}function b(e){let t=String(e.story_detail||``).trim();return t?x(t)?t:w(t):[[`왜 만들었냐`,e.why],[`해결하는 빡침`,e.pain_point],[`어떻게 풀었냐`,e.solution],[`제작 노트`,e.build_notes]].filter(([,e])=>String(e||``).trim()).map(([e,t])=>`<h2>${s(e)}</h2><p>${w(t)}</p>`).join(``)||`<p>아직 본문을 쓰는 중.</p>`}function x(e){return/<\/?[a-z][\s\S]*>/i.test(e)}function S(e){return`
        <div class="program-detail-poster program-detail-poster--missing">
            <div class="program-window-bar">${s(e.slug||`program`)}</div>
            <div class="program-detail-poster-title">없음</div>
            <div class="program-cover-caption">대표 이미지 없음</div>
        </div>
    `}function C(e){f.textContent=`프로그램을 찾을 수 없음`,p.textContent=``,m.innerHTML=`<p>불러오기 실패: ${s(e)}</p><p><a href="/programs/index.html">프로그램실로 돌아가기</a></p>`,h.innerHTML=`<tr><td colspan="2">-</td></tr>`}function w(e){return s(e||``).replace(/\r?\n/g,`<br>`)}function T(e){return String(e||``).replace(/&/g,`&amp;`).replace(/"/g,`&quot;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`)}