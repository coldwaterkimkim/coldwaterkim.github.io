# design.md

이 문서는 coldwaterkim.com 공개 사이트의 디자인 소스오브트루스다.

기준은 `index.html`의 현재 홈페이지다. 앞으로 새 공개 페이지, 홈 개편, 글 목록/상세, 프로그램실, 방명록, 미디어 페이지, 공개용 CMS 렌더링을 만들거나 수정할 때는 이 문서를 먼저 읽는다. 이 사이트의 좋은 감성은 “레트로를 현대적으로 해석한 것”이 아니라 “1999년 개인 홈페이지 문법을 지금도 진짜로 쓰는 것”이다.

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
- 좌측 사이드바의 프로필 사진, TODAY IS, BGM, Cool Links, WebRing
- 우측 본문 상단은 navigation 바로 아래 본문이 시작되며, 장식 배지는 두지 않는다.
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
          UNDER CONSTRUCTION · VISITORS: TOTAL 0000000 TODAY 0000

      tr
        td width=180 .sidebar
          profile photo / name / email
          TODAY IS...
          BGM title marquee + player
          hr
          Cool Links
          hr
          My WebRing

        td .content
          top navigation
          h1 Korean welcome
          intro paragraph with red <font>
          recent posts table
          visitor note / guestbook prompt
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
| `--cwk-viewport-width` | `800px` | 데스크톱에서 800x600 시대를 떠올리게 하는 기준 폭 |
| `--cwk-page-width` | `760px` | marquee와 메인 테이블 기준 폭 |
| `--cwk-home-sidebar-width` | `180px` | 홈 좌측 프로필/sidebar 폭 |
| `--cwk-guestbook-sidebar-width` | `200px` | 방명록 입력 영역 폭 |
| `--cwk-cell-padding` | `8px` | 메인 테이블 셀 padding |
| `--cwk-list-cell-padding` | `6px` | 글 목록/최근 글 테이블 padding |
| `--cwk-bg-stripe-step` | `8px` | 배경 사선 한 줄 간격 |
| `--cwk-bg-tile-size` | `16px` | 배경 사선 반복 단위 |
| `--cwk-gif-home-size` | `88px` | 레거시 장식 이미지가 필요할 때의 홈 기준 크기 |
| `--cwk-gif-small-size` | `60px` | 레거시 장식 이미지가 필요할 때의 작은 기준 크기 |

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

- `<meta name="viewport" content="width=device-width, initial-scale=1">`
- `<body background="" bgcolor="#e0e0e0">`
- `<center>`
- `<marquee behavior="alternate" scrollamount="4" width="760">`
- `<table width="760" border="1" cellspacing="0" cellpadding="8" bgcolor="#ffffff">`
- `<td width="180" valign="top">`
- `<tr bgcolor="#f0f0f0">`
- `<font size="+1">`, `<font color="red">`
- `<b>`, `<i>`, `<small>`, `<hr>`

현대 HTML/CSS 관점에서 더 깔끔하게 바꿀 수 있어도, 공개 사이트에서는 이 속성들을 보존하는 편이 맞다. 단, viewport는 모바일에서 PC판을 축소 표시하지 않고 레트로 레이아웃을 세로로 접기 위해 `device-width`를 쓴다.

## 모바일 규칙

모바일 최적화는 “현대식 반응형 리디자인”이 아니라 “760px 개인 홈페이지가 작은 브라우저 안에서 접히는 모드”다.

- 데스크톱의 760px 테이블, marquee, 노란 배너, 좌측 sidebar 감성은 기본값으로 유지한다.
- 모바일에서만 메인 2-column table을 세로로 접는다.
- Home 모바일에서는 sidebar를 숨기지 않고, 프로필을 가로형 미니 명함처럼 압축해서 보여준다. Cool Links와 My WebRing은 본문 아래 맨 하단으로 보낸다.
- 글방, 글 상세, 프로그램실, 나사잡, Guestbook, About 모바일에서는 sidebar를 숨기고 navigation 다음에 본문이 바로 오게 한다.
- navigation은 hamburger로 바꾸지 않고 기존 `[ Home | 글방 | 프로그램실 | 나사잡 | Guestbook | About ]` 링크 묶음을 여러 줄로 감싼다.
- 글 목록, 최근 글, 방명록 preview는 카드가 아니라 table row 문법을 유지한다.
- 모바일 보정은 `@media (max-width: 640px)` 안에서 처리해 PC 화면이 바뀌지 않게 한다.

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
- `VISITORS: TOTAL 0000000 TODAY 0000`
- `최근 글(Last Updates)`
- `MP3 추가`
- `Back to Home`

