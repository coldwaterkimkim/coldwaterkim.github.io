# design.md

이 문서는 coldwaterkim.com 공개 사이트의 디자인 소스오브트루스다.

기준은 `index.html`의 현재 홈페이지다. 앞으로 새 공개 페이지, 홈 개편, 글 목록/상세, 방명록, 미디어 페이지, 공개용 CMS 렌더링을 만들거나 수정할 때는 이 문서를 먼저 읽는다. 이 사이트의 좋은 감성은 “레트로를 현대적으로 해석한 것”이 아니라 “1999년 개인 홈페이지 문법을 지금도 진짜로 쓰는 것”이다.

관리 경험은 공개 사이트와 분리된 대시보드가 아니라 `OWNER MODE` 레이어로 본다. 방문자는 같은 페이지를 읽고, 로그인한 주인장만 같은 화면 위에서 편집/작성/삭제 버튼을 추가로 본다.

`admin/`의 글 편집기, 미디어 업로드, 방명록 관리 화면은 필요할 때 열리는 편집 도구다. 이 화면도 공개 홈페이지의 색상 토큰, Comic Sans 계열 폰트, 테이블/기본 버튼 감성을 따라야 한다. 단, 글 작성 효율과 실수 방지가 필요한 입력 UI는 조금 더 실용적으로 정리해도 된다.

## 디자인 고정 선언

현재 홈페이지가 기준이다.

한 문장으로는:

> 800x600 시대에 직접 만든 개인 홈페이지처럼 보이는, 일부러 수제이고 조금 과하고 진짜로 운영되는 레트로 웹.

이 감성의 핵심:

- `center` 안에 들어간 760px 테이블
- `marquee`로 움직이는 환영 문구
- 노란 상단 배너와 `UNDER CONSTRUCTION`
- 검정 배경 + 초록 숫자의 방문자 카운터
- 좌측 사이드바의 GIF, NAVIGATION, Cool Links, WebRing
- 우측 본문 상단의 Best Viewed / Netscape 배지
- Comic Sans 계열의 가벼운 촌스러움
- 기본 파란 링크와 보라색 방문 링크
- CMS 연결 실패도 테이블 안에 그냥 문장으로 나오는 솔직함

“촌스러움”은 여기서 결함이 아니라 제품 정체성이다.

## 현재 홈페이지 해부

`index.html`의 화면 구조를 고정한다.

```text
body
  center
    marquee width=760
      ★ WELCOME TO coldwaterkim's HOME PAGE ★

    table width=760 border=1 cellspacing=0 cellpadding=8 bgcolor=#ffffff
      tr
        td colspan=2 .banner
          UNDER CONSTRUCTION · VISITORS: 0000000

      tr
        td width=180 .sidebar
          spinning globe gif
          NAVIGATION
          text links
          hr
          Cool Links
          hr
          My WebRing

        td .content
          Best Viewed / Netscape badges
          h1 Korean welcome
          intro paragraph with red <font>
          recent posts table
          visitor note / guestbook prompt / audio player
          hr
          footer
```

이 구조는 “구식이라서 고쳐야 할 것”이 아니다. 새 공개 페이지가 복잡하면 이 구조를 재사용하고, 단순하면 760px one-cell table로 줄인다.

## 비주얼 논리

### 1. 페이지는 문서가 아니라 개인 방명록/링크 모음이다

현대 포트폴리오처럼 정보를 고급스럽게 정리하지 않는다. 방문자가 “누가 직접 만든 홈페이지에 들어왔다”는 느낌을 먼저 받아야 한다.

### 2. 정렬은 단정하지만 완벽하지 않아야 한다

760px 테이블, 8px cell padding, 기본 리스트, 기본 폼, 기본 링크가 만든 딱딱한 질감이 중요하다. 모던 그리드, flex dashboard, 반응형 카드 레이아웃으로 정리하면 감성이 죽는다.

### 3. 장식은 기능처럼 보여야 한다

GIF, 배지, WebRing, 방문자 카운터, 마퀴는 장식이지만 “이 홈페이지의 부품”처럼 보여야 한다. 배경에 예쁜 패턴을 깔거나 SVG 일러스트를 넣는 식의 현대 장식은 맞지 않는다.

### 4. CMS는 감성을 깨지 않고 들어와야 한다

글/방명록/미디어가 PocketBase에서 와도 화면 문법은 그대로다. 테이블 row, dashed entry, 기본 링크, 짧은 로딩 문장 안에 들어온다.

## 디자인 토큰

