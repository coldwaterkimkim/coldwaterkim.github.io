# 레트로 홈페이지 동결 보관소 · 2026-09-16

Sketchbook + Crayon 방향 채택 전의 문서와 공개 사이트 기념 기록을 보관한다. 현재 제품·디자인 기준은 루트의 [WEBSITE_DIRECTION.md](../../WEBSITE_DIRECTION.md)다.

## 문서

`documents/`의 파일은 변경 전 원본 바이트 그대로 보관했다. 원래 저장소 상대 경로를 유지했다.

- [design.md](documents/design.md): 이전 철학, 레트로 시각 규칙, 통합 피드와 토큰 결정.
- [design-qa.md](documents/design-qa.md): 이전 구현·시안 검증 기록.
- [README.md](documents/README.md), [AGENTS.md](documents/AGENTS.md): 당시 프로젝트 설명과 작업 지침.
- [About V1 명세](documents/docs/ABOUT_WIKI_ANALYSIS_AND_V1_SPEC.md), [Records README](documents/records/README.md): 기존 화면과 구현의 관련 기록.

문서는 더 이상 갱신하지 않는다. 내부 상대 링크와 절대 경로는 당시 기록 그대로이며 보관소에서 일부 링크가 작동하지 않을 수 있다. 운영·데이터 안전성을 폐기한 것이 아니며 기술 동작은 현행 문서와 구현에서 계속 관리한다.

원본 무결성: [DOCUMENTS_SHA256SUMS](DOCUMENTS_SHA256SUMS). 이 디렉터리에서 `shasum -a 256 -c DOCUMENTS_SHA256SUMS`로 확인할 수 있다.

## 기념사진

[실제 공개 화면 8장과 점검 전환 사진 1장 보기](screenshots/README.md) · [촬영 메타데이터](screenshots/manifest.json)

동결 당시 코드/공개 빌드: `a144506a508c`. [당시 STATUS](documents/STATUS.md)도 원문으로 보관했다. 이후 구현 상태는 루트 STATUS를 따른다.

같은 시점의 공개 화면 캡처와 촬영 정보는 이 보관소 안에 별도로 보존한다. 화면 기록은 콘텐츠·DB·원본 미디어의 복구용 백업을 대신하지 않는다.

## 동결 이유

미래의 나를 위한 life archive라는 목적과 self-directed discovery를 새 최상위 기준으로 확정했다. 비주얼은 Sketchbook + Crayon으로 전환하고, 홈페이지는 통합 피드가 아닌 탐색 방향을 고르는 곳으로 정의했다. 이전 레트로 방향의 존재를 지우지 않되 앞으로의 디자인을 제한하지 않도록 분리한다.
