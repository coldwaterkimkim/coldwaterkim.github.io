# iMac home server migration

이 폴더는 `coldwaterkim.com`을 GitHub Pages/Oracle API 구조에서 아이맥 단일 홈서버 구조로 옮기기 위한 운영 파일이다.

## 목표 구조

```text
coldwaterkim.com
  -> 집 공유기 80/443 포트포워딩
  -> iMac
      - Caddy: HTTPS, 정적 파일, /api 프록시
      - PocketBase: 127.0.0.1:8090, CMS/API와 공개 글·하루 SEO HTML 렌더링
      - ~/.local/share/coldwaterkim/home-server/pb_data: DB + 업로드 파일 원본
      - ~/.local/share/coldwaterkim/home-server/tus-uploads: 완료 전 대용량 업로드 조각
      - ~/.local/share/coldwaterkim/home-server/tool-jobs: OWNER 파일 변환 임시 작업(0700, 백업 제외)
```

PocketBase는 외부 서비스가 아니라 아이맥에서 직접 실행되는 CMS/DB 프로그램이다. launchd 서비스는 macOS Documents 접근 제한을 피하기 위해 repo가 아니라 `~/.local/share/coldwaterkim/home-server`에 복사된 운영 파일을 사용한다. `pb_data`는 repo에 커밋하지 않고 아이맥 디스크와 백업 디스크에만 둔다.

## Stage 0. Freeze

1. 현재 Git commit hash와 `pre-imac-migration-YYYYMMDD` tag를 남긴다.
2. 운영 PocketBase에서 새 글/업로드를 잠깐 멈춘다.
3. 운영 서버의 `pb_data`를 cold backup으로 만든다.
4. 백업 파일 크기와 압축 해제 가능 여부를 확인한다.
5. 로컬 HEAD가 원격 `main`과 같은지, freeze tag가 현재 이주의 조상인지 확인한다.

```bash
npm run qa:migration-freeze
```

Rollback 기준:

- DNS 변경 직전 `npm run cutover:snapshot`으로 기존 DNS/HTTP 응답/현재 Git HEAD를 `migration_backups/cutover/`에 남긴다.
- DNS를 기존 GitHub Pages/Oracle API 레코드로 되돌린다.
- 기존 Oracle PocketBase를 끄지 않고 최소 7일 유지한다.
- iMac `pb_data`에 문제가 있으면 마지막 운영 백업으로 교체한다.

## Stage 1. Repo readiness

완료 기준:

- `npm run build`는 기존 GitHub Pages용으로 계속 `api.coldwaterkim.com`을 본다.
- `npm run build:imac`은 `coldwaterkim.com` 같은 origin의 `/api`를 본다.
- 공개 dist 안에 `cdn.jsdelivr.net` 런타임 의존이 없다.
- `media.file` 원본 업로드 한도는 20GiB(21,474,836,480바이트)이고, `programs.download_files`는 별도 2GB 한도를 유지한다.
- 느린 외부망에서도 20GiB 원본을 재개 업로드할 수 있도록 PocketBase HTTP 읽기/쓰기 제한시간은 3시간이다.
- 64MB 이상 영상은 Uppy/tus로 중단 지점부터 재개하며, 완료 후에만 기존 `media.file` 원본으로 등록한다.
- OWNER 전용 `/admin/upload-diagnostics.html`은 동일 영상을 3·6·8-way로 전송해 비교하고 미디어 레코드 없이 자신이 만든 tus 조각만 정리한다. `npm run imac:upload-ab:summary`로 `cwk-ab-*` 운영 로그를 독립 집계한다.
- GUI 없이 실제 클라이언트 파일을 비교할 때는 `npm run imac:upload-ab:run`에 `CWK_TUS_AB_FILE=/절대/경로/영상.mp4`와 `CWK_TUS_AB_CLIENT=macbook`을 전달한다. 64MiB~1GiB의 MP4/MOV/M4V/WebM을 변형 없이 읽어 3·6·8-way를 비교하며, 인증값은 `CWK_TUS_QA_*` 환경변수로만 전달하고 결과 JSON에는 남기지 않는다.

## Stage 2. iMac service rehearsal

