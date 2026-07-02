# STATUS

## 현재 제품 결정

레트로 감성 개인 홈페이지를 유지하면서 CMS는 PocketBase로 간다.

배포는 현재 아이맥 홈서버 단일 구조다. `coldwaterkim.com`과 `www.coldwaterkim.com`은 집 공인 IP를 거쳐 아이맥 Caddy로 들어오고, 정적 파일과 PocketBase DB/파일 저장소는 같은 아이맥에서 운영한다. GitHub Pages 배포와 Oracle `api.coldwaterkim.com` VM은 컷오버 후 최소 7일 동안 롤백용으로 유지한다.

아이맥 운영 서비스는 macOS 시스템 LaunchDaemon으로 고정한다. Caddy, PocketBase, PocketBase 자동 백업은 사용자 로그인 전에도 부팅 시 자동 시작되며, PocketBase는 `kimchansu` 사용자 권한으로 `~/.local/share/coldwaterkim/home-server`의 운영 런타임을 사용한다.

아이맥의 기준 소스 작업 폴더는 iCloud Documents가 아니라 `~/Code/coldwaterkim.github.io`다. MacBook에서 작업하더라도 원칙적으로 아이맥에 원격 접속해 이 로컬 clone을 사용한다. 예전 iCloud 작업 폴더는 보관용으로만 두고 새 코드 수정, 빌드, 커밋, 푸쉬는 `~/Code/coldwaterkim.github.io`에서 진행한다.

공개 사이트의 디자인 기준은 현재 `index.html` 홈페이지, `design.md`, `css/styles.css`의 `:root` 디자인 토큰에 고정한다. 새 공개 페이지나 UI 수정은 현재 홈의 90s 개인 홈페이지 감성을 먼저 보존하고, 의도적으로 방향을 바꿀 때만 `design.md`, CSS 토큰, `STATUS.md`를 함께 갱신한다.

공개 메인 IA 페이지(`Home`, `글방`, `글 상세`, `나으 하루`, `프로그램실`, `나사잡`, `Guestbook`, `About / Contact`)는 모두 홈의 2-column shell을 기본 레이아웃으로 쓴다. 즉 상단 marquee, 노란 construction banner, 왼쪽 프로필/sidebar, 나무위키식 PROFILE DATA 표, 오른쪽 content 상단 navigation은 유지하고, 페이지별 내용만 오른쪽 content 영역에서 바뀌게 한다.

공개 사이트 내부 이동은 `js/site.js`의 SPA-like router가 처리한다. 같은 origin의 공개 HTML 링크를 클릭하면 전체 문서를 새로고침하지 않고 새 페이지의 `.content`만 fetch해서 교체하며, profile/sidebar/BGM은 유지한다. 따라서 BGM은 메뉴 이동 중 끊기지 않는다. 직접 URL 접근과 새로고침은 기존 정적 HTML 진입을 그대로 지원한다.

배포 캐시 완화를 위해 Vite 빌드는 `site-version.json`을 함께 생성한다. 공개 사이트 JS는 로드 후, 탭 재활성화 시, 그리고 1분 간격으로 이 버전 파일을 캐시 우회 쿼리와 함께 확인한다. 현재 JS에 박힌 빌드 버전보다 최신 버전이 보이면 현재 URL에 `?v=<version>`를 붙여 한 번만 새로고침한다. GitHub Pages의 HTML 캐시가 짧게 남아도 방문자가 강제 새로고침 없이 새 배포를 받게 하기 위한 장치다.

모바일에서는 같은 shell을 유지하되, 640px 이하 화면에서만 메인 2-column table이 세로로 접힌다. Home은 프로필을 가로형 미니 명함으로 압축하고 Cool Links/My WebRing은 본문 하단으로 보내 정체성을 남긴다. 글방/글 상세/나으 하루/프로그램실/나사잡/Guestbook/About는 sidebar를 숨겨 navigation 다음에 본문이 바로 오게 한다. 데스크톱의 1140px PC 레이아웃은 기본값으로 보존한다.

이 결정의 이유:

