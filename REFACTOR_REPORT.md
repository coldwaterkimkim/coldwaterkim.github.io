# Evidence-Based Refactor & Hardening Report

- 기준 audit: `AUDIT.md`, `SELF_HOSTED_AUDIT.md`
- 기준 commit: `31a9c6a9c894d91f6bef672222639b6e0a10f1f0`
- 작업 branch: `codex/audit-service-deep-review`
- 검토 범위: 기준 commit 이후 이 보고서 commit까지의 전체 tracked diff

이 작업은 2017 iMac 운영을 유지한다는 제약을 전제로 했다. 구현과 사전 검증은 별도 worktree에서 수행한 뒤 `main`에 병합했고, 최종 commit `875acea46720b8f11c65d158dad8b9cf10c01f92`를 기준으로 운영 runtime까지 반영했다. 운영 DB는 삭제하거나 대량 수정하지 않았고, 별도 backup과 restore clone 검증 후 PocketBase·launchd·backup service·Caddy·정적 runtime만 안전하게 전환했다.

## Production Deployment Result

- **배포 판정: GO.** 운영 PocketBase는 0.40.1, Go 1.27.0 빌드로 전환됐고 local/public health가 모두 HTTP 200이다.
- 정적 runtime과 GitHub Pages는 `875acea46720`을 제공하며 공개 주요 route, API, admin proxy 33개 smoke가 통과했다.
- PocketBase·Caddy·backup은 system LaunchDaemon으로 설치됐다. PocketBase와 backup은 `kimchansu:staff`로 실행되고 재부팅·crash 후 자동 시작하도록 등록됐다.
- 운영 전 fresh backup, SHA-256, SQLite `quick_check`, 1,428개 originals 전수 검증과 별도 restore clone의 PocketBase 0.40.1 기동을 확인했다. 배포 후 non-root backup도 실제 1회 성공했다.
- 운영 진단은 18 PASS / 0 FAIL / 2 UNKNOWN이다. UNKNOWN 두 건은 재시작 후 아직 기록되지 않은 PocketBase·Caddy의 last-exit 값이며 현재 서비스 실패를 뜻하지 않는다.
- 배포 직후 Chrome 연결이 끊겨 실제 운영 OWNER write/upload는 수행하지 않았다. 공개 Chrome 렌더링은 정적 배포 후 확인했고, backend 전환 후에는 direct/public health와 33개 HTTP smoke로 검증했다.

## What Changed

- 공개 운영 중인 PocketBase 0.23.5를 0.40.1, Go 1.27.0 기반의 검증된 빌드 대상으로 올렸다. binary version, Go build metadata, Git revision, clean-worktree 여부, binary/migration SHA-256을 하나의 secret-free manifest로 묶었다.
- backend 배포를 build → stage → exact commit confirmation → activation으로 분리했다. binary·migration·manifest는 `commit-binarySha256` 이름의 불변 세대 하나에 저장하고, macOS `F_FULLFSYNC`를 거친 `current` pointer와 고정 launcher로 함께 선택한다. 기존 세대 전환은 launcher와 `previous`를 먼저 준비하고 `current`를 마지막 migration commit point로 게시하며, 그 이후에는 절대 자동 rollback하지 않는다.
- 관리자 로그인 redirect, 미디어 원본명/대체텍스트 렌더링, 발행 실패 후 status 오염을 막았다. 저장·삭제·발행 중에는 관련 form 상태를 고정하고 중복 mutation과 stale editor load를 무시한다.
- Ask Me는 reverse proxy가 덮어쓴 신뢰 헤더 또는 socket 주소만 client identity로 사용한다. client IP별 실패예산과 성공 여부와 무관한 전역 읽기예산, query/payload 상한을 추가하고 DB/bcrypt 전에 예산을 원자 예약해 병렬·분산 burst 우회를 막았다.
- 증분 backup/restore를 fail-closed로 강화했다. SQLite online snapshot, quick check, SHA-256, append-only originals, 10GiB reserve floor, symlink 거부, `F_FULLFSYNC`, exclusive target publication, ZIP 입력 private snapshot, restore 후 전수 checksum을 검증한다.
- root LaunchDaemon이 사용자 수정 가능 backup script를 실행하던 구조를 `kimchansu:staff`, `Umask 077`로 바꿨다. 새 non-root plist를 root-owned staged 파일에서 `F_FULLFSYNC`·원자 게시한 뒤 기존 system job의 unload와 부재를 증명해야만 runtime script를 교체하고, backup root의 소유권·symlink도 변경 없이 검사한다.
- 읽기 전용 iMac 운영 진단을 추가했다. local/public health, launchd, 최신 backup, disk, log size, TLS, backend provenance를 secret 없이 PASS/FAIL/UNKNOWN으로 출력한다.
- Apple 기본 Git과 호환되지 않던 branch 탐지 명령을 제거했다.

