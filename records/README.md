# 기록 V2 로컬 검토

브랜치: `codex/records-v2-preview` · 운영 배포 및 병합 전 사용자 검토용.

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

홈 → 글방/메뉴의 나으 하루 → 새 기록 → 사진 편집 → 임시 저장 → 메뉴의 임시 저장한 기록 → 이어서 쓰기 → 게시 → 사진 스와이프.

`[로컬 검토용]` 기록은 기능 확인용이며 원래 사이트 글이 아니다. 이 화면에서 게시해도 운영에는 반영되지 않는다. 기존 콘텐츠의 이미지·영상 원본은 공개 사이트 URL에서 읽을 수 있다.

## 구현 범위와 남은 작업

- 구조화된 일반 텍스트, 첨부별 occurrence ID·크롭·코멘트, ChatGPT snapshot, YouTube, 오디오·파일.
- 카테고리는 유지하고 홈에서는 최신순으로 혼합. 수정 시 최초 발행 시각 유지, 동시 수정 충돌 방지.
- 복잡한 기존 HTML은 원문을 보존한다. 새 편집기에서 기존 원문의 내부 문단을 직접 고치는 작업은 아직 지원하지 않는다.
- 기존 uploadMedia/Uppy/tus 전송 경로를 재사용한다. 크롭·정렬·코멘트 변경은 원본 재업로드를 하지 않는다.
- 새 글에 대한 기존 앨범 태그, 조회수, SEO/기존 URL 통합, 모든 기존 독립 페이지의 새 디자인 적용과 운영 이관은 후속 범위다. 검토본의 앨범은 V2 구조화 첨부 중심이다.
- 로컬 영상 변환 worker는 실행하지 않는다. 새 영상의 파생본 생성과 운영 속도 비교는 미검증이다.
- 제거한 미디어를 자동 삭제하지 않는다. 배포 전에 임시 첨부 수명 정책을 확정해야 한다.

## 검사

```sh
npm run qa:records
npm run qa:writing
npm run qa:uppy-tus-client
npm run build:records
cd deploy/imac/pocketbase-custom
go test ./...
```

`build:records` 산출물은 검토 전용이며 운영 배포 대상으로 사용하지 않는다. 기본 운영 홈페이지와 작성기는 그대로 유지한다.
