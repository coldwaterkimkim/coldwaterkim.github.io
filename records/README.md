# 기록 V2 로컬 검토

사용자 승인: 새 피드를 운영 기본 화면으로 배포하고 기존 홈페이지를 페이지뷰로 보존한다. 로컬 검토 실행법은 아래와 같다. 운영 결과는 [DEPLOYMENT.md](DEPLOYMENT.md).

- 화면: http://127.0.0.1:5196/records/
- 작업 폴더: `/Users/kimchansu/Code/coldwaterkim-records-v2`
- 별도 런타임: `~/.local/share/coldwaterkim/records-v2-preview`
- PocketBase: `127.0.0.1:18096` (운영 DB/스토리지와 분리)

## 실행

현재 로컬 런타임에는 운영 SQLite 온라인 백업의 복사본, 로컬 전용 로그인, 공개 기록 이관본이 준비돼 있다. 운영 스토리지를 연결하지 않았으며 새 첨부는 이 런타임에만 저장된다. 재실행은 두 터미널을 사용한다.

```sh
python3 scripts/start-records-preview.py
```

```sh
npm run dev:records
```

첫 명령은 기존 검토 DB가 있어야 작동한다. 운영 데이터 복사나 원격 서비스 설정은 수행하지 않는다. 검토용 로그인은 로컬 런타임에만 보관하고 Vite의 loopback 전용 endpoint로 전달한다. 이 Vite 설정과 런타임을 외부에 노출하지 않는다.

## 검토 흐름

홈 → 햄버거의 글방/나으 하루 → 새 기록 → 사진 편집 → 임시 저장 → 메뉴의 임시 저장한 기록 → 이어서 쓰기 → 게시 → 사진 스와이프.

`[로컬 검토용]` 기록은 기능 확인용이며 원래 사이트 글이 아니다. 이 화면에서 게시해도 운영에는 반영되지 않는다. 기존 콘텐츠의 이미지·영상 원본은 공개 사이트 URL에서 읽을 수 있다.

## 구현 범위와 남은 작업

- 구조화된 일반 텍스트, 첨부별 occurrence ID·크롭·코멘트, ChatGPT snapshot, YouTube, 오디오·파일.
- 카테고리는 유지하고 홈에서는 최신순으로 혼합. 수정 시 최초 발행 시각 유지, 동시 수정 충돌 방지.
- 복잡한 기존 HTML은 원문을 보존한다. 새 편집기에서 기존 원문의 내부 문단을 직접 고치는 작업은 아직 지원하지 않는다.
- 기존 uploadMedia/Uppy/tus 전송 경로를 재사용한다. 크롭·정렬·코멘트 변경은 원본 재업로드를 하지 않는다.
- 운영은 기존 글 실시간 읽기 + 새 저장의 기존 collection 동시 반영으로 앨범 태그·조회수·SEO·기존 URL을 유지한다. 앨범 메뉴는 기존 `/album/`로 이동한다. 모든 독립 페이지의 새 디자인 적용은 별도 범위다.
- 로컬 Chrome에서 기존/V2 작성기의 실제 파일 선택 업로드 속도·원본 무결성을 비교했다. 결과와 경계는 [UPLOAD-BENCHMARK.md](UPLOAD-BENCHMARK.md)를 참고한다. 영상 변환 worker는 실행하지 않으며 새 영상 파생본 생성·운영 인터넷 속도는 미검증이다.
- 제거한 첨부와 기록의 원본 미디어는 자동 삭제하지 않는다. 기존 미디어 관리의 참조 검사와 새 기록 참조 보호를 유지한다.

## 승인 시안 적용

PC·태블릿의 기존 shell 안에서 피드/상세 읽기 폭을 제한하고, 모바일은 전체 프로필 + 최근 기록 바로가기 + 상단 햄버거로 구성한다. 하단 바는 없다. 원문 미리보기는 고정 높이로 자르지 않으며 `더 보기` 하나로 확장한다. 작성기는 빈 내용의 게시를 막고, 사진 첨부 후 크롭/코멘트 안내와 접힌 날짜 옵션을 제공한다. 업로드 서비스·원본 저장 구조는 그대로다.

## 검사

```sh
npm run qa:records
npm run qa:writing
npm run qa:uppy-tus-client
npm run build:records
cd deploy/imac/pocketbase-custom
go test ./...
```

`qa:records:ui`는 `CWK_DOM_PARSER_MODULE`을 설치된 linkedom ESM 경로로 지정해 실행한다. 실제 앱 이벤트를 실행하되 서비스 I/O를 주입하고 모든 네트워크 요청을 금지한다. 빈 게시 상태, 업로드/저장 실패 복구, 원문·크롭·ChatGPT 보존, 스와이프 코멘트 동기화를 확인하며 브라우저 레이아웃 검증을 대체하지 않는다.

`build:records`는 로컬 검토 전용이다. 운영은 `build:imac`으로 `/`, `/page-view.html`, `/records/`를 함께 빌드한다. 운영 빌드에는 로컬 인증과 import-preview 화면을 넣지 않는다.
