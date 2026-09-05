# 기록 V2 승인 시안 구현 검증 · 2026-09-05

final result: passed

범위: 승인한 5개 화면의 구현 및 Chrome 반응형/동작 검증. 운영 배포 준비 또는 모든 기존 V2 후속 기능 완료를 의미하지 않는다.

## 비교 대상과 증거

승인 이미지 폴더: `/Users/kimchansu/.codex/generated_images/01a06fa6-d69d-7bd3-b2b3-34475f8385a5/`.
구현 캡처 폴더: `/Users/kimchansu/.codex/visualizations/2026/09/05/records-implementation-qa/browser/`.
구현 URL: `http://127.0.0.1:5196/records/`, Chrome 152.

| 화면 | 승인 이미지 | 실제 캡처 | CSS viewport |
|---|---|---|---|
| PC 홈 | exec-646b5e45-da9e-468a-b239-dfd575e64688.png | pc-home-final.png | 1440×1000 |
| 모바일 홈 | exec-1b428cdd-386f-46a1-bf56-525646d401b7.png | mobile-home-final.png | 390×844 |
| 모바일 피드 | exec-4660a07a-7e4f-411d-bb1d-11a4d8242e8b.png | mobile-feed-final.png | 390×844 |
| PC 상세 | exec-f6372efe-b460-4815-90fa-5a18f7d9cb72.png | pc-detail-final.png | 1440×1000 |
| 모바일 작성기 | exec-1d5facdc-83d2-4993-b4f8-425181d1accd.png | mobile-composer-final.png | 390×844 |

추가 증거: tablet-final.png(820×1180), mobile320-menu-final.png(320×844), mobile-crop-qa.png(390×844).

캡처는 scale=css로 저장해 실제 픽셀 크기가 CSS viewport와 같다. 승인 PC 이미지1503×1046/1047, 모바일853×1844, 작성기939×1676이다. 같은 폭을 기준으로 구조·상대 간격을 대조했으며 이미지 생성 특성상 작성기의 화면비 자체가 달라 픽셀 동일성 판정을 하지 않았다. 승인 원본과 구현 이미지를 같은 검토 입력에서 열어 비교했다. 별도 합성 이미지를 만들거나 이를 픽셀 diff 검증으로 주장하지 않는다.

## 시각 및 기능 판정

- 폰트: 기존 홈페이지 폰트와 기록 본문 Arial/한국어 fallback 유지. 본문16px, 작은 서명14px, 메타12px. 모바일 헤더의 줄바꿈/주요 버튼 유실 없음.
- 간격/레이아웃: PC shell1140px, 본문640px/좌우24px. 641px 이상 2열, 640px 이하 세로 구성. 320/390/640/641/820/1024/1440px 가로 넘침 없음. 전체 프로필을 유지하며 바로가기와 분류 이동은 고정 헤더 아래로 이동.
- 색상/토큰: 기존 노랑/크림/파란 링크/각진 테두리 유지. 움직이는 마키와 blink는 정지 캡처 시점에 따라 문구 위치/표시가 달라지는 정상 상태.
- 이미지: 생성 이미지의 변형된 사람/크롭을 사용하지 않고 실제 자산과 저장 crop를 유지했다. 사진 비율 차이를 강제로 동일 crop로 바꾸지 않는다. 현재 사진 높이를 따라가 빈칸 제거, 원본 링크 유지.
- 카피: 실제 저장 인사말과 프로필/기록 본문 유지. 로컬 검토 안내는 운영 반영 전 구분을 위해 유지. 생성 시안에 없는 새 문장을 기록에 삽입하지 않았다.

전체 화면과 작성기/크롭/메뉴 확대 관찰, DOM의 크기/overflow/버튼 상태를 함께 확인했다. 시안보다 메타가 더 작고 사진이 실제 crop 비율이며 원본 링크가 남는 것은 정보 위계 및 기존 데이터 보존을 위한 의도된 차이다. 모바일 전체 프로필은 운영 배치를 보존하므로 생성 이미지와 줄바꿈/첫 사진 노출 높이가 다르다.

## 수정 이력

- 최초: CUA Chrome/IAB 연결 없음 → blocked. 후속 Chrome 검증 연결로 해소.
- P2: 서로 다른 사진 비율 때문에 미디어 아래90~160px 빈칸. 선택 slide 측정/ResizeObserver 적용. 재캡처 mobile-feed-final/pc-home-final/tablet-final에서 해소. 390px 269→358→269px, 641/820/390 재조정 후 index1 유지.
- P2: 원문 전체의 여러 짧은 문장이 첫 사진 위로 몰림. 첫 미디어 이전 도입부 최대3문단/240자로 수정. 실제 개강 둘리 도입부 한 문장과 첫 사진, 단일 더 보기 확인.
- P2: PC 상세 탐색 줄 중복. 헤더에 피드로 링크 통합, pc-detail-final에서 확인.
- P2: 로컬 영상 metadata 요청 CORS 오류. 로컬 metadata origin 옵션만 제공하고 재생/포스터/원본은 원래 origin 유지. 실제 상세 video URL과 재로드 이후 콘솔 오류0 확인.

## 동작 검증

빈 게시/입력/삭제, 링크 폼, 작성 닫기와 복귀, 크롭 비율/코멘트 변경 취소 후 원래 값, touch swipe 및 방향키/숫자/코멘트 동기화, 햄버거 열기/닫기/글방 이동, 분류 필터, 원문 확장 및 상세, 실제 ChatGPT2개/20메시지를 확인했다. 기록을 게시하거나 운영 데이터에 쓰지 않았다.

