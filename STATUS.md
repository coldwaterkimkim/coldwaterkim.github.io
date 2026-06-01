# STATUS

## 현재 제품 결정

레트로 감성 개인 홈페이지를 유지하면서 CMS는 PocketBase로 간다.

배포는 우선 하이브리드로 간다. `coldwaterkim.com` 프론트엔드는 GitHub Pages에 두고, PocketBase는 `api.coldwaterkim.com` API 서버로 붙인다.

공개 사이트의 디자인 기준은 현재 `index.html` 홈페이지, `design.md`, `css/styles.css`의 `:root` 디자인 토큰에 고정한다. 새 공개 페이지나 UI 수정은 현재 홈의 90s 개인 홈페이지 감성을 먼저 보존하고, 의도적으로 방향을 바꿀 때만 `design.md`, CSS 토큰, `STATUS.md`를 함께 갱신한다.

공개 메인 IA 페이지(`Home`, `글방`, `글 상세`, `Guestbook`, `About / Contact`)는 모두 홈의 2-column shell을 기본 레이아웃으로 쓴다. 즉 상단 marquee, 노란 visitor banner, 왼쪽 프로필/sidebar, 오른쪽 content 상단 navigation은 유지하고, 페이지별 내용만 오른쪽 content 영역에서 바뀌게 한다.

모바일에서는 같은 shell을 유지하되, 640px 이하 화면에서만 메인 2-column table이 세로로 접힌다. Home은 프로필을 가로형 미니 명함으로 압축하고 Cool Links/My WebRing은 본문 하단으로 보내 정체성을 남긴다. 글방/글 상세/Guestbook/About는 sidebar를 숨겨 navigation 다음에 본문이 바로 오게 한다. 데스크톱의 760px PC 레이아웃은 기본값으로 보존한다.

이 결정의 이유:

- 글을 자주 쓰려면 HTML 파일 복사보다 관리자 화면이 편하다.
- 방명록과 미디어 업로드는 정적 사이트만으로는 운영이 어렵다.
- repo에 이미 PocketBase 관리자, 스키마, 배포 파일이 있어서 그 방향을 완성하는 게 빠르다.
- 지금 홈의 수제 레트로 감성이 제품 정체성이므로, 이후 기능 추가 때 현대적인 랜딩페이지나 카드형 UI로 흐르지 않게 기준 문서가 필요하다.
- GitHub Pages는 코드 수정을 빠르게 도메인에 반영하기 좋지만 서버 프로세스를 못 띄우므로, CMS는 별도 PocketBase 서버가 필요하다.

## 현재 동작

- 공개 홈은 PocketBase에서 최근 발행 글을 가져오며, 발행일이 같은 글은 실제 작성 시각이 최신인 글을 먼저 보여준다.
- 글 목록은 홈과 같은 shell 안에서 PocketBase `posts` 컬렉션의 `published` 글만 보여주며, 홈 최근 글과 같은 최신순 기준을 쓴다.
- 글 상세는 홈과 같은 shell 안에서 `slug`로 PocketBase 글을 조회한다.
- 방명록은 홈과 같은 shell 안에서 PocketBase `guestbook` 컬렉션을 읽고 쓴다. 방문자는 닉네임을 직접 입력할 수 있고, 비워두면 `익명의 누군가N` 이름이 붙는다. 초기 방명록처럼 보이는 글은 `display_date`를 표시/정렬용 날짜로 쓰고, 일반 작성 글은 실제 `created` 날짜를 쓴다.
- 방문자 카운터는 PocketBase `visitor_sessions` 컬렉션을 사용한다. 같은 브라우저의 30분 내 새로고침/페이지 이동은 중복 집계하지 않고, `TOTAL`은 운영 누적 방문 세션 23개를 표시 기준값 231로 환산한 뒤 이후 새 세션마다 1씩 더해 보여준다. `TODAY`는 KST 날짜 기준 실제값과 관리자 보정 최소값 중 큰 값을 보여주며, 로그인한 관리자만 공개 화면에서 위/아래 버튼으로 보정할 수 있다.
- 공개 메뉴에는 관리자 링크를 두지 않는다. 상단 marquee의 `coldwaterkim` 텍스트가 숨은 로그인 진입점이다.
- 로그인한 관리자는 공개 사이트를 그대로 보면서 홈 문구 편집, 글방의 새 글/수정/삭제, 글 상세의 수정/삭제, 방명록 삭제 같은 `OWNER MODE` 권한을 추가로 본다.
- `/admin/`은 별도 대시보드가 아니라 예전 북마크용 안내판이고, 실제 운영 시작점은 공개 Home이다. 글 편집기/미디어/방명록 관리 화면은 owner action에서 필요할 때만 열린다.
- 글 편집기의 Quill 본문 이미지는 URL 입력이 아니라 이미지 버튼, 드래그 앤 드롭, 붙여넣기로 업로드할 수 있다. 업로드된 파일은 `media` 컬렉션에 저장되고, 본문 HTML에는 공개 파일 URL이 들어간다.
- 대표 이미지는 별도 파일 업로드가 아니라 본문 이미지에서 정한다. 기본값은 첫 번째 본문 이미지이며, 이미지가 여러 개면 특정 이미지를 고르거나 `없음`으로 저장할 수 있다. 이 선택값은 `posts.featured_image_mode`, `posts.featured_image_url`에 저장한다.
- 로컬 UI 수정 중 운영 글 데이터까지 같이 보고 싶을 때는 `npm run dev:live-cms`를 쓴다. 이때 로컬 Vite 서버의 `/api/*` 요청은 `https://api.coldwaterkim.com`으로 프록시된다.