1. `deploy/imac/install-runtime.sh`로 3시간 HTTP 제한시간을 적용한 PocketBase와 아이맥 CPU에 맞는 Caddy 바이너리를 `.local-bin/`에 둔다. 영상 파생본 기능은 `npm run imac:install-ffmpeg`로 체크섬이 고정된 Intel용 FFmpeg/ffprobe도 설치한다. 프로그램실 서버 변환기는 `npm run imac:install-file-tools`로 Intel용 micromamba와 conda-forge의 고정 버전 qpdf·Poppler·Tesseract·Ghostscript, macOS에 등록되는 Temurin 21.0.10+7, 체크섬이 고정된 LibreOffice와 H2Orestart 0.7.13을 준비한다. H2Orestart는 GPLv3이며 설치 시 LibreOffice bundled extension으로 무결성 검증 후 배치되고, 실행 job은 격리된 LibreOffice profile만 사용한다.
   - Intel iMac은 `darwin_amd64`/`mac_amd64`가 필요하다.
   - 현재 소스 핀: PocketBase `v0.40.1`, Caddy `v2.11.4`.
   - PocketBase는 `deploy/imac/pocketbase-custom/`의 공식 v0.40.1 엔트리포인트에 `--httpRequestTimeout=3h`, tusd v2.10.0 라우트, OWNER 전용 BGM trim 라우트, `--siteDir` 기반 SEO 렌더러를 추가한다. 완료 파일은 PocketBase 파일 API로 다시 등록되므로 `pb_data` 저장 구조와 JS migration 동작은 공식 v0.40.1과 같다.
   - `/api/cwk/bgm/trim`은 실행 중인 PocketBase와 같은 `bin` 폴더의 FFmpeg/ffprobe로 새 MP3를 만들고 duration과 전체 디코딩을 검증한다. 원본 삭제는 API가 하지 않으며, 브라우저가 새 플레이리스트와 편성을 저장한 뒤 참조되지 않은 이전 레코드만 정리한다.
   - `/api/cwk/tools/*`는 `CWK_OWNER_USER_ID`로 명시된 단일 `users` 레코드와 PocketBase superuser만 접근한다. 설치기는 운영 `users`가 이 OWNER 1개뿐인지 읽기 전용으로 확인하고, 기존 비-OWNER 계정이 남아 있으면 배포를 중단한다. 최대 200MiB·20파일(HWP/HWPX는 1파일), 동시 실행 1개·대기 3개이며 완료 결과는 30분 뒤 삭제된다. HWP/Office→PDF, OCR, PDF 압축·암호·복구·흑백·텍스트 추출을 처리한다.
   - SEO 렌더러는 `/posts/{slug}/`, `/daily/{day}/`, `/sitemap.xml`만 처리하고 Caddy는 나머지 공개 파일을 `dist`에서 그대로 제공한다. DB를 요청 시 읽으므로 발행·수정·초안 전환 뒤 별도 정적 파일 생성 작업은 없다. 발행 기록이 없는 유효한 `/daily/{day}/`는 검색엔진과 비로그인 방문자에게 HTTP 404·`noindex`를 유지하되 JSON 대신 일관된 HTML 셸을 내려, 로그인한 OWNER 브라우저가 같은 주소에서 해당 날짜의 초안을 불러올 수 있게 한다.
   - Go 1.27.0 Intel 공식 배포본의 SHA-256을 고정해 빌드하며, `deploy/imac/build-pocketbase-custom.sh`가 커스텀 플래그와 바이너리 버전을 확인한다. 빌드 전 PocketBase 소스와 migration이 현재 Git commit에 모두 포함되어 있고 변경이 없는지 확인한다. 이어 `go version -m`의 실제 Go toolchain, PocketBase module, `vcs.revision`이 빌드 pin과 현재 commit에 일치할 때만 `.local-bin/pocketbase-release.json`에 commit, PocketBase/Go 버전, 바이너리 SHA-256, migration tree SHA-256, 빌드 시각을 기록한다. 관련 없는 worktree 변경으로 `vcs.modified=true`인 것은 허용하지만 revision 불일치는 허용하지 않는다. 운영 반영 전에는 운영 DB와 분리한 SQLite 사본에서 system/user migration을 먼저 리허설한다.
2. `npm run build:imac`
3. `npm run imac:install-services:dry-run`으로 운영 런타임 폴더 복사와 launchd 설치 계획 확인
4. PocketBase를 `deploy/imac/com.coldwaterkim.pocketbase.plist`로 시스템 LaunchDaemon 실행
5. Caddy는 운영 전 `/usr/local/bin/caddy`에 root-owned로 설치한 뒤 `deploy/imac/com.coldwaterkim.caddy.plist`로 LaunchDaemon 실행
6. 로컬 리허설은 외부 포트 없이 `127.0.0.1`에서만 한다. 예: PocketBase `127.0.0.1:8090`, Caddy `http://127.0.0.1:18081`.
7. `https://coldwaterkim.com` 전환 전 테스트는 `/etc/hosts` 또는 내부 DNS로만 한다.

실제 변환기 E2E는 공개 테스트용 HWP/HWPX fixture를 명시해 Office, OCR, qpdf, Ghostscript, 텍스트 추출까지 한 번에 검사한다. `--tooling` 검사는 바이너리가 없는 개발 머신용이라 실제 변환 성공 증거로 쓰지 않는다.