## Fixed

| Audit 항목 | Branch 결과 | 운영 반영 상태 |
|---|---|---|
| P0-01 / SH-P0-01 PocketBase 원격 종료 취약 버전 | source pin과 custom binary를 0.40.1로 올리고, clone migration rehearsal과 release provenance gate를 추가했다. | **운영 반영 완료. live 0.40.1** |
| P1-02 / SH-P1-05 Ask Me abuse·client IP 신뢰 | 임의 `X-Forwarded-For` 신뢰를 제거하고 proxy 전용 헤더, RemoteAddr fallback, 입력 상한, client별 실패 5회와 성공·실패 공통 전역 60회/10분 원자 read budget을 적용했다. | 운영 반영 완료 |
| P1-03 / SH-P1-06 backend provenance 분리 | exact commit/hash stage·activation, single-writer lock, 불변 세대, full-sync atomic pointer, migration commit point, 새 PID와 direct health postcondition을 적용했다. | 운영 반영 완료 |
| P1-04 관리자 login `next` XSS/open redirect | root-relative same-origin 경로만 허용하고 unsafe 값은 관리자 기본 화면으로 보낸다. | 운영 반영 완료 |
| P1-05 / SH-P1-08 저장형 OWNER self-XSS | 파일명·alt를 HTML 문자열로 넣지 않고 DOM text/property API로 렌더링한다. | 운영 반영 완료 |
| P1-06 발행 실패 뒤 숨은 published status | 발행 상태를 DOM에 남기지 않고 해당 request payload에만 적용하며 content/media snapshot을 고정한다. | 운영 반영 완료 |
| SH-P1-03 root backup script 실행 | full-sync non-root plist 원자 게시 → 기존 root job unload·absence 증명 → private runtime script 교체 순서로 전환하고 foreign ownership/symlink를 거부한다. | 운영 반영 완료; 실제 backup 성공 |
| P2-08 하루 중복 저장 | 저장 gate로 동시 mutation을 직렬화했다. | 운영 반영 완료 |
| P2-09 삭제 취소·실패 시 editor 종료 | 성공한 삭제만 navigation을 허용하고, 저장 중 이동과 stale load를 막았다. | 운영 반영 완료 |
| P2-10 방명록 중복 제출·form 보호 | 제출 중 전 field를 고정하고 중복 request를 막았다. | 운영 반영 완료 |
| SH-P2-06/07 restore 안전성·copy 호환성 | canonical production path guard, APFS clone 우선 + copy fallback, capacity preflight, target exclusive publish, checksum 검증을 추가했다. | 도구 반영 및 실제 restore clone 검증 완료 |
| P2-15 release/test gate | build provenance, stage/activate 분리, current/previous generation 회귀 fixture와 failure rollback 검사를 추가했다. | 운영 반영 완료 |
| P2-17 알려진 Go 취약점 | upgrade 후 `govulncheck`에서 reachable 0, imported package 0을 확인했다. required module 1건은 현재 code path에서 호출되지 않는다. | 새 binary 운영 반영 완료 |
| SH-P1-07 최소 observability 부재 | mutation과 외부 전송이 없는 20개 read-only 진단을 추가했다. | 설치·실행 완료; 외부 alert는 범위 밖 |

## Intentionally Not Changed

