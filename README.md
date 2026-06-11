# coldwaterkim.com

레트로 감성 개인 홈페이지 + PocketBase CMS.

목표는 단순하다. 방문자는 90s 느낌의 개인 홈페이지를 보고, 나는 같은 화면을 둘러보다가 로그인 상태에서만 열리는 `OWNER MODE` 버튼으로 글과 미디어와 방명록을 관리한다. 공개 사이트 안에서 메뉴를 이동할 때는 shell을 유지하고 오른쪽 content만 바꾸는 SPA-like 라우팅을 써서 BGM이 끊기지 않게 한다.

## 현재 방향

- 공개 사이트: `index.html`, `posts/index.html`, `posts/view.html`, `daily/index.html`, `daily/view.html`, `programs/index.html`, `programs/view.html`, `nasajab/index.html`, `guestbook.html`, `about.html`
- 관리: 공개 페이지 위의 `OWNER MODE` + 홈의 통합 글쓰기 허브 + 필요할 때 열리는 `admin/*.html` 편집 화면
- CMS/DB: PocketBase
- 빌드 도구: Vite
- 배포 기준: GitHub Pages 프론트 + PocketBase API 서버

GitHub Pages는 정적 파일만 서빙하므로 PocketBase 서버를 직접 같이 띄울 수는 없다. 그래서 지금 기준은 `coldwaterkim.com`은 GitHub Pages가 맡고, CMS/API는 `api.coldwaterkim.com`의 PocketBase 서버가 맡는 구조다.

이렇게 하면 코드/UI 수정은 `main` 브랜치에 push되는 순간 GitHub Actions가 빌드해서 `coldwaterkim.com`에 반영하고, 글/방명록/미디어 수정은 로그인한 공개 화면의 owner action에서 저장하는 즉시 PocketBase를 통해 공개 사이트에 반영된다.

## 로컬 실행

로컬 PocketBase 샌드박스로 확인:

```bash
npm run dev
```

위 명령은 기존처럼 `http://127.0.0.1:8090`의 로컬 PocketBase를 본다. 운영 글을 건드리지 않고 스키마나 관리자 기능을 테스트할 때 쓴다.

도메인에 쓴 실제 글/방명록으로 로컬 UI 확인:

```bash
npm run dev:live-cms
```

이 모드는 로컬 프론트엔드만 띄우고, `/api/*` 요청은 Vite dev proxy가 `https://api.coldwaterkim.com`으로 넘긴다. 그래서 `coldwaterkim.com/admin/`에서 글을 쓰면 로컬 레이아웃 미리보기에도 같은 데이터가 바로 보인다. 단, 이 모드에서 로컬 `/admin/`으로 로그인하면 운영 CMS를 수정하는 것이므로 주의한다.

로컬 CMS까지 완전히 따로 확인:

```bash
./pocketbase serve --http=127.0.0.1:8090
npm run dev:local-cms
```

PocketBase 바이너리는 repo에 넣지 않는다. 로컬 검증은 `v0.23.5`로 완료했다. macOS에서는 PocketBase 릴리즈에서 `darwin_arm64` 바이너리를 받아 `.local-bin/pocketbase` 또는 프로젝트 루트의 `pocketbase`로 둔다.

## PocketBase 세팅

필요한 컬렉션:

- `users`: 관리자 ID 로그인을 위한 auth collection
- `posts`: 글. 작성기는 TOAST UI 기반 WYSIWYG Markdown 에디터이고 저장값은 공개 렌더링 호환을 위해 HTML로 저장한다. 이미지는 본문 안에 직접 넣고, 별도 대표 이미지 로직은 쓰지 않는다.
- `daily_entries`: 나으 하루. 글방과 별도 저장소를 쓰되 같은 WYSIWYG Markdown 작성 경험을 쓰고, 구분 단위는 글이 아니라 `day_key` 기준 하루다.
- `programs`: 프로그램실. 만든 프로그램의 표지, 상태, 한 줄 소개, 자유 본문, 대표 링크, 다운로드 파일을 저장한다.
- `nasajab`: 나사잡. 나를 사로 잡은 사진/캡처 1장, 선택 메모, 출처 링크, 공개 여부를 저장한다.
- `guestbook`: 방명록
- `site_settings`: 홈 문구, 프로필 사진 URL, 홈 BGM 최신곡 URL/제목/플레이리스트 같은 간단 설정
- `visitor_sessions`: `TOTAL / TODAY` 방문자 카운터를 위한 30분 세션 기록
- `media`: 이미지/영상/오디오/PDF 업로드

