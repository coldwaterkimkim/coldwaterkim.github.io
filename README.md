# coldwaterkim.com

레트로 감성 개인 홈페이지 + PocketBase CMS.

목표는 단순하다. 방문자는 90s 느낌의 개인 홈페이지를 보고, 나는 같은 화면을 둘러보다가 로그인 상태에서만 열리는 `OWNER MODE` 버튼으로 글과 미디어와 방명록을 관리한다.

## 현재 방향

- 공개 사이트: `index.html`, `posts/index.html`, `posts/view.html`, `guestbook.html`, `about.html`
- 관리: 공개 페이지 위의 `OWNER MODE` + 필요할 때 열리는 `admin/*.html` 편집 화면
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
- `posts`: 글. 본문 이미지 기반 대표 이미지를 위해 `featured_image_mode`, `featured_image_url` 필드를 쓴다.
- `programs`: 프로그램실. 만든 프로그램의 표지, 상태, 이야기, 다운로드 파일, 외부 링크를 저장한다.
- `guestbook`: 방명록
- `site_settings`: 홈 문구 같은 간단 설정
- `visitor_sessions`: `TOTAL / TODAY` 방문자 카운터를 위한 30분 세션 기록
- `media`: 이미지/영상/오디오/PDF 업로드

기본 스키마 초안은 `pb_schema.json`에 있다. PocketBase Admin UI에서 스키마를 가져오고, 기본 `users` auth collection에 실제 관리자 ID/비밀번호 계정을 만든다. 이 사이트는 공개 회원가입이 필요 없으니 `users`의 create rule은 닫아두는 편이 맞다.

방문자 카운터는 새로고침마다 숫자를 올리는 페이지뷰가 아니라, 같은 브라우저의 30분 내 활동을 1회 방문으로 묶는다. `TODAY`는 KST 날짜 기준이고, `TOTAL`은 운영 누적 방문 세션 23개를 표시 기준값 231로 환산한 뒤 이후 새 세션마다 1씩 더해 보여준다. 로그인한 관리자는 공개 화면에서 `TODAY` 옆의 위/아래 버튼으로 오늘 표시 최소값을 조절할 수 있고, 이 보정값은 `site_settings`의 `visitor_today_min_YYYY-MM-DD` 키에 저장된다.

방명록은 닉네임을 비워두면 `익명의 누군가N` 형식으로 저장하고, 직접 입력하면 그 닉네임을 쓴다. `guestbook.display_date`는 초기 방명록처럼 보이는 날짜를 따로 보여줄 때만 쓰는 선택 필드이며, 일반 방문자가 작성한 글은 실제 `created` 날짜로 표시된다.

## 글 쓰기 흐름

1. 홈 상단 marquee의 `coldwaterkim` 텍스트 클릭
2. 로그인 후 공개 Home으로 복귀
3. 글방이나 글 상세의 `OWNER MODE`에서 새 글/수정/삭제
4. 본문 중간 이미지는 Quill 에디터의 이미지 버튼, 드래그 앤 드롭, 붙여넣기로 넣는다. 이미지는 `media` 컬렉션에 저장되고 본문에는 공개 파일 URL이 자동 삽입된다.
5. 대표 이미지는 별도 업로드하지 않는다. 기본은 첫 번째 본문 이미지이고, 이미지가 여러 개면 대표 이미지 패널에서 특정 이미지를 고르거나 `없음`으로 둘 수 있다.
6. 상태를 `발행됨`으로 저장
7. 홈 최근 글, 글 목록, 글 상세에 자동 반영

## 프로그램 올리기 흐름

1. 홈 상단 marquee의 `coldwaterkim` 텍스트 클릭
2. 로그인 후 `프로그램실`로 이동
3. `OWNER MODE`의 `새 프로그램` 버튼 클릭
4. 이름, 상태, 플랫폼, 왜 만들었는지, 해결하는 빡침을 입력
5. 앱 대표 이미지가 있으면 `표지`에 첨부한다. 없으면 프로그램명/상태 기반 레트로 표지가 자동으로 보인다.
6. 상세페이지용 긴 이야기, 해결 방식, 제작 노트, 스크린샷을 선택적으로 채운다.
7. `.dmg`, `.zip` 같은 배포 파일은 `파일`에 첨부하고, TestFlight/GitHub/Web Demo는 대표 링크나 추가 링크에 적는다.
8. `공개` 체크가 켜진 레코드만 방문자에게 보인다. `UNRELEASED` 상태도 공개하면 예고편처럼 노출된다.

프로그램실 첫 화면은 preview table이다. 각 row의 표지/이름/`상세 이야기 보기`를 클릭하면 `programs/view.html?slug=...` 상세페이지로 들어가고, 거기서 더 긴 스토리텔링, 스크린샷 갤러리, 다운로드/링크를 본다.

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
- `js/programs.js`: 프로그램실 공개 목록, 다운로드 인덱스, owner 작성/수정/삭제 UI
- `js/program-detail.js`: 개별 프로그램 상세페이지 렌더링
- `vite.config.js`: `npm run dev:live-cms`에서 로컬 `/api/*`를 운영 PocketBase로 프록시
- `js/site.js`: 공개 사이트 공통 동작, 최근 글, 방명록
- `programs/index.html`: CMS-backed 프로그램실 페이지
- `programs/view.html`: 개별 프로그램 상세페이지
- `admin/*.html`: 로그인/글 편집/미디어 등 owner action이 여는 편집 화면
- `design.md`: 공개 사이트의 90s 개인 홈페이지 감성을 유지하기 위한 디자인 기준
- `pb_schema.json`: PocketBase 컬렉션 설계 초안
- `pb_migrations/`: PocketBase 운영 스키마 마이그레이션
- `deploy/`: VPS 배포용 Nginx, systemd, 백업 스크립트
