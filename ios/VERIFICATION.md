# iPhone OWNER 검증 기록 — 2026-09-07

## 확인한 흐름

- `953d456`의 [CI 실행](https://github.com/coldwaterkimkim/coldwaterkim.github.io/actions/runs/34129718444): Xcode 26.2, iPhone 시뮬레이터에서 앱·공유 확장 컴파일 및 5개 테스트 통과.
- 실제 앱 `OwnerStore`로 가짜 OWNER 로그인 → PNG 가져오기 → 원본 바이트 보존/GPS 없는 표시본 → background URLSession 파일 업로드 → Records V2 게시 → 익명 API와 이미지 조회 → 기존 게시물 수정/첨부·최초 발행 보존을 검증했다. 운영 서버가 아닌 동일 코드의 격리된 PocketBase 테스트 서버를 사용했다.
- 네이티브 작성 화면에서 글 입력·닫기·프로세스 종료·재실행 후 초안 복구를 확인했다. 파일 누락/손상이 정상 초안을 숨기지 않고 원본을 보존하는 테스트도 통과했다.
- 전체 초안 재검색을 초안별 저장·사진 추가·상태 전환에서 제거한 `100ec02`의 [최종 실행](https://github.com/coldwaterkimkim/coldwaterkim.github.io/actions/runs/34130485870)은 시뮬레이터 앱·확장 및 기기용 Release archive 컴파일과 같은 5개 테스트를 모두 통과했다.

## 운영 서버 준비 상태

배포 대상 서버 바이너리는 `026597a20f1ac54965512fad67d3c93fbb73e7ec`의 깨끗한 분리 작업공간에서 빌드하고 release manifest를 검증했다. SQLite 일관 스냅샷에서 새 바이너리를 실행한 리허설은 health 200, DB quick_check 정상, 기존 media 1449 / records_v2 1 / posts 29 / daily_entries 81 보존, private originals 접근 규칙을 확인했다. 기존 원본 미디어 전체를 복사하거나 삭제하지 않았다.

staged generation은 `026597a20f1ac54965512fad67d3c93fbb73e7ec-715f0ce84d2eb45e23180ca32228fdfa1b204d04d539ae15ba49de33fd9940ab`이다. **운영 current 포인터·프로세스·DB는 활성화하지 않았다.** 관리자 sudo 인증이 없는 상태에서 정상 activation을 실행하면 포인터 교체 후 재시작에 실패할 수 있다. `--no-start`는 job 해제와 포트 미사용을 요구하므로 실행 중인 서비스에 사용하지 않는다.

로컬 배포 증거는 운영 runtime의 `deploy-rollbacks/iphone-owner-20260907T133753Z/`에 있다. 활성화 재개 시 staged/current와 최근 백업·서비스 상태를 다시 확인하고 정상 `imac:activate-backend` 경로를 사용한다. 운영 게시 테스트는 별도로 수행하고 그 테스트에서 생성한 항목만 추적해 정리한다.

## 설치와 실기기에서 남은 확인

- Apple Developer/앱 배포 계정 연결, 실제 Team/App Group/Keychain entitlement로 서명, TestFlight 또는 등록 아이폰 설치.
- Photos 공유 확장 완료 직후 앱에 전송이 인계되는지, 화면 잠금·네트워크 전환·강제 종료 후 재실행에서 복구되는지 확인.
- 아이폰에서 사진 30장 가져오기·스크롤·글 입력의 프레임 시간, 메모리·발열 확인. 구조 검토와 시뮬레이터 성공은 실기기의 부드러움을 증명하지 않는다.

시뮬레이터용 ad-hoc 서명과 Apple 배포 서명은 다르다. CI의 unsigned 기기 archive는 설치용 IPA나 TestFlight 배포 완료를 뜻하지 않는다. 테스트용 저장소/토큰 동작은 DEBUG 시뮬레이터에서만 활성화된다.