- 2017 iMac 자체와 self-hosting/PocketBase/SQLite/Caddy 중심 구조는 바꾸지 않았다. 이번 목표는 검증된 위험 제거이며 cloud 이전이나 핵심 아키텍처 교체가 아니다.
- Ventura에서 더 이상 패치되지 않는 Screen Sharing, host firewall, router port forwarding, UPnP는 원격 접근을 끊을 수 있어 자동 변경하지 않았다.
- 같은 물리 SSD 안의 backup을 외부 provider로 복사하지 않았다. 새 외부 서비스와 데이터 전송은 사용자의 위치·비용·암호화 결정을 요구한다.
- 익명 media 열람 범위, users=OWNER 가정, MFA, public `/_/` admin UI는 product/auth 정책 변경이므로 이번 최소 수정에 포함하지 않았다.
- TUS 전체 동시 용량 reservation, 프로그램실 브라우저 메모리 상한, 앨범 전체 수집 query, 전면 SPA lifecycle 개편은 관련 사용 흐름과 migration 범위가 커서 보류했다.
- HSTS, CSP, Permissions-Policy는 현재 embed/editor 호환성 실측 없이 강제하지 않았다.
- Caddy admin API의 Unix socket 전환, root Caddy와 user-writable runtime config의 권한 경계, Caddy binary/config의 세대식 전환은 별도 운영 변경으로 남겼다.
- log rotation, 외부 uptime/backup alert, DDNS는 새 운영 정책 또는 외부 endpoint가 필요해 구현하지 않았다.
- retro UI와 공개 page 구조는 바꾸지 않았고, P3 cleanup이나 bundle 분할도 섞지 않았다.

## Tests Performed

실제로 실행해 통과한 검증:

- `npm run qa:hardening`: 47 checks
- `npm run qa:launchd:tooling`: 224 checks. A→B generation 전환, current commit 이후 무자동 rollback, 첫 live 전환 거부, redundant activation 보존, `F_FULLFSYNC`, root backup bootout 실패 선차단, unsafe pointer, launchd/lsof fail-closed fixture 포함
- `npm run qa:incremental-backup`: SQLite snapshot, append-only originals, symlink·capacity·corruption·ZIP race·exclusive restore target 회귀 포함
- `npm run qa:askme`: 117 assertions
- `npm run qa:guestbook-replies`: 27 assertions
- `npm run qa:writing`
- `npm run qa:rollback`: 32 checks
- `npm run qa:ops-health`
- `npm run qa:home-server`: production build와 91-file home-server 검사
- `npm run qa:network-readiness`: 35 checks
- `npm run qa:service-smoke`: 공개 주요 route와 `/api/health`, `/_/` proxy 33 checks
- `npm run qa:file-tools:backend:tooling`: 5/5
- `npm run qa:upload-ab`
- Go `test ./...`, `test -race ./...`, `vet ./...`
- Ask Me Go HTTP burst fixture: 같은 IP 100개는 인증 처리 5개/사전 429 95개, 서로 다른 IP 100개는 전역 인증 처리 60개/사전 429 40개
- Ask Me 정답 비밀번호 반복 fixture: 60개까지만 성공하고 61번째는 bcrypt/DB 전에 429
- `go run golang.org/x/vuln/cmd/govulncheck@latest ./...`: reachable 0, imported package 0, required module 1건은 not called
- `npm audit --omit=dev`, `npm audit`: 0 vulnerabilities
- Caddy production/local config `validate`와 `adapt`
- 운영 DB와 분리한 SQLite online snapshot에서 PocketBase 0.40.1 migration rehearsal: `quick_check=ok`, content count 유지, user migration 38개, canonical schema hash 유지
- live read-only ops health: 20개 중 PASS 15 / FAIL 0 / UNKNOWN 5
- 이 보고서까지 commit한 최종 clean detached HEAD에서 PocketBase release build와 `qa:backend-release`
- 실제 Chrome 공개 확인: `https://coldwaterkim.com/` 정상 렌더링, 비로그인 `/admin/index.html`의 로그인 redirect 정상
- 실제 Chrome 격리 OWNER E2E: exact branch binary와 운영 SQLite online snapshot clone을 loopback `127.0.0.1:18090`에서 실행해 로그인, 악성 외부 `next` 차단, 글 초안 저장·목록 단일 노출·재편집 내용 보존을 확인
- 실제 Chrome 관리 화면: daily 새 편집기, media filename/alt의 text rendering, guestbook 관리 화면 정상 로드
- 실제 Chrome 중복 제출: guestbook와 Ask Me 버튼을 각각 동시에 두 번 눌러도 clone에는 각 1건만 생성되고 성공 상태가 표시됨
- 실제 Chrome 반응형·접근성: 390×844에서 홈, OWNER 글쓰기, Ask Me의 가로 overflow 0; 제목에서 날짜로 `Tab` 이동; 앱 console error 0
- production fresh backup: originals 1,428개 전수 확인, DB snapshot SHA-256 일치, `quick_check=ok`
- 별도 restore clone: originals 1,428개 checksum 검증, PocketBase 0.40.1 loopback health/dashboard HTTP 200, 주요 collection count 유지
- production activation 후 exact generation manifest: commit `875acea46720b8f11c65d158dad8b9cf10c01f92`, PocketBase 0.40.1, Go 1.27.0, binary/migration SHA-256 일치
- production `qa:launchd`: 225 checks, `qa:service-smoke`: 33 checks
- production non-root incremental backup 1회: 새 snapshot 생성, copied files 0, originals 1,428개 재사용
- production ops health: 18 PASS / 0 FAIL / 2 UNKNOWN, TLS 88.9일, disk 151.1GiB free
- fresh WAL DB에서 sidecar가 없는 상태를 재현하고 `PRAGMA query_only=ON` OWNER 검증이 데이터 변경 없이 통과하는 회귀 확인