```bash
CWK_DOCX_FIXTURE=/절대/경로/fixture.docx \
CWK_XLSX_FIXTURE=/절대/경로/fixture.xlsx \
CWK_PPTX_FIXTURE=/절대/경로/fixture.pptx \
CWK_HWP_FIXTURE=/절대/경로/fixture.hwp \
CWK_HWPX_FIXTURE=/절대/경로/fixture.hwpx \
node scripts/verify-file-tools-backend.mjs
```

운영 launchd는 아래 파일들을 `~/.local/share/coldwaterkim/home-server`로 복사해서 실행한다.

- `dist`
- `pb_migrations`
- `pb_data`
- `tus-uploads` (완료 전 조각만 보관하며 `pb_data` 백업 대상은 아님)
- `tool-jobs` (0700, 완료 결과 30분 보관, `pb_data` 백업 대상은 아님)
- `bin/pocketbase`
- `pocketbase-release.json` (현재 backend provenance; 이전 것은 `.previous.json`)
- `bin/ffmpeg`, `bin/ffprobe`
- `bin/qpdf`, `bin/pdfinfo`, `bin/pdftoppm`, `bin/pdftotext`, `bin/tesseract`, `bin/gs`, `bin/soffice`, `bin/java`, `bin/sips`
- `Caddyfile`
- `backup-pocketbase.sh`
- `backup-pocketbase.py`
- `process-video-media.py`

## 집 Wi-Fi Split DNS

집 안에서도 공개 DNS를 사용하면 `coldwaterkim.com` 업로드가 공유기의 NAT loopback을 거친다. 공유기 DHCP가 집 기기에 아이맥 `192.168.0.11`을 DNS로 배포하고, 아이맥의 `com.coldwaterkim.split-dns` LaunchDaemon이 아래처럼 응답한다.

- `coldwaterkim.com`, `www.coldwaterkim.com` → `192.168.0.11`
- 나머지 도메인 → 기존 KT DNS `168.126.63.1`, `168.126.63.2`로 전달

아이맥 운영 인터페이스는 Ethernet이며 수동 IPv4 `192.168.0.11/24`, 라우터 `192.168.0.1`을 사용한다. Ethernet MAC은 `78:7B:8A:C1:B1:25`이고 Wi-Fi는 주소 충돌과 경로 혼선을 막기 위해 끈다. 공유기에서는 `192.168.0.11`을 다른 기기에 배포하지 않도록 기존 고정 임대를 유지하거나 Ethernet MAC으로 이전한다. dnsmasq는 포트 53을 사용하므로 최초 설치만 관리자 권한이 필요하고, 이후에는 launchd가 부팅 시 자동 복구한다.

```bash
npm run imac:build-split-dns
npm run qa:split-dns
npm run imac:install-split-dns:dry-run
npm run imac:install-split-dns
```

설치 직후 `dig @192.168.0.11 coldwaterkim.com`과 일반 외부 도메인 전달을 확인한 다음에만 공유기 DHCP DNS를 `192.168.0.11` 하나로 바꾼다. DNS 데몬 검증 전에 공유기 DHCP를 먼저 바꾸면 집 전체 이름 해석이 중단될 수 있으므로 순서를 바꾸지 않는다. 맥북 `/etc/hosts` 항목은 현장 속도 비교용일 뿐 영구 설정에 사용하지 않는다.

64MB 이상 영상은 브라우저 Uppy가 `/api/cwk/tus/files/`로 전송한다. 256MB 미만은 기존 3분할을 유지하고, 256MB 이상은 서버 권장값 6분할과 32MiB PATCH 단위를 사용한다. 유한 PATCH 단위 덕분에 연결이 끊겨도 거대한 부분 전체가 아니라 마지막 미완료 chunk부터 다시 보낸다. 서버는 `tus-uploads`에 받은 바이트와 오프셋을 남기므로 네트워크 중단 뒤 같은 파일을 다시 선택하면 이어서 보낸다. 전송 시작 전 서버가 20GiB 안전 여유와 결합 중 최대 약 원본 2배의 임시 공간을 확인한다. 전송 완료 후 `/api/cwk/tus/finalize`는 부분 조각을 먼저 지워 디스크 피크를 낮추고, 결합본 하나만 `media.file`로 등록한 뒤 남은 임시 파일도 제거한다. 완료 전 조각은 운영 백업에 넣지 않으며 7일 이상 방치된 조각은 매일 자동 정리한다. tus 기능이 없으면 64MB 이상 영상은 불안정한 단순 업로드로 우회하지 않고 재개 서버 연결 오류를 명확히 보여준다.