- 글을 자주 쓰려면 HTML 파일 복사보다 관리자 화면이 편하다.
- 방명록과 미디어 업로드는 정적 사이트만으로는 운영이 어렵다.
- repo에 이미 PocketBase 관리자, 스키마, 배포 파일이 있어서 그 방향을 완성하는 게 빠르다.
- 지금 홈의 수제 레트로 감성이 제품 정체성이므로, 이후 기능 추가 때 현대적인 랜딩페이지나 카드형 UI로 흐르지 않게 기준 문서가 필요하다.
- GitHub Pages는 코드 수정을 빠르게 도메인에 반영하기 좋지만 서버 프로세스를 못 띄우므로, CMS는 별도 PocketBase 서버가 필요하다.

## 현재 동작

- 공개 홈은 PocketBase에서 `글방`, `프로그램실`, `나사잡`의 최신 공개 항목 3개씩과 `나으 하루`의 최신 날짜 3일을 가져와 별도 table로 보여준다.
- 글 목록은 홈과 같은 shell 안에서 PocketBase `posts` 컬렉션의 `published` 글만 보여주며, 홈의 글방 최근 3개 table과 같은 최신순 기준을 쓴다.
- 글 상세 URL은 홈과 같은 shell 안에서 `slug`로 PocketBase 글을 조회하고 해당 글 하나만 렌더링한다. 글방 목록은 여러 글 table이고, 상세는 단일 글 페이지다.
- 나으 하루는 글방과 별도인 PocketBase `daily_entries` 컬렉션을 쓴다. 작성 화면은 글방과 같은 WYSIWYG Markdown 작성 경험을 유지하고, 같은 날짜에 여러 번 써도 각각 새 글 레코드로 저장한다. `day_key`는 저장 단위가 아니라 캘린더/정렬용 날짜 메타데이터다.
- 나으 하루 목록은 홈과 같은 shell 안에서 상단 월간 캘린더와 하단 하루 table로 보인다. 글이 있는 날짜는 캘린더에서 링크로 표시되고, 같은 날짜 기록이 여러 개면 캘린더와 table에 개수가 표시된다. table row나 캘린더 날짜를 누르면 `daily/view.html?day=YYYY-MM-DD` 상세로 들어간다.
- 나으 하루 상세 URL은 날짜 단위 상세 방식이다. 해당 날짜의 `daily_entries`만 모아 그날 안에서 오래된 시간부터 최신 시간순으로 보여준다. 예전 `?slug=...` 링크로 들어와도 해당 글이 속한 날짜를 찾아 같은 하루 상세로 해석한다.
- 프로그램실은 홈과 같은 shell 안에서 PocketBase `programs` 컬렉션을 읽어 table 자료실 형태로 보여준다. 첫 화면의 table row는 preview이며, 표지/이름/`상세 이야기 보기`를 누르면 `programs/view.html?slug=...` 상세페이지로 들어간다. 각 프로그램은 표지, 상태, 플랫폼, 한 줄 소개, 받기 링크를 같은 row 안에 담고, 1시간짜리 실험작과 장기 프로젝트를 같은 무게로 취급한다. 표지는 `cover_image`가 있으면 업로드 이미지를 쓰고, 없으면 `download_files`의 첫 이미지 파일이나 업로드 시 `.app.zip`에서 추출한 앱 아이콘을 자동 표지로 쓰며, 이미지/앱 아이콘이 없으면 `없음` 상태로 둔다. 목록 정렬은 별도 순서값 없이 최신 등록순이다.
- 프로그램 상세페이지는 같은 shell 안에서 WYSIWYG Markdown 에디터로 작성된 자유 본문, 다운로드 파일, 대표 링크를 보여준다. 제작 배경, 사용법, 스크린샷 이미지는 모두 본문 안에 배치한다. 목록 table이 자료실 인덱스라면 상세페이지는 개별 작품 페이지다.
- 나사잡은 홈과 같은 shell 안에서 PocketBase `nasajab` 컬렉션을 읽어 “나를 사로 잡은 것들”을 보여준다. 상단에는 최신 항목 또는 아카이브에서 선택한 항목 1개를 `TODAY'S 나사잡` table로 크게 보여주고, 아래에는 최신 항목을 포함한 모든 항목을 5개씩 `No. / Thumbnail / 메모 / 날짜` 아카이브 table로 쌓는다. 상단 큰 table은 사진과 본문을 항상 세로로 보여준다. 제목과 내용은 나누지 않고 `memo` 하나만 저장한다. 아카이브 메모/썸네일을 누르면 같은 페이지 상단 큰 영역에서 확대되어 보인다.
- 로그인한 관리자는 나사잡 작성/수정 폼에서 기존 파일 선택뿐 아니라 복사한 이미지 붙여넣기도 쓸 수 있다. 붙여넣은 이미지는 URL 참조가 아니라 기존 `nasajab.image` 파일 필드로 저장되고, 클립보드에 URL만 있으면 출처 링크만 채운다. 모바일 브라우저의 클립보드 지원 차이가 있으므로 앨범/카메라/파일 선택은 계속 유지한다.
- About / Contact는 일반 자기소개 페이지가 아니라 나무위키식 `김찬수` 문서로 보인다. 개요보다 먼저 보이는 프로필 표, 목차, 번호 섹션, 섹션별 `[편집]` 링크를 쓰며, 로그인한 관리자는 공개 페이지의 `OWNER MODE`에서 섹션 추가/수정/삭제/위아래 이동과 프로필 표 row 편집을 할 수 있다. 섹션 본문은 글방/나으 하루와 같은 WYSIWYG Markdown 편집기로 작성하고, 저장값은 새 컬렉션 없이 `site_settings.about_wiki_document` JSON에 둔다.
- About의 저장된 프로필 값과 섹션 본문 HTML은 전체 문서 템플릿에 한 번에 꽂지 않고 각 셀/섹션 내부에 따로 주입한다. 본문에 닫히지 않은 table 같은 불완전한 HTML이 남아도 OWNER MODE 편집 폼이 깨지지 않게 하기 위해서다.
- About 프로필 표와 왼쪽 sidebar의 PROFILE DATA 표는 `js/profile-data.js`의 기본 row와 `site_settings.about_wiki_document.profileRows`를 공유한다. sidebar는 좁은 표라 Social Media를 favicon 아이콘으로 계속 보여주고, About은 링크 텍스트가 들어간 문서형 표로 보여준다.
- 방명록은 홈과 같은 shell 안에서 PocketBase `guestbook` 컬렉션을 읽고 쓴다. 방문자는 닉네임을 직접 입력할 수 있고, 비워두면 `익명의 누군가N` 이름이 붙는다. 초기 방명록처럼 보이는 글은 `display_date`를 표시/정렬용 날짜로 쓰고, 일반 작성 글은 실제 `created` 날짜를 쓴다.
- 방문자 카운터는 PocketBase `visitor_sessions` 컬렉션을 사용한다. 같은 브라우저의 30분 내 새로고침/페이지 이동은 중복 집계하지 않고, 게스트에게는 숫자 대신 상단 배너에 `OPEN 24H, UPDATED SOMETIMES`를 보여준다. 로그인한 관리자에게만 `TOTAL`/`TODAY` 카운터를 보여주며, `TOTAL`은 운영 누적 방문 세션 23개를 표시 기준값 237로 환산한 뒤 이후 새 세션마다 1씩 더해 보여준다. `TODAY`는 KST 날짜 기준 실제값과 관리자 보정 최소값 중 큰 값을 보여주며, 로그인한 관리자만 공개 화면에서 위/아래 버튼으로 보정할 수 있다.
- 글별 조회수는 PocketBase `post_views` 컬렉션을 사용한다. 일반 방문자가 글 상세 URL에 들어오면 30분 단위 익명 조회 기록을 1개 만들고, 로그인한 관리자의 조회는 집계하지 않는다. 조회수는 공개 방문자에게 숨기고, owner mode의 글방 목록/글 상세 및 `admin/posts.html`에서만 보여준다. 기존 `visitor_sessions`에는 글 URL 정보가 없어 과거 전체 방문자 수를 글별 조회수로 정확히 배분할 수 없으며, 별도 서버 로그 import가 없으면 `post_views` 적용 이후 값부터 기준으로 삼는다.
- 공개 메뉴에는 관리자 링크를 두지 않는다. 상단 marquee의 `coldwaterkim` 텍스트가 숨은 로그인 진입점이다.
- 로그인한 관리자는 공개 사이트를 그대로 보면서 홈 문구 편집, 프로필 사진 클릭 업로드, 홈 BGM MP3 추가, Home의 통합 글쓰기 허브, 글방의 새 글/수정/삭제, 나으 하루의 새 하루/수정/삭제, 글 상세의 수정/삭제, 프로그램실의 새 프로그램/수정/삭제, 나사잡의 이미지 업로드/수정/삭제, 방명록 삭제 같은 `OWNER MODE` 권한을 추가로 본다. 통합 글쓰기 허브는 글방/나으 하루/프로그램실 새 레코드 생성을 빠르게 시작하는 추가 진입점이며 기존 각 페이지 작성/수정 플로우를 대체하지 않는다. 프로그램실 새 레코드는 공개 자료실 항목으로 저장된다.
- 프로필 사진과 홈 BGM은 별도 컬렉션을 만들지 않고 기존 `media` 컬렉션과 `site_settings`를 쓴다. 프로필 사진은 `site_settings.profile_photo_url`에 저장한다. BGM은 `site_settings.bgm_playlist`를 최신 업로드순 플레이리스트로 쓰고, 기존 `site_settings.bgm_audio_url`, `site_settings.bgm_audio_title`은 최신곡 호환용으로 같이 갱신한다. 제목은 미니 플레이어 위에서 marquee처럼 흐르고, 오디오는 최신곡부터 차례로 재생한 뒤 마지막 곡 다음에 다시 최신곡으로 돌아간다. 자동재생이 막히면 `BGM ON` 버튼과 첫 사용자 입력 뒤 다시 시도한다.
- `/admin/`은 별도 대시보드가 아니라 예전 북마크용 안내판이고, 실제 운영 시작점은 공개 Home이다. 글 편집기/미디어/방명록 관리 화면은 owner action에서 필요할 때만 열린다.
- 글 편집기의 WYSIWYG Markdown 본문 이미지는 URL 입력이 아니라 이미지 버튼, 드래그 앤 드롭, 붙여넣기로 업로드할 수 있다. `/video` 같은 BlockNote 파일 블록은 공용 `uploadFile` 훅을 통해 `media` 컬렉션에 저장되며, MP4/WebM뿐 아니라 iPhone/Photos 계열 MOV/M4V도 받는다. 유튜브 링크를 붙여넣거나 비디오 블록 URL로 넣으면 공개 화면에서 iframe 임베드로 변환된다.
- 공개 글/나으 하루/프로그램 상세 본문은 저장된 HTML을 렌더링한 뒤 `js/media-embeds.js`와 `css/styles.css`에서 Markdown 변환 요소와 미디어 요소를 보정한다. table은 border와 셀 padding을 가진 실제 표로 보이고, video/audio는 컨트롤을 가진 플레이어로, 유튜브 URL 기반 video 블록은 iframe 임베드로 보인다. code block, blockquote, list, hr도 같은 본문 렌더링 규칙을 따른다.
- 나으 하루 작성기의 WYSIWYG Markdown 본문 이미지/영상/유튜브 입력 경험도 글 편집기와 같다. 같은 날짜 `daily_entries`가 이미 있어도 새 작성은 기존 글에 합치지 않고 별도 레코드로 저장한다.
- Home의 통합 글쓰기 허브도 같은 WYSIWYG Markdown 본문 작성기와 미디어 업로드 흐름을 쓴다. 카테고리 선택 후 글방은 `posts`, 나으 하루는 `daily_entries`, 프로그램실은 `programs`에 저장하며, 프로그램실 선택 시에만 상태/플랫폼/한 줄 소개/표지/파일/대표 링크 필드가 열린다. 나사잡은 이 허브에 포함하지 않는다.
- 글방 대표 이미지는 쓰지 않는다. 본문 이미지는 저장된 본문 HTML 안에서만 보이고, 목록/상세가 별도 대표 이미지를 계산하지 않는다.
- 로컬 UI 수정 중 운영 글 데이터까지 같이 보고 싶을 때는 `npm run dev:live-cms`를 쓴다. 이때 로컬 Vite 서버의 `/api/*` 요청은 `https://api.coldwaterkim.com`으로 프록시된다.

