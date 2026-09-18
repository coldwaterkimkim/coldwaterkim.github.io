# 콘텐츠형 편집기 디자인 QA · 2026-09-18

final result: passed

범위: 선택한 모바일 A/데스크톱 B의 로컬 OWNER 편집기 UI. 아래의 과거 공개 사이트 검증 기록은 보존한다. 이 결과는 운영 저장/배포 승인이 아니다.

## Source visual truth

Base: `/Users/kimchansu/.codex/generated_images/01a0a404-2c2f-7391-93b4-0468b2dbf2ec/`
- 선택: `exec-313b5ba5-bdb0-4175-8ec9-5cddef723f66.png`
- 작성: `exec-bfeae4df-c54a-4519-a3f0-9db7e394f856.png`
- 글만: `exec-7dc1a1b9-50bb-4ecd-91f9-e9b2c4bca87d.png`
- 각 보드 1536×1024. 모바일 A 왼쪽/데스크톱 B 오른쪽 앱 영역만 비교. 보드 제목·설명·폰 외곽은 구현 대상 제외.

## Implementation evidence

Base: `/Users/kimchansu/Code/coldwaterkim.github.io/output/content-editor-qa/`
- Desktop CSS 1160×900 / DPR2: `desktop-select-fixed.png`, `desktop-write-fixed.png`, `desktop-text.png` (각 full-page 2320×1966).
- Mobile CSS 390×844 / DPR2: `mobile-select.png` 780×2008, `mobile-write-fixed.png` 780×2076, `mobile-text.png` 780×1940.
- Tablet CSS 820×1000 DOM overflow 검사: 가로 넘침 없음.
- `compare-` 접두사의 동일 이름 이미지 6개에 source crop과 implementation을 실제로 나란히 합성해 열어 비교했다. 데스크톱은 너비970, 모바일390으로 각각 정규화. 구현의 개발 전용 상단 테스트 도구는 잘라냈으며 정상 세로 스크롤의 앱 본문은 보존했다.
- Source generic photo/video placeholders는 실제 사용자 사진과 라이브러리 미디어 유형 아이콘으로 대체했다. 순서3개/전체 글/첫 사진 설명/글만 본문을 맞췄다. 날짜는 현재 날짜로 변경. 콘텐츠에 의한 차이는 fidelity 오류가 아니다.
- Full-view 비교에서 3열/세로형, 선택과 작성 상태, 주/보조 버튼, 목록·미리보기·설명 영역 관계를 확인. 모바일 비교판을 원래390px 폭으로 확인해 레이블/입력/개별 설명/설정/아이콘을 읽었으므로 추가 확대 crop 불필요.

## Findings and comparison history

1. [P1, fixed] 기존 사이트의 button 규칙이 OWNER 버튼을 덮어 파란 게시 버튼과 둥근 컨트롤이 사라짐. 초기 `desktop-write.png` 확인 → 공개 버튼 규칙에서 콘텐츠 편집 제외, 편집기 selector 격리 → `desktop-write-fixed.png` 재확인.
2. [P2, fixed] 모바일 설정이 항상 펼쳐져 시안보다 길고, 입력14px은 iOS 확대 위험. 모바일 details 접기, 입력16px, 사진 crop 버튼을 미리보기 위 보조 조작으로 배치 → mobile `*-fixed`/text 재확인.
3. [P2, fixed] 3열 최소 너비가 좁은 태블릿에서 넘칠 수 있음. 980px 이하 단일 열 전환. 820px 실제 DOM 가로 넘침 없음.
4. [P2, fixed] 저장 실패 시 status에 저장 중이 남음. 실패 시 busy 문구 제거; 실제 error 복구 흐름과 DOM 회귀 검사 확인.
5. [P3, accepted] 시안의 수기적 예시 아이콘·중복 카테고리 표시는 실제 Phosphor 아이콘/단일 설정으로 정리. 모바일 저장은 상단 sticky 한 줄, 닫기 추가. 재정렬은 드래그와 접근 가능한 화살표 병행. 앱 구조/작성 흐름은 유지하며 컨트롤 추가 때문에 모바일 선택은 약간 더 길다.

## Required fidelity surfaces

- Fonts: 시스템 sans, 본문/입력16px, 제목18–20px, 일반 자간. 공개 손글씨·크레파스와 분리. 긴 콘텐츠 이름 말줄임, 설명은 줄바꿈 입력.
- Spacing/layout: 선택2열, 작성3열, 글만 본문+설정. 모바일 세로 배열, 정방형 미리보기, sticky 저장, 설정 접기. 390/820/1160 가로 넘침 없음.
- Colors: 흰 바탕, 중성 회색 경계, 파란 주요 버튼/선택 상태. 키보드 focus-visible 표시.
- Assets: 실제 첨부 사진 contain/기존 crop, 영상 포스터 또는 Phosphor 미디어 아이콘, 링크 아이콘. 장식용 새 래스터 에셋이 없는 편집기이므로 별도 imagegen asset 불필요. 새 이미지나 로고를 CSS/SVG 그림으로 대체하지 않음.
- Copy: 제목 선택·본문 필수, 전체 글과 개별 콘텐츠 글 구분, 1선택/2작성, 저장·오류 피드백. source의 오래된 공유 도메인은 chatgpt.com으로 갱신.

## Primary interactions tested