의도대로 막힌 gate 또는 환경 경계:

- `qa:migration-go:tooling`은 pre-migration freeze tag 부재, branch가 아직 `origin/main`과 다름, cutover local Caddy fixture 부재 때문에 No-Go였다. merge/production 전환을 실수로 통과시키지 않는 정상 차단이다.
- `qa:cutover`의 2개 실패는 격리 worktree의 `Caddyfile.local` dist root가 원본 worktree를 가리키고 `.local-bin/caddy`를 이 worktree에 복사하지 않은 환경 차이다. production/local Caddyfile 자체 validate는 통과했다.
- `qa:video-processor`는 이 worktree에 local FFmpeg runtime이 없어 실행하지 못했다.
- `qa:uppy-tus-client`는 `CWK_TUS_QA_ORIGIN`과 실제 인증된 upload target이 없어 실행하지 못했다.
- 현재 package에는 별도 lint/typecheck script가 없다. JavaScript regression QA, production build, Go test/race/vet, shell syntax, Python fixture로 대신 검증했다.
- production Chrome에는 OWNER 로그인 세션이 없어 운영 write/upload/publish/delete E2E는 하지 않았다. 대신 운영 SQLite online snapshot clone과 임시 OWNER를 사용해 실제 Chrome에서 동일 source/API 흐름을 검증했다.
- Chrome QA는 PocketBase direct same-origin `127.0.0.1:18090` 경로였다. production Caddy가 admin port 2019를 사용 중이어서 local Caddy browser 경로는 실행하지 않았으며, Caddy/TLS/launchd parity를 대신하지 않는다.
- 격리 Chrome에서도 글 발행·삭제, daily 저장·발행, media upload, 삭제 취소·실패 UI는 수행하지 않았다. 이 경로들은 격리 fixture와 JavaScript regression QA로 검증했고, Ask Me 분산 rate limit은 Go HTTP burst fixture와 `qa:askme`로 검증했다.

## Remaining Risks