관리자 로그인 상태에서는 `TODAY` 옆에 작은 `▲`, `▼` 버튼을 붙일 수 있다. 공개 방문자에게는 보이지 않는 owner-only 조절 장치이며, 버튼도 오래된 HTML form control처럼 작고 기능적으로 보여야 한다.

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

홈과 공개 메인 IA 페이지는 기본적으로 같은 2-column shell을 쓴다. 사용자가 `Home`, `글방`, `글 상세`, `나으 하루`, `프로그램실`, `나사잡`, `Guestbook`, `About / Contact` 사이를 이동할 때 다른 문서로 튀는 느낌이 아니라 같은 개인 홈페이지의 오른쪽 본문만 바뀌는 느낌이어야 한다.

내부 이동은 SPA-like router가 담당한다. 왼쪽 profile/sidebar와 BGM player는 유지하고, 오른쪽 `.content`만 새 HTML에서 가져와 교체한다. 전체 페이지 reload로 BGM이 끊기는 경험은 피한다.

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

글 목록, 최근 글, 나으 하루, 미디어/나사잡 목록은 table row가 기본이다.

```html
<table border="1" cellspacing="0" cellpadding="6" width="100%">
  <tr bgcolor="#f0f0f0">
    <th align="left">...</th>
    <th>...</th>
  </tr>
</table>
```

카드 그리드, masonry, 모던 list item 컴포넌트는 기본값으로 쓰지 않는다.

### Daily Room

`나으 하루`는 가벼운 일상 조각을 글방에서 분리하되, 방문자에게는 글방과 같은 홈페이지 문법으로 읽히는 날짜별 기록실이다.

- 메뉴명은 `나으 하루`로 둔다.
- 데이터는 PocketBase `daily_entries` 컬렉션에서 온다. `posts`와 섞지 않는다.
- 구분 단위는 글이 아니라 `day_key` 기준 하루다. 같은 날짜에 새로 쓰면 새 row가 아니라 기존 하루 본문 아래에 이어 붙는다.
- 작성 화면은 글방의 WYSIWYG Markdown 작성 화면과 같은 긴 본문 작성 경험이어야 한다. 새 전용 짧은 입력창이나 SNS composer처럼 바꾸지 않는다.
- 첫 화면 위쪽은 월간 캘린더 table이다. 기록이 있는 날짜만 링크처럼 보이고, 오늘 날짜는 오래된 원색 강조로 표시한다.
- 첫 화면 아래쪽은 하루 table이다. 카드나 피드 카드가 아니라 `하루 / 날짜 / OWNER` 같은 table row로 쌓는다.
- 캘린더 날짜나 table row를 누르면 `daily/view.html?slug=YYYY-MM-DD`로 들어간다.
- 상세 URL은 글방과 같은 timeline 방식이다. 해당 날짜가 `NOW READING`으로 포커스되고, 위아래에 다른 하루 기록이 이어진다.
- 캘린더는 장식이 아니라 IA다. 방문자는 “개별 글”이 아니라 “그날의 하루”를 찾아 읽는다.

### Programs Room

`프로그램실`은 사용자가 만든 프로그램을 작품이자 다운로드 가능한 물건으로 보여주는 공개 자료실이다.