- In-app browser 실제 파일 선택 → 로컬 blob 미리보기, 공유 링크 입력 → 대역 응답, 다음/뒤로, 썸네일 선택, 화살표 순서변경, 개별 설명 보존.
- 혼합 순서와 caption 수정 후 테스트 임시저장/재열기; 선택한 ChatGPT 항목에 수정 내용 보존.
- 글만 빈 본문 게시 비활성, 제목 없이 본문 작성 가능. 저장 실패 후 글 유지·재저장 성공.
- 기존 crop dialog 열기/1:1/적용, 310×310 미리보기 확인.
- 최종 console error/warn 없음. 초기에 Phosphor exports import 경로 오류는 /regular로 수정 후 새로고침하여 해소.
- 자동 DOM tests 두 개 및 빌드, backend 계약 tests 통과. 운영 DB 쓰기 없이 수행.

## Remaining boundaries / follow-up polish

- 실제 iPhone Safari, 터치 드래그 정렬, 운영 로그인/업로드/저장은 이번 시각 검증 범위 밖이다. 터치 사용자는 순서변경 화살표 사용 가능.
- 실제 서버 capability 없음(404), 새 필드를 버리는 저장을 차단. 백엔드 배포 후 authenticated 쓰기 검증 필요.
- 이미지와 동영상 원본은 삭제하지 않는다. 테스트 페이지는 브라우저 저장 대역으로 운영 기록을 쓰지 않는다.

## Implementation checklist

- [x] 선택한 시안의 세 상태와 반응형 구현
- [x] 기존 사이트 CSS 충돌 분리
- [x] 실제 상호작용과 오류 복구 검사
- [x] Source/implementation 합성 비교 및 수정 후 재비교
- [x] 로컬 Tailscale 미리보기 유지
- [ ] 운영 배포 및 실제 저장 검증 (이번 요청 범위 아님)

---

# 새 방향 디자인 검토 기준

기준: [WEBSITE_DIRECTION.md](WEBSITE_DIRECTION.md), 2026-09-17.

상태: **첫 Sketchbook + Crayon 공개 버전 `0cbd7d8` 배포 완료.** 아래 검증 기록과 향후 검토 기준을 구분한다. 과거 검증 결과는 [동결된 design-qa.md](heritage/2026-09-16-retro/documents/design-qa.md)에 보존했다.

## 첫 배포 검증 기록 · 2026-09-17

- 자동 검사: Records V2/UI, 글쓰기, 앨범, about me, 방명록 답글, 음악·동의 회귀 검사 통과. 빌드 산출물 70개 및 공개 서비스 33개 검사 통과.
- 로컬 실데이터 브라우저: 홈 390×844, 375×667, 1440×900, 844×390에서 가로·세로 넘침 없음. 음악 실제 재생·일시정지, 앨범/글 목록에서 상세 진입 확인.
- 앨범: 실제 목록 24개가 모두 이미지이며 목록 내 video 요소 0개. 기존 분류와 페이지 표시 확인.
- 공개 브라우저: 새 홈과 앨범 렌더링, 24개 썸네일 및 한글 헤더 확인. 공개 site-version과 배포 커밋 일치, 소스 dist/런타임 dist 차이 없음.
- 실제 about me와 방명록 내용 렌더링 확인. 이번 배포 검증에서는 운영 글·방명록의 생성/수정/삭제를 직접 수행하지 않았다. 저장 계약은 회귀 검사 범위이며 실제 쓰기 E2E 완료로 간주하지 않는다.
- 홈 프로필/요즘에는는 미반영. 모든 기기·보조기술·키보드 흐름을 완전 검증한 것은 아니며 후속 iteration에서 확인한다.

## 후속 검토 기준

### 정보 위계

- 홈에서 탐색 방향을 고를 수 있고 8개 목적지를 모두 발견할 수 있는가?
- 삶의 주요 네 영역과 전체 보기·앨범, about me·방명록의 역할을 구분할 수 있는가? 현재 승인 배치를 기준으로 확인한다.
- 음악 플레이어가 작동하는가? 미반영된 홈 프로필·정체성·요즘에는의 배치는 다음 iteration에서 결정한다.
- 사진·영상·글 형식이 주제 분류를 대신하지 않는가?

## 공간 구성

- 링크와 다음 행동을 즉시 이해할 수 있고 기본 탐색이 예측 가능한가?
- 데스크톱과 모바일에서 읽기·탐색·클릭 영역이 안정적으로 작동하는가?
- 여백이 유지되고 장기적인 기록 증가를 수용하는가?
- 중앙 구조 / 주변 존재감은 검토 가능한 가설이지 필수 통과 조건이 아니다.

## 물성 표현

- 종이와 크레파스의 질감·압력·불균일한 흔적이 사람의 손길을 느끼게 하는가?
- 모든 것을 종이 카드로 만드는 방식, 장식용 테이프·클립·포스트잇 남발을 피하는가?
- 시각적 불완전함이 가독성·접근성·정보 구조를 해치지 않는가?
- 옛 레트로 토큰과 시안 일치 여부를 새 디자인의 통과 조건으로 삼지 않는가?

## 사용자 흐름과 보존

- 키보드 탐색, 포커스, 터치 영역, 반응형 배치, 로딩·오류 상태를 실제 흐름으로 확인한다.
- 글·미디어·링크 미리보기와 기존 URL·데이터·원본 미디어를 보존하는지 변경 범위에 맞게 검증한다.
- 음악 재생·일시중지와 동의 선택을 보존한다.
- 기록마다 추가 연출을 강요하지 않는다. 랜덤 입구나 기록 미리보기는 필수 기능으로 판정하지 않는다.
- 브라우저 실측과 정적·자동 검사를 구분하고, 검증하지 못한 플랫폼이나 흐름은 명시한다.