기본 스키마 초안은 `pb_schema.json`에 있다. PocketBase Admin UI에서 스키마를 가져오고, 기본 `users` auth collection에 실제 관리자 ID/비밀번호 계정을 만든다. 이 사이트는 공개 회원가입이 필요 없으니 `users`의 create rule은 닫아두는 편이 맞다.

방문자 카운터는 새로고침마다 숫자를 올리는 페이지뷰가 아니라, 같은 브라우저의 30분 내 활동을 1회 방문으로 묶는다. `TODAY`는 KST 날짜 기준이고, `TOTAL`은 운영 누적 방문 세션 23개를 표시 기준값 231로 환산한 뒤 이후 새 세션마다 1씩 더해 보여준다. 로그인한 관리자는 공개 화면에서 `TODAY` 옆의 위/아래 버튼으로 오늘 표시 최소값을 조절할 수 있고, 이 보정값은 `site_settings`의 `visitor_today_min_YYYY-MM-DD` 키에 저장된다.

방명록은 닉네임을 비워두면 `익명의 누군가N` 형식으로 저장하고, 직접 입력하면 그 닉네임을 쓴다. `guestbook.display_date`는 초기 방명록처럼 보이는 날짜를 따로 보여줄 때만 쓰는 선택 필드이며, 일반 방문자가 작성한 글은 실제 `created` 날짜로 표시된다.

## 글 쓰기 흐름

홈에서 바로 시작하는 통합 글쓰기 흐름:

1. 홈 상단 marquee의 `coldwaterkim` 텍스트 클릭
2. 로그인 후 공개 Home으로 복귀
3. Home의 `OWNER MODE`에서 `통합 글쓰기` 클릭
4. 먼저 카테고리를 `글방`, `나으 하루`, `프로그램실` 중 하나로 선택한다. 나사잡은 이미지 아카이브 성격이 달라 이 통합 허브에서는 제외한다.
5. 본문은 같은 WYSIWYG Markdown 에디터에서 작성한다. 본문 이미지는 이미지 버튼, 드래그 앤 드롭, 붙여넣기로 넣는다.
6. `프로그램실`을 선택하면 같은 본문 에디터 아래/위에 상태, 플랫폼, 한 줄 소개, 표지, 파일, 대표 링크 같은 프로그램 전용 필드가 추가로 열린다.
7. 임시 저장은 글방/나으 하루에서는 `draft`, 프로그램실에서는 `is_public=false`로 저장하고, 발행하기는 공개 상태로 저장한다.

기존 글방 작성 흐름:

1. 홈 상단 marquee의 `coldwaterkim` 텍스트 클릭
2. 로그인 후 공개 Home으로 복귀
3. 글방이나 글 상세의 `OWNER MODE`에서 새 글/수정/삭제
4. 본문은 Notion처럼 렌더링되는 WYSIWYG Markdown 화면에서 작성한다. 본문 중간 이미지는 이미지 버튼, 드래그 앤 드롭, 붙여넣기로 넣는다. 이미지는 `media` 컬렉션에 저장되고 작성기에는 이미지 블록으로 들어간다.
5. 대표 이미지는 따로 정하지 않는다. 본문 이미지는 본문 위치에만 보인다.
6. 상태를 `발행됨`으로 저장
7. 저장할 때 에디터 본문은 HTML로 변환되어 기존 공개 본문 스타일 그대로 홈 최근 글, 글 목록, 글 상세에 자동 반영된다.

## 나으 하루 쓰기 흐름

1. 홈 상단 marquee의 `coldwaterkim` 텍스트 클릭
2. 로그인 후 `나으 하루`로 이동
3. `OWNER MODE`의 `새 나으 하루 쓰기` 클릭
4. 글방과 같은 WYSIWYG Markdown 작성 화면에서 제목, 기록 날짜, 본문, 본문 이미지를 입력한다. 기록 날짜는 기본값이 오늘이지만 과거 날짜로 바꿀 수 있다.
5. 저장 시 기록 날짜의 `day_key`를 기준으로 같은 날짜의 `daily_entries` 레코드가 이미 있는지 확인한다.
6. 같은 날짜 기록이 없으면 새 하루를 만들고, 이미 있으면 새 본문을 기존 하루 본문 아래에 이어 붙인다.
7. 공개 목록은 상단 월간 캘린더와 하단 하루 table로 보이고, 상세 URL은 글방처럼 전체 하루 timeline 안에서 해당 날짜를 포커스한다.