실제 CSS 토큰은 `css/styles.css`의 `:root`에 있다. 아래 표는 홈페이지 기준으로 고정한 값이다.

### 크기 / 레이아웃

| 토큰 | 값 | 의미 |
| --- | --- | --- |
| `--cwk-viewport-width` | `800px` | `meta viewport width=800`와 같은 세계관 |
| `--cwk-page-width` | `760px` | marquee와 메인 테이블 기준 폭 |
| `--cwk-home-sidebar-width` | `180px` | 홈 좌측 NAVIGATION 폭 |
| `--cwk-guestbook-sidebar-width` | `200px` | 방명록 입력 영역 폭 |
| `--cwk-cell-padding` | `8px` | 메인 테이블 셀 padding |
| `--cwk-list-cell-padding` | `6px` | 글 목록/최근 글 테이블 padding |
| `--cwk-bg-stripe-step` | `8px` | 배경 사선 한 줄 간격 |
| `--cwk-bg-tile-size` | `16px` | 배경 사선 반복 단위 |
| `--cwk-gif-home-size` | `88px` | 홈 spinning globe 기준 크기 |
| `--cwk-gif-small-size` | `60px` | 방명록 mail gif 기준 크기 |

### 색상

| 토큰 | 값 | 의미 |
| --- | --- | --- |
| `--cwk-bg-stripe-dark` | `#d8d8d8` | 바깥 배경 사선 진한 줄 |
| `--cwk-bg-stripe-light` | `#e9e9e9` | 바깥 배경 사선 밝은 줄 |
| `--cwk-body-bg-legacy` | `#e0e0e0` | HTML `bgcolor`로 남겨둘 배경값 |
| `--cwk-surface-page` | `#ffffff` | 메인 테이블/본문 종이색 |
| `--cwk-surface-banner` | `#ffe97a` | 상단 UNDER CONSTRUCTION 배너 |
| `--cwk-surface-sidebar` | `#f8f8ff` | 좌측 사이드바 |
| `--cwk-surface-table-head` | `#f0f0f0` | 최근 글/목록 테이블 헤더 |
| `--cwk-surface-entry` | `#fcfcf0` | 방명록 entry 배경 |
| `--cwk-surface-preview` | `#fffef6` | 관리자 preview box 배경 |
| `--cwk-ink` | `#000000` | 기본 텍스트 |
| `--cwk-muted` | `#666666` | 작은 안내문 |
| `--cwk-meta` | `#555555` | 방명록 meta, blockquote |
| `--cwk-border-dashed` | `#999999` | dashed entry/preview border |
| `--cwk-border-soft` | `#dddddd` | 코드 블록 border |
| `--cwk-link` | `#0000EE` | 기본 브라우저 파란 링크 |
| `--cwk-link-visited` | `#551A8B` | 기본 브라우저 방문 링크 |
| `--cwk-link-hover-bg` | `yellow` | hover 시 노란 하이라이트 |
| `--cwk-counter-bg` | `#000000` | 방문자 카운터 배경 |
| `--cwk-counter-fg` | `#00ff00` | 방문자 카운터 초록 숫자 |
| `--cwk-hot-red` | `red` | 본문 강조용 오래된 HTML red |

### 폰트 / 움직임

| 토큰 | 값 | 의미 |
| --- | --- | --- |
| `--cwk-font-main` | `"Comic Sans MS", Tahoma, Arial, sans-serif` | 공개 사이트 기본 폰트 |
| `--cwk-font-mono` | `"Courier New", monospace` | 카운터, 방명록, 코드 |
| `--cwk-marquee-tracking` | `2px` | 마퀴 글자 간격 |
| `--cwk-blink-duration` | `1s` | blink 속도 |
| `--cwk-note-size` | `12px` | 작은 안내문 |
| `--cwk-preview-size` | `14px` | preview box |
| `--cwk-post-size` | `15px` | 글 상세 본문 |
| `--cwk-post-line-height` | `1.8` | 글 상세 본문 줄간격 |

## HTML 속성도 디자인 토큰이다

이 프로젝트에서는 CSS만 디자인 기준이 아니다. 오래된 HTML 속성 자체가 감성이다.

유지할 속성:

- `<meta name="viewport" content="width=800">`
- `<body background="" bgcolor="#e0e0e0">`
- `<center>`
- `<marquee behavior="alternate" scrollamount="4" width="760">`
- `<table width="760" border="1" cellspacing="0" cellpadding="8" bgcolor="#ffffff">`
- `<td width="180" valign="top">`
- `<tr bgcolor="#f0f0f0">`
- `<font size="+1">`, `<font color="red">`
- `<b>`, `<i>`, `<small>`, `<hr>`