- 1시간짜리 실험작과 장기 프로젝트를 같은 무게로 둔다.
- 첫 화면은 모던 포트폴리오 카드가 아니라 옛날 프리웨어 자료실 table이어야 한다.
- 각 row는 대표 이미지/표지 슬롯, 프로그램명, 상태, 플랫폼, 한 줄 소개, 받기 링크를 함께 보여준다.
- 목록 row는 상세 설명 전체가 아니라 preview다. 표지, 프로그램명, `상세 이야기 보기` 링크를 누르면 `programs/view.html?slug=...` 작품 상세페이지로 들어간다.
- 상태는 `[BETA]`, `[RELEASED]`, `[PROTOTYPE]`, `[UNRELEASED]` 같은 게시판 말머리로 표시한다.
- 다운로드 파일과 TestFlight/Web Demo/GitHub 대표 링크는 별도 하단 인덱스로 중복하지 않고 목록 row의 받기 영역과 상세페이지에서 보여준다.
- 아직 공개 전인 프로젝트도 `UNRELEASED` 예고편처럼 올릴 수 있다.
- 대표 이미지는 중요하지만 그리드로 위계를 만들지 않고, table 안의 고정 preview cell로 다룬다.
- 데이터는 PocketBase `programs` 컬렉션에서 온다. 로그인한 주인장은 같은 프로그램실 화면 안에서 프로그램을 추가, 수정, 삭제한다.
- 표지는 `cover_image` 업로드가 있으면 그 이미지를 우선한다. 없으면 프로그램명, 상태, slug를 써서 자동 레트로 표지를 만든다.
- 상세페이지에서는 WYSIWYG Markdown 에디터로 작성된 자유 본문을 보여준다. 제작 배경, 해결 방식, 제작 노트, 스크린샷 이미지는 고정 칸이 아니라 본문 안에서 자유롭게 배치한다.
- `.dmg`, `.zip` 같은 배포 파일은 프로그램 레코드의 `download_files`에 직접 붙이고, TestFlight/GitHub/Web Demo는 대표 링크 하나로 넣는다.
- 목록 정렬은 별도 숫자 순서가 아니라 최신 등록순이다.

### Nasajab

`나사잡`은 “나를 사로 잡은 것들”을 사진/캡처 중심으로 올리는 공개 채집함이다.

- 메뉴명은 짧게 `나사잡`, 페이지 큰 제목은 `나를 사로 잡은 것들`로 둔다.
- 모던 갤러리나 포트폴리오가 아니라 옛 개인 홈페이지의 자료실/아카이브여야 한다.
- 첫 화면 위쪽은 최신 또는 선택된 항목 1개를 크게 보여주는 `TODAY'S 나사잡` table이다.
- 아래쪽은 `나사잡 아카이브` 성격의 table이다. 최신 항목까지 포함한 모든 나사잡을 `No.`, `Thumbnail`, `메모`, `날짜`, owner action으로 구성하고, 많이 쌓일 수 있으니 5개 단위 페이지 번호 `[ 1 2 3 ... ]`를 둔다.
- 아카이브 항목을 누르면 같은 페이지 상단 큰 영역에서 확대해 본다. 별도 모던 lightbox나 카드 상세 화면을 만들지 않는다.
- 제목과 내용은 나누지 않는다. 사진/캡처 옆에 남기는 짧은 글은 `메모` 하나뿐이고, 메모가 없으면 `메모 없이 잡힌 것`으로 둔다.
- 데이터는 PocketBase `nasajab` 컬렉션에서 온다. 방문자는 `is_public=true`인 항목만 보고, 로그인한 주인장은 같은 공개 화면 안의 `OWNER MODE`에서 이미지 업로드, 수정, 삭제를 한다.
- 이미지가 중심이지만 격자/masonry로 정리하지 않는다. 상단 큰 이미지와 아래 작은 thumbnail table의 대비가 핵심이다.
- 상단 큰 `TODAY'S 나사잡` table은 데스크톱과 모바일 모두 사진 위, 본문 아래의 세로 흐름을 유지한다.

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

### Post Detail / Timeline

글 상세 URL은 단일 글 문서가 아니라 해당 글 위치로 이동한 글방 timeline이다. 특정 글 링크를 열면 그 글이 첫 포커스가 되고, 그 위에는 더 최근 글, 그 아래에는 더 오래된 글이 이어진다. 개별 공유 URL은 유지하지만 읽기 경험은 X/Twitter처럼 연속 스크롤에 가깝다.

나으 하루 상세 URL도 같은 timeline 문법을 쓴다. 차이는 포커스 단위가 글이 아니라 날짜별 하루 record라는 점이다.

타임라인 entry는 모던 카드가 아니라 오래된 홈페이지의 dashed entry/table 문법이어야 한다. 현재 글만 `NOW READING` 배지와 오래된 원색 강조로 구분한다.

- 본문은 기존 `ql-editor` 호환 타이포그래피를 쓴다. 클래스명은 공개 본문 스타일 훅으로 남지만 작성기는 TOAST UI 기반 WYSIWYG Markdown이다.
- `font-family: Georgia, serif`, `font-size: 16px`, `line-height: 1.42`, 문단 margin `0`이 기준이다.
- 코드/blockquote/list/image는 Markdown에서 변환된 HTML을 기존 본문 CSS 안에서 렌더링한다.
- 하단에는 텍스트 링크로 `글방 첫 페이지로`를 둔다.

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