## 남은 세팅

- 실제 글 1개 작성 후 공개 화면 확인
- API 서버 배포 시 `deploy/nginx-api-subdomain.conf`와 PocketBase systemd 서비스 확인
- Fly.io를 쓰는 경우 `fly.toml`, `deploy/fly/`, `scripts/deploy-pocketbase-fly.sh` 기준으로 배포

## 주의

PocketBase 서버가 꺼져 있으면 공개 사이트는 렌더링되지만 글/방명록 영역은 CMS 연결 실패 메시지를 보여준다.

`api.coldwaterkim.com`은 Cloudflare DNS 전용 A record로 Oracle VM에 연결되어 있다.

## 로컬 검증 기록

- PocketBase `v0.23.5` 로컬 실행 확인
- `posts`, `guestbook`, `site_settings`, `media` 컬렉션 생성 확인
- `users` auth collection 로그인 확인
- 테스트 글 `cms-first-post`가 홈, 글 목록, 글 상세에 반영됨
- 방명록 공개 작성/조회 확인

운영 프론트엔드는 GitHub Pages 자동 배포 대상으로 정리했다. 운영 PocketBase API 서버는 아직 연결 전이라, CMS 데이터의 live 반영은 `api.coldwaterkim.com` 서버 세팅 후 완료된다.

## 배포 준비 기록

- GitHub Actions 배포 워크플로를 PocketBase 기준으로 정리했다.
- Supabase secret 의존성을 제거했다.
- GitHub Pages 배포 시 `coldwaterkim.com` CNAME이 유지되도록 설정했다.
- `coldwaterkim.com` 배포본은 자동으로 `https://api.coldwaterkim.com` PocketBase에 연결되도록 했다.
- Fly.io + persistent volume 기준 PocketBase 배포 설정을 추가했다.
- Oracle Always Free VM 기준 PocketBase 배포 스크립트와 문서를 추가했다.
- Oracle VM `coldwaterkim-pocketbase-api`를 생성했다.
  - Region: `ap-chuncheon-1`
  - Shape: `VM.Standard.E2.1.Micro`
  - Public IPv4: `134.185.98.185`
  - Cost guard: Oracle Budget `coldwaterkim-pocketbase-budget`, 월 US$1, 1% actual spend 알림
- 운영 PocketBase `v0.23.5`, Nginx, systemd 서비스를 Oracle VM에 설치했다.
- Oracle 이미지 기본 iptables가 TCP 80/443을 막고 있어 host firewall 허용 규칙을 추가했고, `iptables-persistent`로 유지되게 했다.
- 외부에서 `http://134.185.98.185/api/health`를 `Host: api.coldwaterkim.com` 헤더로 호출했을 때 `200 OK`를 확인했다.
- Cloudflare DNS에 `api.coldwaterkim.com -> 134.185.98.185` A record를 추가했다.
- Let's Encrypt/certbot으로 `https://api.coldwaterkim.com` 인증서를 발급했고 HTTP는 HTTPS로 redirect된다.
- 운영 PocketBase에 `posts`, `guestbook`, `site_settings`, `media` 컬렉션을 반영했다.
- `users` auth collection은 공개 회원가입을 막고, 사이트 관리자 계정만 생성했다.
- 관리자 credentials는 로컬 보안 파일 `~/.config/coldwaterkim/pocketbase-admin.env`에 저장했다.
- `https://api.coldwaterkim.com/api/health`가 `200 OK`로 응답한다.
- `https://coldwaterkim.com/admin/`에서 테스트 계정으로 로그인 후 대시보드 진입을 확인했고, 테스트 계정은 삭제했다.
- `https://coldwaterkim.com/` 공개 홈은 CMS 연결 실패 없이 빈 글 목록 상태로 렌더링된다.
- 로컬 프론트엔드에서 운영 CMS를 읽는 `dev:live-cms` 모드를 추가했다. 글을 도메인 관리자에서 작성하고 로컬 UI에서 레이아웃을 볼 때는 이 모드를 기본으로 쓴다.
- 운영 PocketBase에 `visitor_sessions` 컬렉션을 반영했다. 공개 create/list/view는 열고, update/delete는 관리자만 가능하게 유지한다.
- 운영 PocketBase `guestbook` 컬렉션에 `display_date` 필드를 추가했고, 2025년 11월부터 2026년 5월까지 지인형 초기 방명록 23개를 반영했다.