1. **운영 P1:** 자동 backup이 iMac 내부 SSD와 같은 failure domain이다. disk/도난/화재에는 DB와 backup을 함께 잃을 수 있다. 이번 release backup·restore clone은 복구 가능성을 증명하지만 offsite를 대신하지 않는다.
2. **운영 P1/conditional P0:** Ventura Screen Sharing이 wildcard TCP 5900에서 대기하고 host firewall이 꺼져 있다. router WAN 5900 노출 여부는 확인되지 않았으며, WAN이면 즉시 P0다.
3. 외부 alert가 없다. 새 ops tool은 사람이 실행할 때 원인을 빠르게 좁히지만, 전원·인터넷·TLS·backup failure를 밖으로 보내지 않는다.
4. Caddy runtime binary/config는 후보 검증 후에도 runtime에 순차 복사되며, 다음 부팅까지 포함한 generation rollback은 없다. root Caddy가 user-writable runtime config를 읽는 권한 경계도 남아 있다.
5. 첫 generation 전환 전에 존재하던 flat backend는 provenance가 없으면 `legacy-before-generations`의 수동 참고본일 뿐 자동 rollback 세대가 아니다.
6. `previous` 세대가 있어도 새 migration이 DB에 적용된 뒤 binary pointer만 되돌리는 것은 안전하지 않다. DB snapshot과 migration 호환성 판단이 먼저다.
7. backup originals의 일일 빠른 검사는 저장된 size/mtime 상태를 활용한다. 동일 크기 silent corruption은 정기 `--verify-all` 또는 실제 restore drill 전까지 늦게 발견될 수 있다.
8. Ask Me limiter는 단일 PocketBase process의 memory counter라 restart 때 초기화되고 다중 instance 사이에는 공유되지 않는다. 실패 또는 정상 읽기 합계가 60회에 도달하면 최대 10분 동안 전체 Ask Me 읽기가 429로 닫히는 의도적인 fail-closed tradeoff도 있다.
9. log rotation, TUS global reservation, local account 격리, FileVault, MFA, 공개 admin 제한, media 정책 등 audit의 보류 P2는 남아 있다.

## Manual Actions Required

production activation과 local backup 전환은 완료됐다. 남은 수동 작업은 아래와 같다.

1. 암호화·versioning·retention이 있는 offsite 대상에 backup을 복제하고, iMac을 사용하지 않는 독립 restore test를 수행한다.
2. router에서 WAN TCP 5900·22·8090·2019와 UPnP mapping을 직접 확인한다. 5900이 WAN에 열려 있으면 먼저 접근 복구 경로를 준비한 뒤 차단한다.
3. 외부 위치에서 80/443 이외 불필요 port가 닫혔는지 확인하고, public IP 변경 시 알림 또는 DDNS 정책을 정한다.
4. production Chrome OWNER 세션을 사용할 수 있을 때 실제 origin에서 login/write/upload와 app console error 0을 한 번 확인한다. 현재는 격리 clone OWNER E2E와 운영 HTTP smoke까지 완료됐다.
5. 노출 가능성이 의심되는 credential은 값을 문서에 복사하지 말고 별도로 rotate한다.

## Product Decisions Needed

- offsite backup 위치, 월 비용, 암호화 key 보관, retention 기간
- Screen Sharing을 tailnet-only로 제한할지와 장애 시 대체 접속 경로
- public `/_/` admin UI를 유지할지, Tailscale/관리 IP로 제한할지
- OWNER MFA와 video worker credential 최소권한 분리 시점
- 익명 media 접근과 미발행 media 비공개 정책
- HSTS/CSP/Permissions-Policy 단계 도입 여부
- log rotation 보존 기간과 외부 uptime/backup alert 수신 채널
- Caddy root privilege/config 경계를 별도 generation 또는 root-owned config로 강화할지
- iMac self-hosting을 계속 유지할지. 현재 traffic·비용·운영 의도를 보면 유지 자체는 합리적이며, P0 제거와 offsite/alert가 확보되기 전까지는 cloud 이전보다 이 두 조치가 우선이다.

## Before / After