운영 HTTPS 리스너는 의도적으로 HTTP/1.1만 광고한다. 실제 MacBook Chrome에서 HTTP/2를 사용할 때 편집기의 기존 영상 Range 요청과 6개 tus PATCH가 단일 TCP 연결을 공유해 약 6~7MB/s에 머물렀다. HTTP/1.1에서는 병렬 PATCH가 별도 연결로 분리되며, 서버가 `192.168.0.10`으로 확인한 실제 MacBook Chrome의 640MiB 지속 전송은 3·6·8분할에서 각각 47.9·44.7·44.7MB/s였다. 실제 `uploadMedia` 경로도 3.5초 강제 중단 뒤 여섯 HEAD 오프셋에서 재개해 원본 SHA-256 일치까지 확인했다. 이 설정은 사이트 전체에서 HTTP/2·HTTP/3 멀티플렉싱을 사용하지 않는 대신 OWNER 업로드 연결을 분리하는 운영 결정이다. 브라우저 1회차의 분할별 차이는 약 7%이고 서버 로그 해상도가 1초이므로, 반복 MacBook LAN A/B에서 가장 빨랐던 기존 6분할 기본값을 유지한다.

롤백할 때는 소스 `deploy/imac/Caddyfile`에서 전역 `servers :443 { protocols h1 }` 블록을 제거하고 운영 런타임 `Caddyfile`도 같은 내용으로 동기화한다. 런타임 설정을 `caddy validate`/`caddy adapt`로 확인한 뒤 `caddy reload`하고, 공개·LAN health와 TLS가 다시 HTTP/2로 협상되는지 확인한다. 소스나 런타임 한쪽만 바꾸면 다음 배포 또는 현재 실행 상태가 서로 어긋나므로 둘을 항상 같이 변경한다.

속도 A/B는 OWNER 전용 `/admin/upload-diagnostics.html`에서 동일 파일 또는 브라우저 OPFS에 만든 640MiB 디스크 샘플을 3·6·8-way로 전송해 수행한다. Caddy가 status 응답에 서버가 실제로 본 클라이언트 IP를 넣고 진단 JSON도 이를 보존한다. `192.168.0.11`·loopback에서 실행한 아이맥 자체 값은 서버 sanity check일 뿐 MacBook 목표 달성으로 판정하지 않으며, 현재 기준 MacBook 주소 `192.168.0.10`이 기록된 결과만 최종 실측으로 인정한다. 일반 업로드에는 원본 사전 읽기나 콘솔 진단이 추가되지 않는다.

영상 업로드는 원본 `media.file`을 바꾸지 않는다. 새 영상은 `video_status=pending`으로 저장되고, 사용자 LaunchAgent `com.coldwaterkim.video-processor`가 한 번에 하나씩 포스터와 필요한 웹 재생본을 만든다. 이미 H.264/AAC, 1080p·30fps 이하, Fast Start MP4인 원본은 중복 재생본을 만들지 않고 그대로 쓴다. 호환 H.264 MOV나 Fast Start가 아닌 MP4는 영상 재인코딩 없이 MP4 포장만 바꾸고, HEVC·4K·고프레임 등 변환이 필요한 영상만 `h264_videotoolbox`를 우선 사용한다. 비트레이트는 원본 크기·해상도·길이에 맞춰 최대 6Mbps 안에서 정하며, 하드웨어 변환 실패 시 `libx264`로 자동 복구한다. 모든 생성본은 H.264/AAC, 1080p·30fps 이하, Fast Start와 앞·뒤 디코딩을 검사한 뒤 저장한다. 처리 전/실패 시 공개 화면은 원본으로 자동 fallback한다.

기존 운영 서버의 영상 schema 또는 backend 변경 배포 순서는 아래처럼 분리한다. `imac:sync-runtime`은 frontend 전용이라 `dist`만 교체하고 `dist.previous` 한 세대를 남긴다. PocketBase binary, migration, Caddy, 백업 프로그램, OWNER 파일은 절대 동기화하지 않는다. Backend 변경은 아래의 manifest-bound stage/activation 경로만 사용한다.

```bash
npm run imac:build-backend-release
npm run qa:backend-release
# 현재 iMac runtime DB와 원본을 직접 증분 백업
npm run imac:backup:local
# 아래 Stage 5 절차로 최신 snapshot SHA-256, quick_check, 격리 restore를 확인
npm run imac:stage-backend:dry-run
npm run imac:stage-backend
# 별도 SQLite 사본에서 migration 리허설 및 quick_check 완료
npm run imac:activate-backend:dry-run
CWK_BACKEND_ACTIVATE_COMMIT=위_검증에서_출력된_전체_commit npm run imac:activate-backend
# 새 media 필드와 /api/health 확인
npm run imac:install-video-processor:dry-run
npm run imac:install-video-processor
npm run imac:video:enqueue-referenced
```

`imac:build-backend-release`는 `deploy/imac/pocketbase-custom` 또는 `pb_migrations`에 커밋되지 않은 파일·수정이 하나라도 있으면 manifest를 만들지 않는다. 같은 PocketBase 버전이라도 binary의 `vcs.revision`이 manifest commit과 다르면 생성·stage·activation 모두 중단된다. stage와 activation은 binary build metadata와 SHA-256, migration tree SHA-256을 다시 검사하고, migration hash가 적힌 Git commit의 실제 tree와 같은지도 확인한다.