## 프로필/BGM 바꾸기 흐름

1. 홈 상단 marquee의 `coldwaterkim` 텍스트 클릭
2. 로그인 후 공개 사이트로 돌아오기
3. 프로필 사진을 클릭해서 새 이미지를 업로드하면 `media`에 저장되고 `site_settings.profile_photo_url`이 갱신된다.
4. 미니 플레이어 아래 `MP3 추가` 버튼으로 새 MP3를 업로드하면 파일은 `media`에 저장되고, `site_settings.bgm_playlist` 맨 앞에 최신 트랙으로 추가된다. 기존 `site_settings.bgm_audio_url`, `site_settings.bgm_audio_title`은 최신곡 호환용으로 같이 갱신된다.
5. 방문자는 저장된 프로필 사진과 현재 BGM 제목 marquee를 본다. BGM은 최신 업로드순으로 재생되고, 마지막 곡이 끝나면 다시 최신곡으로 돌아간다. 예를 들어 기존 곡이 1이고 새 곡이 2면 `2 -> 1 -> 2 -> 1` 순서로 돈다.
6. 브라우저가 허용하면 BGM은 접속 시 자동 재생된다. 자동재생이 막히면 `BGM ON` 버튼과 첫 사용자 입력 뒤 다시 재생을 시도한다.

공개 사이트의 내부 링크는 `js/site.js`가 가로채서 새 HTML의 `.content` 영역만 가져와 교체한다. 이 덕분에 왼쪽 프로필과 BGM 플레이어는 같은 DOM으로 남고, Home / 글방 / 프로그램실 / 나사잡 / Guestbook / About 이동 중에도 음악이 끊기지 않는다. 직접 URL로 들어가거나 새로고침하면 기존 HTML 페이지가 그대로 렌더링된다.

## 프로그램 올리기 흐름

1. 홈 상단 marquee의 `coldwaterkim` 텍스트 클릭
2. 로그인 후 `프로그램실`로 이동
3. `OWNER MODE`의 `새 프로그램` 버튼 클릭
4. 이름, 상태, 플랫폼, 한 줄 소개를 입력한다.
5. 앱 대표 이미지가 있으면 `표지`에 첨부한다. 없으면 프로그램명/상태 기반 레트로 표지가 자동으로 보인다.
6. 상세페이지용 긴 이야기, 사용법, 제작 배경, 스크린샷은 WYSIWYG Markdown 자유 본문에 넣는다. 저장 시 공개 페이지용 HTML로 변환된다.
7. `.dmg`, `.zip` 같은 배포 파일은 `파일`에 첨부하고, TestFlight/GitHub/Web Demo는 대표 링크에 적는다.
8. 프로그램 목록은 별도 순서값 없이 최신 등록순으로 보인다.

프로그램실 첫 화면은 preview table이다. 각 row의 표지/이름/`상세 이야기 보기`를 클릭하면 `programs/view.html?slug=...` 상세페이지로 들어가고, 거기서 자유 본문과 다운로드/링크를 본다.

## 나사잡 올리기 흐름

1. 홈 상단 marquee의 `coldwaterkim` 텍스트 클릭
2. 로그인 후 `나사잡`으로 이동
3. `OWNER MODE`의 `새 나사잡` 버튼 클릭
4. 사진/캡처/GIF를 `이미지`에 첨부하거나, 웹에서 복사한 이미지를 붙여넣기 박스에 바로 붙여넣는다.
5. 붙여넣은 이미지는 기존 파일 선택과 같은 `nasajab.image` 파일 필드로 저장된다. 클립보드에 이미지 파일 대신 URL만 있으면 출처 링크만 자동으로 채우고, 이미지는 다시 선택하거나 붙여넣어야 한다.
6. 메모, 출처 링크, 잡힌 시각은 선택 사항이다. 제목과 내용은 나누지 않고 메모 하나만 남긴다.
7. `공개` 체크가 켜진 레코드만 방문자에게 보인다.