## 남은 세팅

- 실제 글 1개 작성 후 공개 화면 확인
- API 서버 배포 시 `deploy/nginx-api-subdomain.conf`와 PocketBase systemd 서비스 확인
- Fly.io를 쓰는 경우 `fly.toml`, `deploy/fly/`, `scripts/deploy-pocketbase-fly.sh` 기준으로 배포
- 아이맥 홈서버 이주는 `deploy/imac/README.md` 기준으로 freeze -> rehearsal -> DNS cutover -> hardening 순서로 진행
- 아이맥 운영 빌드는 `npm run build:imac`과 `npm run qa:home-server`를 통과해야 진행
- 2026-07-01 기준 Stage 1 repo readiness, Stage 2 iMac local rehearsal, Stage 3 데이터/런타임 준비, Oracle 부트볼륨 백업, 공유기 TCP 80/443 포트포워딩, Cloudflare DNS cutover, post-cutover 백업/전원/재부팅 하드닝은 완료했다. 남은 단계는 24시간 안정 관찰, 실제 글 1개 작성 후 공개 화면 확인, 7일 후 GitHub Pages/Oracle 롤백 경로 정리 판단이다.

## 주의

PocketBase 서버가 꺼져 있으면 공개 사이트는 렌더링되지만 글/방명록 영역은 CMS 연결 실패 메시지를 보여준다.