Activation은 manifest의 전체 commit을 `CWK_BACKEND_ACTIVATE_COMMIT`으로 다시 입력해야 실행되며 PocketBase만 재시작한다. kickstart 전 PID를 읽고, 30초 안에 다른 PID가 나타나며 `http://127.0.0.1:8090/api/health`가 건강한 JSON을 직접 반환해야 성공이다. Caddy를 거친 공개 응답은 이 postcondition을 대신하지 않는다. `--no-start`는 파일을 현재 경로로 전환하되 재시작과 PID/health postcondition을 의도적으로 생략한다. 정비 창에서 재시작을 별도로 통제할 때만 쓰고 운영 완료 판정으로 사용하지 않는다. `dist`, Caddy, 백업 서비스, launchd plist는 건드리지 않는다.

중요: 현재 스크립트는 최신 iMac local backup과 격리 restore rehearsal의 성공을 자동으로 증명하지 못한다. 따라서 위 두 증거를 운영자가 직접 확인하기 전 production activation은 **BLOCKED**다. 기존 `pb:backup:production`은 legacy `https://api.coldwaterkim.com` 원격 백업 경로라 이 backend release gate의 증거로 사용하지 않는다.

전환 전 binary와 migration은 `bin/pocketbase.previous`, `pb_migrations.previous`에 남고, 기존 provenance가 있으면 `pocketbase-release.previous.json`도 함께 남는다. 다만 PocketBase 기동 중 DB migration이 이미 적용됐다면 binary만 되돌리는 것은 안전하지 않을 수 있다. 장애 시 자동으로 옛 binary를 덮어쓰지 말고, DB snapshot과 migration 호환성을 먼저 확인한 뒤 같은 세대 파일을 함께 복구한다.

기존 글에서 참조 중인 영상만 최초 대기열에 넣을 때:

```bash
npm run imac:video:enqueue-referenced
```

처리 로그는 `~/Library/Logs/coldwaterkim-video-processor.log`과 `.error.log`에 남는다. 원본은 삭제하거나 덮어쓰지 않으며, 파생 파일은 같은 PocketBase `media` 레코드의 `web_video`, `video_poster` 필드에 별도 보관된다.
일시 오류는 최대 3회 자동 재시도한다. 최종 실패 항목을 다시 대기열에 넣으려면 `npm run imac:video:retry-errors`를 쓴다. 사용자 LaunchAgent라 아이맥 로그인 전에는 변환이 시작되지 않지만 PocketBase와 공개 사이트는 계속 정상 동작한다.

격리 샘플로 원본 직결, 무손실 remux, 소프트웨어 fallback을 다시 검사하려면 `npm run qa:video-processor`를 실행한다.

로컬 Caddy 리허설:

```bash
.local-bin/caddy run --config deploy/imac/Caddyfile.local --adapter caddyfile
npm run qa:service-smoke:local
```

Caddy 운영 바이너리 설치 예:

```bash
sudo install -m 755 -o root -g wheel .local-bin/caddy /usr/local/bin/caddy
sudo cp deploy/imac/com.coldwaterkim.caddy.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.coldwaterkim.caddy.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.coldwaterkim.caddy.plist
```

운영 launchd 최초 설치/기동은 아래 스크립트로 처리한다. 이 전체 설치 명령은 새 서버 bootstrap 전용이며 평소 배포나 기존 서버 plist 갱신에 쓰지 않는다. 이 경로는 PocketBase binary, migration, backend manifest를 복사하지 않는다. 현재 runtime 세 파일이 없거나, 같은 release verifier에서 HEAD·binary version/build metadata/SHA-256·migration Git tree 일치를 통과하지 못하면 dry-run과 실제 설치 모두 fail-closed로 중단된다. 새 서버라 아직 PocketBase PID가 없을 때만 stage 후 `imac:activate-backend:no-start`로 파일을 준비하고, LaunchDaemon 설치가 끝난 뒤 건강 상태를 별도로 확인한다. `--dry-run`으로 복사/등록될 경로를 먼저 확인한 뒤 실제 설치한다. PocketBase, Caddy, 백업 job은 `/Library/LaunchDaemons`에 등록되어 사용자 로그인 전에도 부팅 시 자동 시작된다. PocketBase와 백업 job은 각각 `UserName=kimchansu`로 실행하고, 백업 job은 `Umask=077`을 적용한다.