현대 HTML/CSS 관점에서 더 깔끔하게 바꿀 수 있어도, 공개 사이트에서는 이 속성들을 보존하는 편이 맞다.

## 색상 사용 규칙

1. 새 공개 UI의 기본 배경은 사선 회색 배경 위 760px 흰 테이블이다.
2. 강조 배너는 `#ffe97a` 노란색을 쓴다.
3. 링크는 반드시 기본 파랑/보라 계열을 유지한다.
4. hover는 세련된 transition 대신 `yellow` 배경 하이라이트를 유지한다.
5. 검정+초록 조합은 방문자 카운터처럼 “전자식/터미널식 숫자”에만 쓴다.
6. 새 색을 추가해야 하면 기본 HTML 색상 이름이나 원색에 가까운 색만 쓴다.
7. 파스텔 그라디언트, glass, beige luxury, dark navy SaaS, purple gradient는 금지한다.

## 타이포그래피 규칙

기본 폰트는 `Comic Sans MS` 우선이다. 이 선택은 농담이 아니라 감성의 핵심이다.

사용 원칙:

- 헤딩은 멋진 브랜드 카피가 아니라 페이지 제목처럼 쓴다.
- 본문은 짧고 직접적으로 쓴다.
- 영어 라벨은 오래된 웹 장식처럼 섞는다.
- 숫자, 메타, 코드, 방명록 목록은 `Courier New`를 쓴다.
- 대형 현대 히어로 타이포그래피는 쓰지 않는다.

좋은 예:

- `WELCOME TO coldwaterkim's HOME PAGE`
- `UNDER CONSTRUCTION`
- `VISITORS: 0000000`
- `최근 글(Last Updates)`
- `Best Viewed 800x600`
- `Back to Home`

## 카피 톤

기본 언어는 한국어다. 영어는 옛 웹 라벨, 배지, 메뉴명, 장식 문구에 섞는다.

좋은 톤:

- 약간 장난스럽다.
- 자기소개가 직접적이다.
- 운영 중인 개인 홈페이지처럼 말한다.
- 일부러 부담스러운 환영감을 유지한다.

좋은 예:

- `안녕하세요! 이것은 1999년 느낌의 제 홈페이지입니다.`
- `여기는 아날로그 감성의 실험실.`
- `방명록에 한 줄 남겨주세요!`
- `Powered by PocketBase`

피할 톤:

- 스타트업 랜딩페이지 카피
- 포트폴리오 사이트식 정제된 자기소개
- AI/SaaS 홍보 문장
- 추상적인 브랜드 선언
- 너무 많은 농담으로 실제 정보가 묻히는 문장

## 컴포넌트 규칙

### Shell

홈과 공개 메인 IA 페이지는 기본적으로 같은 2-column shell을 쓴다. 사용자가 `Home`, `글방`, `글 상세`, `Guestbook`, `About / Contact` 사이를 이동할 때 다른 문서로 튀는 느낌이 아니라 같은 개인 홈페이지의 오른쪽 본문만 바뀌는 느낌이어야 한다.

```html
<center>
  <marquee behavior="alternate" scrollamount="4" width="760">...</marquee>
  <table width="760" border="1" cellspacing="0" cellpadding="8" bgcolor="#ffffff">
    <tr>
      <td colspan="2" class="banner">UNDER CONSTRUCTION · VISITORS...</td>
    </tr>
    <tr>
      <td width="180" class="sidebar">프로필 / TODAY IS / BGM / Cool Links / WebRing</td>
      <td class="content">top-nav + 페이지별 본문</td>
    </tr>
  </table>
</center>
```

공개 메인 IA 페이지에서 이 shell을 빼면 사이트 연속성이 깨진다. 실험용 단독 페이지나 admin 편집 도구가 아닌 한 one-cell table로 축약하지 않는다.

### Sidebar

홈의 사이드바는 공개 사이트의 공통 identity 영역이다.

- 프로필 사진
- 이름 / 한 줄 설명 / 이메일
- `TODAY IS...`
- BGM player
- `hr`로 영역 분리
- Cool Links
- WebRing

페이지 navigation은 사이드바가 아니라 오른쪽 content 상단의 `.top-nav`에 둔다. 아이콘 버튼, pill nav, sticky modern sidebar로 바꾸지 않는다.

### Lists

글 목록, 최근 글, 미디어 목록은 table row가 기본이다.

