# STATUS

## 현재 제품 결정

레트로 감성 개인 홈페이지를 유지하면서 CMS는 PocketBase로 간다.

배포는 우선 하이브리드로 간다. `coldwaterkim.com` 프론트엔드는 GitHub Pages에 두고, PocketBase는 `api.coldwaterkim.com` API 서버로 붙인다.

공개 사이트의 디자인 기준은 `design.md`에 고정한다. 새 공개 페이지나 UI 수정은 현재 홈의 90s 개인 홈페이지 감성을 먼저 보존하고, 의도적으로 방향을 바꿀 때만 `design.md`와 `STATUS.md`를 함께 갱신한다.

이 결정의 이유:

- 글을 자주 쓰려면 HTML 파일 복사보다 관리자 화면이 편하다.
- 방명록과 미디어 업로드는 정적 사이트만으로는 운영이 어렵다.
- repo에 이미 PocketBase 관리자, 스키마, 배포 파일이 있어서 그 방향을 완성하는 게 빠르다.
- 지금 홈의 수제 레트로 감성이 제품 정체성이므로, 이후 기능 추가 때 현대적인 랜딩페이지나 카드형 UI로 흐르지 않게 기준 문서가 필요하다.
- GitHub Pages는 코드 수정을 빠르게 도메인에 반영하기 좋지만 서버 프로세스를 못 띄우므로, CMS는 별도 PocketBase 서버가 필요하다.

## 현재 동작

- 공개 홈은 PocketBase에서 최근 발행 글을 가져온다.
- 글 목록은 PocketBase `posts` 컬렉션의 `published` 글만 보여준다.
- 글 상세는 `slug`로 PocketBase 글을 조회한다.
- 방명록은 PocketBase `guestbook` 컬렉션을 읽고 쓴다.
- `/admin/`은 PocketBase `users` auth collection 계정으로 로그인한다.

## 남은 세팅

- 운영 VPS 또는 PocketBase 호스팅 대상 선택
- `api.coldwaterkim.com` DNS 연결
- 운영 PocketBase 바이너리 설치
- 운영 PocketBase 서버 실행
- 운영 PocketBase에 `pb_schema.json` 기준 컬렉션 생성
- 운영 `users` auth collection 관리자 계정 생성
- 실제 글 1개 작성 후 공개 화면 확인
- API 서버 배포 시 `deploy/nginx-api-subdomain.conf`와 PocketBase systemd 서비스 확인

## 주의

PocketBase 서버가 꺼져 있거나 `api.coldwaterkim.com` DNS가 아직 연결되지 않았으면 공개 사이트는 렌더링되지만 글/방명록 영역은 CMS 연결 실패 메시지를 보여준다.

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