```bash
# 새 서버 bootstrap에서만: build/QA/stage와 exact commit 확인을 먼저 완료
CWK_BACKEND_ACTIVATE_COMMIT=검증된_전체_commit npm run imac:activate-backend:no-start
CWK_OWNER_USER_ID=운영_users_레코드_ID npm run imac:install-services:dry-run
CWK_OWNER_USER_ID=운영_users_레코드_ID npm run imac:install-services
npm run qa:launchd
```

프론트 정적 파일만 바뀐 배포는 launchd 재등록이나 서비스 재시작이 필요 없다. 이때는 sudo 없이 `dist`만 새 폴더로 만든 뒤 교체하고 직전 세대는 `dist.previous`로 남긴다. 오래된 해시 JS/CSS가 현재 운영 폴더에 누적되지 않으며 backend/Caddy/backup 파일은 바뀌지 않는다.

```bash
npm run build:imac
npm run imac:sync-runtime
npm run qa:service-smoke
```

공사 화면은 공개 HTML의 `/api/health` 검사와 Caddy `handle_errors`를 함께 사용한다. PocketBase/DB 장애만으로는 정적 `dist`와 Caddy가 계속 살아 있으므로 `maintenance.html`을 제공할 수 있고, 5초 간격 복구 확인 뒤 원래 URL로 자동 복귀한다. Caddy 자체·iMac 전원·회선·DNS 장애는 같은 서버의 화면으로 대신할 수 없다.

`deploy/imac/Caddyfile` 또는 Caddy binary를 변경한 배포는 frontend 배포와 분리한다. Caddy-only 경로는 Caddy binary/config와 Caddy LaunchDaemon만 다루며 `dist`, PocketBase, migration, backup 파일은 건드리지 않는다. 먼저 dry-run 경계를 확인한다.

```bash
npm run imac:install-caddy:dry-run
npm run imac:install-caddy:no-start
~/.local/share/coldwaterkim/home-server/bin/caddy validate \
  --config ~/.local/share/coldwaterkim/home-server/Caddyfile \
  --adapter caddyfile
~/.local/share/coldwaterkim/home-server/bin/caddy reload \
  --config ~/.local/share/coldwaterkim/home-server/Caddyfile \
  --adapter caddyfile
```

launchd 설정 파일만 먼저 점검:

```bash
npm run qa:launchd:tooling
```

QA:

- `npm run qa:service-smoke:local` 통과
- `npm run qa:launchd:tooling` 통과
- `npm run imac:install-services:dry-run` 출력에 PocketBase/Caddy/백업 launchd 설치 경로가 모두 포함
- launchd plist와 Caddyfile이 `Documents` 경로 대신 `~/.local/share/coldwaterkim/home-server`를 사용
- PocketBase/Caddy/백업 job이 시스템 LaunchDaemon으로 등록
- `/api/health`가 200
- 공개 HTTPS와 LAN HTTPS가 실제 HTTP/1.1로 협상되고 Caddy adapted config의 `protocols`가 `["h1"]`
- `/` 홈 렌더링
- `/posts/`, `/daily/`, `/programs/`, `/nasajab/`, `/guestbook.html`, `/about.html` 직접 URL 200
- 브라우저 콘솔 error 0개
- `media.file` maxSize가 `21474836480`, `programs.download_files`가 `2147483648`
- launchd PocketBase 설정이 운영 런타임 폴더의 `pb_data`와 `pb_migrations`를 함께 사용
- 관리자 로그인
- 테스트 글 작성/수정/삭제
- 테스트 미디어 업로드/삭제
- 64MB 이상 Uppy/tus 테스트 파일 업로드, 중간 중단 후 HEAD 오프셋부터 재개, 최종 파일 체크섬 일치
- 같은 tus upload id를 두 번 finalize해도 `media` 레코드가 하나만 생김
- 500MB 이상 실제 영상 테스트 파일 업로드
- 모바일/데스크톱 화면 확인

## Stage 3. Production data rehearsal

운영 데이터 이주는 공개 API를 긁는 방식이 아니라 PocketBase backup ZIP을 기준으로 한다. 그래야 DB, auth collection, settings, storage metadata가 같이 움직인다.

로컬 보안 파일 예:

```bash
mkdir -p ~/.config/coldwaterkim
chmod 700 ~/.config/coldwaterkim
cp deploy/imac/pocketbase-admin.env.example ~/.config/coldwaterkim/pocketbase-admin.env
chmod 600 ~/.config/coldwaterkim/pocketbase-admin.env
$EDITOR ~/.config/coldwaterkim/pocketbase-admin.env
```

```env
PB_URL=https://api.coldwaterkim.com
PB_ADMIN_EMAIL=you@example.com
PB_ADMIN_PASSWORD=your-password
```

비밀값은 채팅이나 repo에 남기지 않는다. 운영 이주 직전에는 아래 사전점검이 먼저 통과해야 한다.

```bash
npm run qa:migration-freeze
npm run qa:migration-go:tooling
npm run qa:production-readiness
npm run pb:preflight:production
```