| 영역 | Before | After (branch source) |
|---|---|---|
| PocketBase | live/source 0.23.5, 공개 무인증 outage 취약 | **live 0.40.1**, exact commit/hash generation 검증 완료 |
| Go 취약점 | audit 기준 symbol-reachable 알려진 취약점 15개 | `govulncheck`: reachable 0, imported package 0 |
| Backend release | runtime 파일을 개별 복사, commit/provenance 결합 없음 | clean Git revision + binary/migration SHA manifest + immutable generation + atomic current pointer |
| 정전 중 backend 전환 | binary/migration/manifest 혼합 가능 | generation/file/pointer `F_FULLFSYNC`; launcher가 절대 generation을 한 번만 선택; current 전 실패만 복구, commit 이후 migration-aware 수동 복구 |
| Ask Me client IP | client가 만든 forwarding header를 신뢰 가능 | Caddy가 덮어쓴 전용 header 또는 RemoteAddr만 사용 |
| Ask Me abuse | query/payload와 병렬·분산 bcrypt burst 방어가 약함 | bounded query/payload + client 실패 5회 + 성공·실패 공통 전역 60회/10분 원자 budget |
| 관리자 redirect | raw `next`를 HTML/redirect에 사용 | root-relative same-origin만 허용 |
| 미디어 filename/alt | `innerHTML` 문자열 조립 | text/property 기반 DOM rendering |
| 발행 | 실패한 publish가 hidden status를 오염 가능 | request-local status + immutable content/media snapshot |
| Editor mutation | 중복 저장, stale load, 실패 후 이동 가능 | shared gate, frozen controls, generation guard, success-only navigation |
| Backup | same-disk legacy 세대 존재 여부 중심 | online SQLite snapshot + DB SHA + append-only originals + durable complete-generation pointer |
| Restore | live path/ZIP race/capacity 경계가 약함 | canonical guard + private ZIP snapshot + 10GiB floor + exclusive publish + checksum |
| Backup 권한 | root가 user-writable script 실행 | full-sync non-root plist 원자 게시 + root job unload/absence 증명 + `kimchansu:staff`, umask 077, ownership/symlink fail-closed |
| Observability | 장애 때 여러 명령을 수동 조합 | secret-safe read-only 20 checks; live 18 PASS / 0 FAIL / 2 UNKNOWN |

## Final Diff Review & Merge Judgment

- 기능 변화는 audit에서 근거가 확인된 security, release, backup/restore, editor concurrency 범위로 제한했다. PocketBase/SQLite/Caddy의 제품 구조, public UI 정체성, 콘텐츠 schema를 전면 교체하지 않았다.
- user migration 파일은 변경하지 않았다. 0.40.1 system migration은 production DB가 아닌 격리 clone에서만 rehearsal했다.
- 새 production environment variable secret은 추가하지 않았다. activation 확인값은 secret이 아닌 Git commit이며, OWNER/관리 credential 값은 출력·문서화하지 않았다.
- tracked diff에는 사용자 소유 `AUDIT.md`, `SELF_HOSTED_AUDIT.md`가 포함되지 않는다. 두 파일은 worktree에서 untracked로 보존했다.
- source merge 판정은 **GO**다. 두 독립 reviewer가 최신 전체 diff에서 merge-blocking P0/P1 0건을 확인했고, 최종 clean detached HEAD의 PocketBase release build·provenance 검증과 실제 Chrome 격리 OWNER 부분 E2E도 통과했다.
- production deploy 판정은 **GO**다. exact-HEAD build, fresh backup, restore rehearsal, first offline generation activation, non-root backup 전환, direct/public health, 33개 route smoke, 225개 launchd 검증을 완료했다. 실제 운영 OWNER write/upload는 Chrome 세션 부재로 남긴 수동 smoke이며, 현재 공개 서비스와 데이터 안전성에서 배포를 되돌려야 할 실패는 없다.

## Commit Structure

변경은 PocketBase upgrade, 관리자 보안, restore, non-root backup, Ask Me, mutation serialization, Apple Git 호환, release provenance, proxy header, immutable editor snapshots, ops health, durable backup, atomic backend generation, Ask Me client·전역 budget, activation/backup 전환 race 제거 순서의 독립 commit으로 나눴다. 각 commit은 관련 regression fixture를 통과한 뒤 다음 단계로 진행했다.