나사잡 첫 화면은 최신 항목 1개를 크게 보여주는 `TODAY'S 나사잡` table과, 그 아래 5개 단위 페이지네이션이 붙은 `나사잡 아카이브` table로 나뉜다. 아카이브 table에는 최신 항목까지 포함해 모든 나사잡이 뜨고, 메모나 썸네일을 누르면 같은 페이지의 상단 큰 영역에서 확대되어 보인다.

## 빌드

```bash
npm run build
```

빌드 결과는 `dist/`에 생긴다. 배포 서버의 Nginx는 `dist/`를 정적 루트로 보고, `/api/` 요청만 PocketBase로 넘긴다.

GitHub Pages 배포에서는 이 `dist/` 폴더를 GitHub Actions가 `gh-pages` 브랜치로 올린다. 전체 VPS 배포를 선택할 때만 서버의 Nginx가 `dist/`를 직접 서빙한다.

## 배포

### 프론트엔드

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 자동 실행된다.

- Node 22로 `npm ci`
- `npm run build`
- `dist/`를 `gh-pages` 브랜치에 배포
- `coldwaterkim.com` CNAME 유지

### CMS/API

운영 PocketBase는 `api.coldwaterkim.com`에서 띄우는 걸 기본값으로 둔다. 공개 사이트의 `js/pb.js`는 배포 도메인이 `coldwaterkim.com`이면 자동으로 `https://api.coldwaterkim.com`에 연결한다.

VPS에서 API만 운영할 때는 `deploy/nginx-api-subdomain.conf`와 `deploy/pocketbase.service`를 사용한다. 전체 사이트까지 VPS로 옮기는 선택지를 택할 때는 `deploy/nginx.conf`를 사용한다.

무료를 최대한 유지하려면 Oracle Always Free VM에 `api.coldwaterkim.com` PocketBase를 올리는 경로가 1순위다. 이때는 `deploy/oracle/`을 사용한다.

Fly.io로 API 서버를 올릴 때는 `fly.toml`, `deploy/fly/`, `scripts/deploy-pocketbase-fly.sh`를 사용한다. Fly.io는 더 단순하지만 결제수단/사용량 과금 가능성이 있으므로 무료 최우선 경로는 아니다.

## 중요한 구조

- `js/pb.js`: PocketBase 연결, 인증, 글/방명록/미디어 API 헬퍼
- `daily/index.html`: 나으 하루 캘린더 + 하루 table 목록 페이지
- `daily/view.html`: 나으 하루 상세 딥링크가 포커스되는 timeline 페이지
- `js/programs.js`: 프로그램실 공개 목록, row별 받기 링크, owner 작성/수정/삭제 UI
- `js/program-detail.js`: 개별 프로그램 상세페이지 렌더링
- `js/nasajab.js`: 나사잡 대표 항목, 아카이브 페이지네이션, owner 이미지 업로드/수정/삭제 UI
- `vite.config.js`: `npm run dev:live-cms`에서 로컬 `/api/*`를 운영 PocketBase로 프록시
- `js/site.js`: 공개 사이트 공통 동작, 최근 글, 방명록
- `programs/index.html`: CMS-backed 프로그램실 페이지
- `programs/view.html`: 개별 프로그램 상세페이지
- `nasajab/index.html`: CMS-backed 나사잡 페이지
- `admin/daily.html`: 글방 작성기와 같은 WYSIWYG Markdown 경험으로 `daily_entries`를 쓰고 같은 날짜 저장은 append 처리하는 owner 화면
- `admin/write.html`, `js/global-writer.js`: Home의 `통합 글쓰기` 버튼이 여는 새 글 허브. 기존 각 페이지 작성/수정 플로우를 대체하지 않고, 글방/나으 하루/프로그램실 새 레코드만 빠르게 만든다.
- `js/markdown-editor.js`: 글방, 나으 하루, 프로그램실 owner 본문 작성기가 공유하는 TOAST UI WYSIWYG Markdown 래퍼
- `admin/*.html`: 로그인/글 편집/미디어 등 owner action이 여는 편집 화면
- `design.md`: 공개 사이트의 90s 개인 홈페이지 감성을 유지하기 위한 디자인 기준
- `pb_schema.json`: PocketBase 컬렉션 설계 초안
- `pb_migrations/`: PocketBase 운영 스키마 마이그레이션
- `deploy/`: VPS 배포용 Nginx, systemd, 백업 스크립트