채팅에 비밀값을 남기지 않기 위해, 아이맥에서는 아래 파일을 Finder에서 열거나 터미널에서 실행해 로컬 입력 단계를 진행할 수 있다.

```bash
open deploy/imac/run-interactive-production-gates.command
```

운영 PocketBase superuser를 모르면 현재 운영 VM에서 먼저 재설정한다. Oracle VM에 접속할 수 있는 터미널에서 아래 스크립트를 실행하고, 같은 이메일/비밀번호를 아이맥의 로컬 보안 파일에도 저장한다.

```bash
deploy/oracle/reset-pocketbase-superuser.sh
```

현재 아이맥에 Oracle SSH 개인키가 없으면 Oracle Cloud Console의 Browser SSH 또는 원래 키가 있는 Mac에서 위 작업을 해야 한다.

운영 백업 생성/다운로드:

```bash
npm run pb:backup:production
```

운영 백업부터 복원 리허설까지 한 번에 실행:

```bash
npm run pb:rehearse:production
```

백업 검증:

```bash
unzip -t migration_backups/pocketbase/<backup-name>.zip
cat migration_backups/pocketbase/<backup-name>.zip.manifest.json
npm run pb:verify:data -- migration_backups/pocketbase/<backup-name>.zip --schema pb_schema.json
```

복원 리허설:

```bash
deploy/imac/restore-pocketbase-backup.sh migration_backups/pocketbase/<backup-name>.zip
.local-bin/pocketbase serve --http=127.0.0.1:8090 --dir migration_backups/restore-rehearsal-pb_data --migrationsDir pb_migrations
```

이미 받은 백업 ZIP만 다시 리허설할 때:

```bash
npm run pb:rehearse:backup -- migration_backups/pocketbase/<backup-name>.zip --schema pb_schema.json
```

완료 기준:

- 백업 ZIP 다운로드 성공
- manifest에 `sizeBytes`, `sha256`, `backupName` 기록
- `unzip -t` 통과
- `npm run pb:verify:data -- <backup.zip> --schema pb_schema.json` 통과
- 리허설 `pb_data`로 PocketBase가 기동
- `/api/health` 200
- 운영 글/방명록/미디어 샘플이 리허설 DB에서 일치
- `media.file` maxSize가 `21474836480`, `programs.download_files`가 `2147483648`

## Stage 4. DNS cutover

1. 공유기에서 아이맥 `192.168.0.11`을 고정 할당한다.
2. 80/443을 아이맥으로 포트포워딩한다.
3. `coldwaterkim.com`과 `www.coldwaterkim.com` A record를 집 공인 IP로 바꾼다.
4. TTL을 짧게 둔 뒤 외부 네트워크에서 확인한다.

공유기/DNS 변경 직전 사전점검:

```bash
npm run imac:configure-network:auto
npm run qa:migration-go
npm run cutover:snapshot:dry-run
npm run cutover:snapshot
npm run qa:rollback
npm run qa:network-preflight
```

`npm run qa:network-preflight`는 DNS를 바꾸기 전에 집 공인 IP의 80번 포트가 아이맥 Caddy까지 도달하는지 확인한다. 응답에 `ipTIME` 또는 `Httpd/1.0`이 보이면 아직 공유기 관리 화면으로 들어가는 상태이므로, 공유기에서 TCP 80/443을 `HOME_SERVER_LAN_IP`의 80/443으로 포워딩한 뒤 다시 실행한다.

`npm run imac:configure-network:auto`는 아이맥 LAN IP와 집 공인 IPv4를 감지해서 `~/.config/coldwaterkim/home-server.env`에 저장한다. 자동 감지가 틀리거나 실패하면 `npm run imac:configure-network`로 직접 입력한다. 다른 경로를 쓰려면 `HOME_SERVER_ENV_FILE`을 지정한다.

전환 전 로컬 컷오버 검증:

```bash
npm run build:imac
npm run imac:install-services:dry-run
npm run qa:cutover
npm run qa:launchd
```

실제 운영 데이터까지 포함해서 검증:

```bash
npm run qa:cutover -- --data pb_data --schema pb_schema.json
```

DNS 전환 후 외부 검증:

```bash
npm run qa:cutover:network
npm run qa:service-smoke -- --origin https://coldwaterkim.com
```

QA:

- `HOME_SERVER_LAN_IP`가 아이맥의 실제 LAN IP와 일치
- `HOME_SERVER_PUBLIC_IP`가 DNS에 넣을 공인 IPv4
- `npm run qa:migration-go`가 모든 실제 운영 게이트를 통과
- `migration_backups/cutover/cutover-snapshot-*.json`에 기존 DNS A record와 공개 route 응답이 남아 있음
- `/usr/local/bin/caddy` 운영 바이너리 설치
- `npm run qa:launchd` 통과
- `npm run qa:network-preflight` 통과
- 집 공인 IP의 80/443 포트가 공유기 관리 화면이 아니라 아이맥 Caddy로 연결
- 외부에서 HTTPS 인증서 정상
- `/api/health` 200
- 글/방명록/미디어가 운영 데이터와 일치
- `api.coldwaterkim.com` 없이도 공개 사이트가 동작
- 24시간 동안 PocketBase/Caddy 재시작 없음
- `npm run qa:cutover:network` 통과
- `npm run qa:service-smoke -- --origin https://coldwaterkim.com` 통과

## Stage 5. Post-cutover hardening

- `deploy/imac/backup-pocketbase.sh`를 매일 실행한다. PocketBase는 중지하지 않는다.
- `data.db` 온라인 스냅샷은 30일 보관하고, DB가 가리키는 실제 업로드 원본은 `incremental/originals`에 append-only로 한 번만 보관한다.
- `media.web_video`, `media.video_poster`, PocketBase 썸네일, tus 임시 조각은 원본에서 재생성할 수 있으므로 증분 원본 백업에서 제외한다.
- Time Machine 또는 외장 디스크에 `incremental/originals`, `incremental/db-snapshots`, `incremental/manifests`를 포함한다.
- 아이맥 전원 설정은 서버 모드로 고정한다. 시스템 잠자기/디스크 잠자기/standby/autopoweroff는 끄고, 정전 후 자동 재시작은 켠다.
- Oracle API 서버와 GitHub Pages 배포는 7일 이상 롤백용으로 유지한 뒤 정리한다.

자동 백업은 PocketBase와 Caddy를 재시작하지 않는 전용 경로로 설치한다. 먼저 dry-run으로 백업 실행 파일 `0700`, plist, 정확한 백업 root 소유권 검사 경로를 확인한다.

```bash
bash deploy/imac/install-launchd-services.sh --backup-only --dry-run
bash deploy/imac/install-launchd-services.sh --backup-only
```

기존 root 실행 백업이 만든 파일이 있으면 실제 설치는 fail-closed로 중단된다. 설치기는 `~/Backups/coldwaterkim-pocketbase` 아래만 검사하고 소유권을 자동 변경하지 않는다. 아래 읽기 전용 결과를 검토해 모든 항목이 `kimchansu` 소유임을 확인한 뒤에만 실제 설치한다. root 소유 항목의 정리는 별도 수동 작업이며, 범위를 확인하지 않은 재귀 `chown`은 실행하지 않는다.

```bash
sudo find "$HOME/Backups/coldwaterkim-pocketbase" ! -user kimchansu -print
```

정상 운영에서는 `npm run imac:install-services`도 같은 소유권 gate를 통과한 뒤 `com.coldwaterkim.pocketbase-backup.plist`와 `0700`인 `backup-pocketbase.sh`, `backup-pocketbase.py`를 운영 런타임 폴더 기준으로 설치한다.

전원 설정:

```bash
sudo pmset -a sleep 0 disksleep 0 standby 0 autopoweroff 0 autorestart 1 womp 1 tcpkeepalive 1 ttyskeepawake 1
npm run qa:power
```

백업 확인:

```bash
npm run imac:backup:local
npm run qa:incremental-backup
latest_db="$(ls -t ~/Backups/coldwaterkim-pocketbase/incremental/db-snapshots/data_*.db | head -1)"
stamp="$(basename "$latest_db" .db)"
manifest="$HOME/Backups/coldwaterkim-pocketbase/incremental/manifests/originals_${stamp#data_}.json"
(cd "$(dirname "$latest_db")" && shasum -a 256 -c "$(basename "$latest_db").sha256")
sqlite3 -readonly "$latest_db" 'PRAGMA quick_check;'
ls -lh ~/Backups/coldwaterkim-pocketbase/incremental/manifests/originals_*.json | tail -1
# 새 target 경로를 지정해 APFS copy-on-write 복원 리허설
npm run pb:restore:incremental -- \
  --snapshot "$latest_db" \
  --manifest "$manifest" \
  --originals-root ~/Backups/coldwaterkim-pocketbase/incremental/originals/storage \
  --target /tmp/coldwaterkim-restore-rehearsal \
  --verify-all
npm run qa:hardening
npm run qa:launchd
npm run qa:power
```

완료 기준:

- `com.coldwaterkim.pocketbase-backup` launchd job 등록
- 수동 kickstart 후 DB 스냅샷, SHA-256, 원본 manifest 생성
- DB 스냅샷 `shasum -a 256 -c` 통과
- DB 스냅샷 `PRAGMA quick_check` 통과
- 두 번째 실행에서 기존 원본 재복사 0개
- `npm run qa:hardening` 통과
- `npm run qa:launchd` 통과
- `npm run qa:power` 통과