`api.coldwaterkim.com`은 Cloudflare DNS 전용 A record로 Oracle VM에 연결되어 있으며, 현재는 롤백용으로 유지한다.

아이맥 단일 배포 전환 이후 공개 사이트는 `api.coldwaterkim.com`이 아니라 같은 origin의 `/api`를 사용한다. 컷오버 후 최소 7일 동안은 기존 GitHub Pages/Oracle API를 롤백 경로로 유지한다.

## 로컬 검증 기록

- PocketBase `v0.23.5` 로컬 실행 확인
- `posts`, `guestbook`, `site_settings`, `media` 컬렉션 생성 확인
- `programs` 컬렉션 마이그레이션 적용 확인, 기존 정적 v1의 OneCut/Doodle 돌멩/중생돌멩/브덤돌멩/이름 미정 5개 seed 레코드 확인
- 프로그램실 공개 API 목록 조회 5개 확인, 임시 프로그램 create/update/delete와 `cover_image`/`download_files`/상세 스토리 필드 저장 검증 완료
- `programs/view.html?slug=onecut` 상세페이지 렌더링 확인
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
- 운영 PocketBase에 `post_views` 컬렉션을 반영했다. 공개 create는 가능하지만 list/view는 로그인한 관리자에게만 실데이터가 보이며, 임시 smoke record 생성/관리자 조회/삭제까지 확인했다.
- 2026-06-30 아이맥 홈서버 Stage 1 커밋/푸쉬 완료. `archive/pre-imac-migration-20260630` 원격 백업 브랜치와 `pre-imac-migration-20260630` 로컬 태그를 유지한다.
- 2026-06-30 아이맥 홈서버 Stage 2 로컬 리허설 완료. Intel용 PocketBase `v0.23.5`, Caddy `v2.11.4` 공식 바이너리를 확인했고, `http://127.0.0.1:18081`에서 홈/글방/나으 하루/프로그램실/나사잡/방명록/About 및 `/api/health`, `/_/` 모두 200 응답을 확인했다.
- 2026-06-30 아이맥 로컬 Caddy 리허설 설정을 `deploy/imac/Caddyfile.local`로 고정했고, `npm run qa:service-smoke:local`로 실제 HTTP 스모크 테스트를 재현할 수 있게 했다.
- 2026-06-30 아이맥 launchd 운영 상태 QA를 `npm run qa:launchd`/`npm run qa:launchd:tooling`으로 추가해 Caddy, PocketBase, 자동 백업 job의 설치/상주 상태를 확인할 수 있게 했다.
- 2026-06-30 아이맥 로컬 `pb_data` 기준 `media.file`, `programs.download_files` maxSize가 `2147483648`임을 확인했고, PocketBase 종료 상태의 cold backup 생성/압축 목록 확인까지 완료했다.
- 2026-07-01 아이맥 운영 런타임 기준 Caddy LaunchDaemon, PocketBase LaunchAgent, PocketBase 자동 백업 LaunchAgent가 모두 로드된 상태에서 `npm run qa:migration-go` 상당의 전체 gate 8개를 통과했다.
- 2026-07-01 컷오버 전 롤백 스냅샷 `migration_backups/cutover/cutover-snapshot-20260701095837.json`을 생성했다. 이 스냅샷은 Git HEAD `9edd92eb4ee284c176223da490b3c3b12da277e8`, 기존 GitHub Pages A records, `api.coldwaterkim.com -> 134.185.98.185`, 공개 route probe 결과를 담는다.
- 2026-07-01 아이맥 운영 `pb_data` cold backup `/Users/kimchansu/Backups/coldwaterkim-pocketbase/pb_data_20260701_185843.tar.gz`를 생성했고, sha256 검증 및 archive 내 `pb_data/data.db` 포함을 확인했다.
- 2026-07-01 컷오버 스냅샷 스크립트가 `~/.config/coldwaterkim/home-server.env`의 `HOME_SERVER_PUBLIC_IP`를 함께 기록하도록 보강했고, 최신 롤백 스냅샷 `migration_backups/cutover/cutover-snapshot-20260701101757.json`에 iMac LAN IP `192.168.0.11`, 집 공인 IP `121.160.181.179`, 기존 GitHub Pages/Oracle DNS 값을 남겼다.
- 2026-07-01 Oracle Cloud Console에서 기존 VM `coldwaterkim-pocketbase-api`의 부트볼륨 `coldwaterkim-pocketbase-api (Boot Volume)` FULL 백업 `coldwaterkim-pre-imac-boot-20260701115233`을 생성했고, 상태가 `Available`임을 확인했다. Backup OCID는 `ocid1.bootvolumebackup.oc1.ap-chuncheon-1.ab4w4ljr3a6rh5ncwcw4xtlpuauvwmgaabxjmxgsftgb3bgj4bvd7wfs6jtq`다.
- 2026-07-01 ipTIME 공유기에서 TCP `80 -> 192.168.0.11:80`, TCP `443 -> 192.168.0.11:443` 포트포워딩을 추가했다. `http://121.160.181.179/api/health`를 `Host: coldwaterkim.com` 헤더로 호출했을 때 Caddy `308` 응답이 확인됐고, `npm run qa:network-preflight` 및 `npm run qa:migration-go` 전체 gate 8개가 통과했다. DNS 변경 직전 롤백 스냅샷은 `migration_backups/cutover/cutover-snapshot-20260701122907.json`이다.
- 2026-07-01 Cloudflare DNS에서 `coldwaterkim.com`을 `A 121.160.181.179` DNS 전용으로 전환했고, `www.coldwaterkim.com`은 루트 CNAME으로 아이맥을 따라가게 유지했다. Caddy가 Let’s Encrypt 인증서를 정상 발급했으며 `https://coldwaterkim.com/api/health`, 홈, 글방, 나으 하루, 프로그램실, 나사잡, 방명록, About이 모두 200 응답을 반환했다. 컷오버 QA는 `verify-imac-cutover --profile production --network --expected-ip 121.160.181.179` 54개 체크와 `verify-imac-service-smoke --origin https://coldwaterkim.com` 24개 체크가 통과했고, 컷오버 후 스냅샷은 `migration_backups/cutover/cutover-snapshot-20260701124504.json`이다.
- 2026-07-01 post-cutover 하드닝에서 `com.coldwaterkim.pocketbase-backup` launchd job 등록, 매일 03:30 실행 설정, 30일 보관 기본값, checksum/tar 검증 흐름을 확인했다. 수동 kickstart로 `/Users/kimchansu/Backups/coldwaterkim-pocketbase/pb_data_20260701_215002.tar.gz`와 `.sha256`을 생성했고 `shasum -a 256 -c` 및 `tar -tzf`가 통과했으며, 백업 후 `https://coldwaterkim.com/api/health`가 다시 200 응답했다. `verify-imac-hardening` 24개 체크와 `verify-imac-launchd` 82개 체크도 통과했다.
- 2026-07-01 아이맥 전원/재부팅 하드닝을 완료했다. `pmset`은 sleep/disksleep/standby/autopoweroff를 끄고, 전원 복구 시 자동 재시작(`autorestart`)과 네트워크 유지(`womp`, `tcpkeepalive`)를 켜는 서버형 설정으로 고정했다. PocketBase와 백업 job을 사용자 LaunchAgent에서 시스템 LaunchDaemon으로 옮겨 로그인 전에도 자동 시작되게 했고, 예전 사용자 PocketBase LaunchAgent는 내려간 상태임을 확인했다. `verify-imac-power` 15개 체크, `verify-imac-launchd` 85개 체크, `verify-imac-service-smoke --origin https://coldwaterkim.com` 24개 체크가 통과했다. 수동 백업 kickstart로 `/Users/kimchansu/Backups/coldwaterkim-pocketbase/pb_data_20260701_225527.tar.gz`와 `.sha256`이 생성/검증됐고, 이후 PocketBase와 `https://coldwaterkim.com/api/health`가 정상 복구됐다.
- 2026-07-02 컷오버 후 아이맥 운영 `pb_data`가 Oracle 운영 데이터 전체가 아니라 로컬 리허설/마이그레이션 기반 빈 DB에 가까운 상태였음을 확인했다. 증상은 아이맥 API에서 `posts`, `guestbook`, `media`, `site_settings` 컬렉션이 없고 `daily_entries`가 0개였던 것이며, Oracle `api.coldwaterkim.com`에는 `posts` 12개, `daily_entries` 28개, `media` 189개 등 원본 데이터가 살아 있었다. Oracle 관리자 백업 ZIP과 Instance Agent Run Command 경로가 막혀서 긴급 복구는 `scripts/pocketbase-public-export.mjs`로 확보한 공개 API 사본 `migration_backups/public-api/coldwaterkim-public-20260701144051`을 사용했다. 리허설 DB에서 스키마 import, 레코드 복원, 파일명 원복, 관리자 `users` 계정 재생성을 검증한 뒤 운영 아이맥 DB에 반영했다. 복구 후 `https://coldwaterkim.com/api` 기준 `posts` 12개, `daily_entries` 28개, `guestbook` 5개, `media` 189개, `site_settings` 18개, `programs` 1개, `nasajab` 11개, `visitor_sessions` 315개가 확인됐고, `verify-pocketbase-data --schema pb_schema.json` 및 `verify-imac-service-smoke --origin https://coldwaterkim.com --timeout-ms 10000`이 통과했다. 이 복구는 공개 API로 읽을 수 있는 데이터와 파일 중심의 복구이므로, Oracle VM은 최소 보존 기간 동안 절대 정리하지 말고 추후 전체 `pb_data` 백업 ZIP 또는 SSH 기반 cold copy를 별도로 확보해야 한다.
- 2026-07-02 Oracle VM 전체 `pb_data` cold copy를 Bastion SSH로 확보했다. Run Command는 execution이 `ACCEPTED`에 머물러 사용하지 않았고, Oracle PocketBase를 잠시 정지한 뒤 `/home/pocketbase/pb_data`를 압축해 `migration_backups/oracle-cold-copy/20260701214314/coldwaterkim-oracle-pb_data-20260701214314.tar.gz`로 내려받았다. SHA256은 `349021badc5d78da02d4fc62ad727d555f9fb2f23ef3362eb42fc3d24d637cdf`이며 로컬 검증을 통과했다. cold copy에서 공개 API 복구에 빠졌던 초안 글 5개와 `post_views` 21개를 확인해 아이맥 운영 DB에 병합했다. 단, Oracle 스키마에는 과거 200MB 업로드 제한과 더 이상 쓰지 않는 글방 대표 이미지 필드가 남아 있어, 아이맥의 현재 2GB 업로드 제한과 대표 이미지 제거 스키마를 유지했다. 병합 후 `posts` 17개, `daily_entries` 28개, `guestbook` 5개, `media` 189개, `programs` 1개, `nasajab` 11개, `post_views` 21개, storage 파일 404개가 검증됐고, `verify-pocketbase-data --schema pb_schema.json`, `verify-imac-service-smoke --origin https://coldwaterkim.com --timeout-ms 10000`, 관리자 인증 draft 조회가 통과했다. 최종 아이맥 운영 백업은 `/Users/kimchansu/Backups/coldwaterkim-pocketbase/pb_data_20260702_065126.tar.gz`로 생성/검증했다.
- 2026-07-02 아이맥 이전 후 관리자 업로드 실패가 `Failed to create record`처럼 원인을 숨기는 문제를 줄였다. 로그인 페이지는 기존 토큰이 있어도 먼저 `authRefresh`로 유효성을 확인하고, 만료된 토큰이면 로컬 로그인 상태를 비운 뒤 다시 로그인 메시지를 보여준다. 공용 미디어 업로드는 인증 만료로 보이는 생성 실패에서 토큰을 지우고 `관리자 로그인 상태가 만료됐어. 다시 로그인한 뒤 같은 파일을 올려줘.`를 보여주며, 지원하지 않는 파일 형식은 별도 안내를 보여준다. `admin/media.html`은 운영 스키마에 맞게 최대 업로드 표기를 2GB로 고치고, 여러 파일 중 일부만 실패했을 때 성공/실패 개수를 분리해서 보여준다. 런타임 배포 전 기존 dist는 `migration_backups/runtime-dist/runtime-dist-pre-upload-auth-ux-20260702103508`에 보관했고, `verify-home-server-build`와 `verify-imac-service-smoke --origin https://coldwaterkim.com --timeout-ms 10000`이 통과했다.
