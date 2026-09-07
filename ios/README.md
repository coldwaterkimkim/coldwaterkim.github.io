# Coldwater Owner — iPhone 작성 앱

아이폰 사진 앱의 공유창 또는 앱의 작성기에서 사진과 글을 같은 `coldwaterkim.com` Records V2 서버에 게시한다. iOS 17 이상. SwiftUI + PhotosUI + Foundation을 사용하며 외부 런타임 SDK는 없다.

## 현재 검증 상태

앱·공유 확장·서버 API를 구현했고, iOS 컴파일·시뮬레이터 테스트 결과는 `iPhone Owner App` Actions 실행 결과를 따른다. 서명한 아이폰 설치, Photos 공유 확장, 화면 잠금·강제 종료·셀룰러 전환, 운영 서버 게시와 실제 프레임 성능은 각각 별도 검증해야 한다. 소스 생성이나 Go 테스트 통과만으로 설치·배포 완료로 간주하지 않는다.

## 빌드

최신 Xcode가 설치된 Mac에서 `bash ios/scripts/generate-project.sh`를 실행한 다음 생성된 `ios/ColdwaterOwner.xcodeproj`를 연다. 생성기는 XcodeGen 2.46.0 공식 배포의 SHA-256을 검증한다. 프로젝트 생성 결과는 추적하지 않고 `project.yml`을 기준으로 재생성한다.

앱과 Share 두 target에 동일한 유료 Apple Developer Team을 선택한다. 기본 Bundle ID는 `com.coldwaterkim.owner`, 공유 확장은 `.share`, App Group은 `group.com.coldwaterkim.owner`다. 두 target에 같은 App Group과 Keychain Sharing capability가 필요하다. Team ID나 인증서·API 키는 저장소에 넣지 않는다.

TestFlight 업로드에는 현재 Apple 요구사항을 충족하는 Xcode/SDK 및 서명 권한이 필요하다. 배포 계정이 연결되지 않았다면 unsigned simulator build로 실제 아이폰 설치를 대체할 수 없다.

## 데이터와 게시 계약

- OWNER 계정으로만 로그인하며 토큰은 공유 Keychain에 저장한다. 앱에 관리자 비밀번호나 서버 인증키를 내장하지 않는다.
- 사진 파일과 초안은 App Group에 먼저 보관한다. 게시 요청은 고유 UUID와 함께 파일 기반 background URLSession에 예약한다. 편집 화면은 큰 원본 대신 작은 썸네일을 사용한다.
- JPEG/PNG/HEIC/HEIF 사진을 가져오며 Live Photo는 정지 사진만 처리한다. 표시본은 최대 긴 변 4096px JPEG로 생성하고 GPS 등 원본 메타데이터를 복사하지 않는다. 가져온 원본 파일은 바이트 그대로 별도 private 서버 collection에 보관한다. Photos가 제공한 현재 파일과 촬영 당시 무수정 원본은 편집 여부에 따라 다를 수 있다.
- `POST /api/cwk/mobile/media`는 표시본과 원본을 같은 작업 ID로 업로드한다. 동일 요청 재시도는 동일 media를 반환한다.
- `POST /api/cwk/records-v2`는 `clientRequestId`로 중복 생성을 막는다. 기존 글 수정은 revision과 기존 문서 필드를 유지한다. 게시 후 GET으로 본문·분류·사진 연결을 확인해야 완료 표시한다.
- 실패한 전송 초안의 본문을 바꿔 같은 요청 ID로 보내지 않는다. 서버 응답 유실 후에는 동일한 요청으로 확인·재시도한다.
- 앱 강제 종료 시 iOS가 전송을 취소할 수 있다. 재실행 시 저장된 작업을 복구한다. 사진 단위 재시도이며 바이트 오프셋 재개를 보장하지 않는다.
- 일부 초안 JSON을 읽지 못해도 정상 초안의 열기·전송 복구는 계속하고, 손상 파일과 원본 사진은 그대로 보존한다.
- 사진 변환과 multipart 파일 작성은 화면 작업에서 분리한다. 초안별 저장·전송 상태 변경은 해당 항목만 갱신해 전체 초안 디스크 재검색을 반복하지 않는다.
- 기존 복잡한 HTML·첨부·임베드는 앱에서 변환하지 않는다. 기존 글 수정은 본문·분류·새 사진 추가 범위다.

## 서버 적용과 복구

서버 변경은 `mobile_originals` private collection, 공개 media의 숨김 작업 식별자/원본 참조, Records V2 작업 식별자 필드를 추가한다. 기존 미디어나 게시물을 변환하거나 삭제하지 않는다. 원본의 접근 규칙은 DB에 저장되어 이전 서버 바이너리로 돌아가도 일반 사용자에게 공개되지 않는다.

운영 적용 전 백업 범위는 SQLite 일관 스냅샷과 기존 PocketBase 바이너리다. 전체 미디어 콜드 백업은 필요하지 않다. 새로운 앱 기능은 최신 서버의 OWNER capabilities 응답을 확인해야 사용할 수 있다. 운영 적용은 로컬·CI 검증 및 release manifest 검증 후 수행한다.

## 자동 검증

`.github/workflows/ios-owner.yml`은 공개 저장소의 표준 macOS runner에서 앱·확장을 컴파일한다. Go 테스트 바이너리 안에만 포함된 `TestIOSFixtureServer`가 임시 PocketBase DB와 가짜 OWNER를 loopback에 실행한다. 실제 계정·운영 DB·개인 사진은 CI로 보내지 않는다. 시뮬레이터 bundle은 로컬 ad-hoc 서명으로 실행하고, 별도로 기기용 Release archive를 Apple 배포 서명 없이 컴파일한다. 이 archive는 설치용 IPA나 TestFlight 업로드를 대신하지 않는다.

시뮬레이터 테스트는 사진 가져오기→원본/표시본 업로드→게시→익명 API/사진 조회→수정 보존과 네이티브 작성기 초안 복구를 검증한다. `CWK_UI_TESTING` 테스트 저장소/서버 변경은 DEBUG 시뮬레이터에서만 활성화된다. 이 테스트는 기기 서명·App Group 실권한·Share 프로세스 종료를 증명하지 않으므로 실기기 검증을 대체하지 않는다.