```html
<table border="1" cellspacing="0" cellpadding="6" width="100%">
  <tr bgcolor="#f0f0f0">
    <th align="left">...</th>
    <th>...</th>
  </tr>
</table>
```

카드 그리드, masonry, 모던 list item 컴포넌트는 기본값으로 쓰지 않는다.

### Forms

폼은 기본 브라우저 질감을 살린다.

- `input`, `textarea`, `button` 기본 모양 유지
- 필요하면 `width: 100%`, `padding: 8px`, `font-weight: bold` 정도만 쓴다.
- 큰 CTA 버튼, 둥근 버튼, 아이콘 버튼 세트를 만들지 않는다.

### Guestbook Entry

방명록 entry는 `.entry`의 dashed border와 누런 배경이 기준이다.

- `border: 1px dashed #999`
- `background: #fcfcf0`
- meta는 작고 어둡게
- 메시지는 링크 변환만 하고 과하게 꾸미지 않는다.

### Post Detail

글 상세는 모던 블로그보다 조금 투박한 문서여야 한다. 다만 글 작성기와 읽기 화면의 감각 차이는 줄인다.

- 본문은 Quill 작성 화면과 같은 `ql-editor` 기준 타이포그래피를 쓴다.
- `font-family: Georgia, serif`, `font-size: 16px`, `line-height: 1.42`, 문단 margin `0`이 기준이다.
- 코드/blockquote/list/image는 Quill 기본 렌더링을 우선한다.
- 하단에는 텍스트 링크로 `글 목록으로`를 둔다.

## 움직임 규칙

움직임은 JS 애니메이션이 아니라 옛 HTML/CSS 움직임이어야 한다.

허용:

- `marquee`
- `.blink`
- GIF 자체의 움직임
- 기본 브라우저 hover

피함:

- scroll reveal
- parallax
- Framer Motion식 섹션 등장
- smooth landing animation
- fancy loading spinner

## 금지 패턴

공개 사이트에서는 기본적으로 하지 않는다.

- 모던 hero section
- feature card grid
- rounded card UI
- glassmorphism
- gradient orb / decorative blob
- dark SaaS dashboard palette
- shadcn 스타일 컴포넌트
- lucide icon 버튼 중심 UI
- mobile-first hamburger nav
- full responsive redesign
- smooth animation 중심 랜딩페이지
- “프리미엄 포트폴리오” 느낌

## 새 공개 페이지 만들 때 레시피

1. `index.html`을 먼저 읽고 기준 감성을 확인한다.
2. `css/styles.css`의 `:root` 토큰을 확인한다.
3. 공개 메인 IA 페이지면 홈의 2-column shell을 가져온다.
4. 페이지별 내용은 오른쪽 `.content` 안에서만 바꾼다.
5. 첫 화면에 옛 웹 신호를 적어도 하나 둔다.
   - marquee, GIF, badge, banner, WebRing, counter, table header
6. 데이터 목록은 table로 만든다.
7. 동적 상태는 `불러오는 중...`, `아직 글이 없습니다.`, `CMS 서버에 연결할 수 없습니다.`처럼 문장으로 보여준다.
8. 새 CSS 값이 필요하면 먼저 기존 토큰으로 해결한다.
9. 새 색/간격이 진짜 필요하면 `css/styles.css`의 토큰과 이 문서를 같이 갱신한다.
10. `npm run build`와 브라우저 확인을 한다.

## 변경 전 체크리스트

공개 UI를 바꾸기 전에 반드시 확인한다.

- 현재 홈보다 현대적인 랜딩페이지처럼 변하지 않았는가?
- 760px table 세계관을 유지하는가?
- 기본 링크 색과 hover 노란 배경을 유지하는가?
- GIF, 배지, marquee, counter, WebRing 중 하나 이상의 신호가 살아 있는가?
- CMS 데이터도 같은 테이블/텍스트 문법 안에 들어오는가?
- CSS 값은 `:root` 토큰에 맞는가?
- 사용자가 화면을 봤을 때 “아 이게 지금 홈페이지 감성 그대로네”라고 느낄 수 있는가?

## 의도적으로 방향을 바꿀 때

홈페이지 감성을 바꾸는 일은 단순 UI 수정이 아니라 제품 방향 변경이다.

그 경우:

1. 먼저 왜 바꾸는지 설명한다.
2. 사용자에게 방향 확인을 받는다.
3. `design.md`를 업데이트한다.
4. 필요하면 `STATUS.md`에도 현재 디자인 결정으로 기록한다.
5. 브라우저에서 기준 화면을 다시 확인한다.
