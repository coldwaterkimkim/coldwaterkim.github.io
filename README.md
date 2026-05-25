# coldwaterkim.com

레트로 감성 개인 홈페이지 + PocketBase CMS.

목표는 단순하다. 방문자는 90s 느낌의 개인 홈페이지를 보고, 나는 `/admin/`에서 글과 미디어와 방명록을 편하게 관리한다.

## 현재 방향

- 공개 사이트: `index.html`, `posts/index.html`, `posts/view.html`, `guestbook.html`, `about.html`
- 관리자: `admin/`
- CMS/DB: PocketBase
- 빌드 도구: Vite
- 배포 기준: GitHub Pages 프론트 + PocketBase API 서버

GitHub Pages는 정적 파일만 서빙하므로 PocketBase 서버를 직접 같이 띄울 수는 없다. 그래서 지금 기준은 `coldwaterkim.com`은 GitHub Pages가 맡고, CMS/API는 `api.coldwaterkim.com`의 PocketBase 서버가 맡는 구조다.

이렇게 하면 코드/UI 수정은 `main` 브랜치에 push되는 순간 GitHub Actions가 빌드해서 `coldwaterkim.com`에 반영하고, 글/방명록/미디어 수정은 `/admin/`에서 저장하는 즉시 PocketBase를 통해 공개 사이트에 반영된다.

## 로컬 실행

사이트만 확인:

```bash
npm run dev
```

CMS까지 확인:

```bash
./pocketbase serve --http=127.0.0.1:8090
npm run dev
```

PocketBase 바이너리는 repo에 넣지 않는다. 로컬 검증은 `v0.23.5`로 완료했다. macOS에서는 PocketBase 릴리즈에서 `darwin_arm64` 바이너리를 받아 `.local-bin/pocketbase` 또는 프로젝트 루트의 `pocketbase`로 둔다.

## PocketBase 세팅

필요한 컬렉션:

- `users`: 관리자 로그인을 위한 auth collection
- `posts`: 글
- `guestbook`: 방명록
- `site_settings`: 홈 문구 같은 간단 설정
- `media`: 이미지/영상/오디오/PDF 업로드

기본 스키마 초안은 `pb_schema.json`에 있다. PocketBase Admin UI에서 스키마를 가져오고, 기본 `users` auth collection에 실제 관리자 계정을 만든다. 이 사이트는 공개 회원가입이 필요 없으니 `users`의 create rule은 닫아두는 편이 맞다.

## 글 쓰기 흐름

1. `/admin/` 접속
2. 로그인
3. `글 관리`에서 새 글 작성
4. 상태를 `발행됨`으로 저장
5. 홈 최근 글, 글 목록, 글 상세에 자동 반영

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

## 중요한 구조

- `js/pb.js`: PocketBase 연결, 인증, 글/방명록/미디어 API 헬퍼
- `js/site.js`: 공개 사이트 공통 동작, 최근 글, 방명록
- `admin/*.html`: CMS 관리자 화면
- `design.md`: 공개 사이트의 90s 개인 홈페이지 감성을 유지하기 위한 디자인 기준
- `pb_schema.json`: PocketBase 컬렉션 설계 초안
- `deploy/`: VPS 배포용 Nginx, systemd, 백업 스크립트