모델/DOM 정제·writing 회귀·V2 backend test, 새 실제 앱 DOM 이벤트 검사와 검토 빌드 통과. DOM 테스트는 I/O 주입 경계를 명시하며 브라우저 테스트를 대신하지 않는다.

## 잔여 범위

이번 승인 화면 범위에서 열린 P0/P1/P2 없음. 실물 iPhone/Safari, 실제 업로드 속도/새 영상 변환, SEO·조회수·기존 URL·앨범 태그 운영 통합은 records/README.md에 남은 별도 항목이다. 새 기록의 게시/대용량 업로드는 이번 브라우저 세션에서 실행하지 않았다.

---

## 기존 운영 디자인 QA 기록 (이번 검토본과 별개)

# Entry Gate Design QA

## Comparison target

- Source visual truth: `/Users/kimchansu/.codex/generated_images/019f8ca8-58a7-77d0-aa5c-e064c7df3b72/exec-3e94ae49-0ae2-42f1-a6aa-4adf3aaddc46.png`
- Implementation URL: `http://127.0.0.1:4173/`
- Desktop implementation screenshot: `/tmp/cwk-entry-gate-desktop.png`
- Mobile implementation screenshot: `/tmp/cwk-entry-gate-mobile.png`
- Full-view comparison: `/tmp/cwk-entry-gate-comparison.png`
- Focused card comparison: `/tmp/cwk-entry-gate-focused-comparison.png`

## Viewport, density, and state

- Source raster: `1586 x 992`
- Desktop CSS viewport: `1440 x 900`, `devicePixelRatio: 1`
- Desktop browser capture: `1332 x 900`
- Mobile CSS viewport and capture: `390 x 844`, `devicePixelRatio: 1`
- Full-view normalization: source downsampled to `1439 x 900`; implementation kept at `1332 x 900`; both aligned to the same 900 px image height.
- Focused normalization: the source and implementation card regions were independently cropped and normalized to 700 px height.
- Compared state: mandatory-BGM gate ready to enter, live BGM and daily line loaded, returning visitor with no new updates, no owner-only edit control visible.

## Evidence review

### Full view

The source and implementation share the same overall composition: diagonal gray page background, moving mono marquee, centered black-bordered white frame, yellow welcome strip, handwritten page title, three bordered information rows, outset gray enter button, red back-navigation warning, and small mono footer.

### Focused card

The focused comparison was required because the icon, typography, row spacing, borders, button treatment, and small status copy were too small to judge reliably in the full view. The final crop confirms that the existing site display/mono fonts, sharp square borders, yellow/gray/red tokens, pixel speaker asset, and row rhythm follow the selected visual.

## Required fidelity surfaces

- Fonts and typography: existing site display and mono font families are used; heading, banner, data labels, CTA, warning, and footer preserve the source hierarchy without introducing a new type system.
- Spacing and layout rhythm: the centered frame, separated information rows, CTA gap, and mobile stacking match the source structure. The 390 px view has no horizontal overflow.
- Colors and tokens: the implementation uses the current site's diagonal gray background, pale-yellow banner/entry surface, gray update surface, black borders, blue links, and red warning tokens.
- Image quality and asset fidelity: the speaker is a transparent PNG generated for this flow, rendered pixelated at the intended small size. It is not an emoji, CSS drawing, inline SVG, or placeholder.
- Copy and content: source example content is replaced by live BGM, KST date-specific webmaster line, and browser-visit-based update state. The mandatory-music warning and no-silence footer preserve the selected voice.

## Findings

- No actionable P0, P1, or P2 visual mismatches remain.
- P3 / intentional: the source contains example content, while the implementation renders live data and may show `NO NEW UPDATES SINCE YOUR LAST VISIT`.
- P3 / intentional: the implementation adds one compact status line below the button so loading, playback failure, and refresh-resume states can be explained without adding another control.
- P3 / intentional: the yellow strip uses the existing solid site token rather than introducing a new gradient that would drift from the current public design system.

## Comparison history

1. Initial browser comparison
   - P2 findings: keyboard focus changed the CTA fill to yellow; the speaker subject rendered too small inside its transparent raster; the three information rows appeared as one collapsed table; the hidden site shell still contributed excess page height.
   - Fixes: changed focus to a dotted outline, scaled the real generated asset inside a smaller layout box, switched to separated bordered rows, and removed the hidden shell from layout while the gate is open.

2. Focused typography comparison
   - P2 findings: live BGM displayed a raw `.mp3` suffix and the information text was visually lighter/smaller than the source.
   - Fixes: removed the audio file extension only in the entrance display and increased the desktop information/warning type sizes while retaining the smaller responsive mobile type.

3. Final comparison
   - Evidence: `/tmp/cwk-entry-gate-comparison.png` and `/tmp/cwk-entry-gate-focused-comparison.png`
   - Result: no actionable P0/P1/P2 differences; remaining P3 differences are intentional live-product behavior.

## Browser and interaction checks

- The real audio element changes from paused to playing before the gate is removed.
- Successful admission lands at scroll position 0 and exposes the original page.
- Same-tab SPA navigation keeps the BGM playing and does not reopen the gate.
- Direct post URLs show the gate first and retain their exact destination after admission.
- A same-tab refresh either resumes automatically or keeps the gate open with the mandatory `RESUME` action when autoplay is blocked.
- `390 x 844` responsive capture has no horizontal overflow.
- Final browser navigation produced no `Runtime.exceptionThrown` or `Log.entryAdded` events.

final result: passed
