# iMac home server migration

이 폴더는 `coldwaterkim.com`을 GitHub Pages/Oracle API 구조에서 아이맥 단일 홈서버 구조로 옮기기 위한 운영 파일이다.

## 목표 구조

```text
coldwaterkim.com
  -> 집 공유기 80/443 포트포워딩
  -> iMac
      - Caddy: HTTPS, 정적 파일, /api 프록시
      - PocketBase: 127.0.0.1:8090
      - pb_data: DB + 업로드 파일 원본
```

PocketBase는 외부 서비스가 아니라 아이맥에서 직접 실행되는 CMS/DB 프로그램이다. `pb_data`는 repo에 커밋하지 않고 아이맥 디스크와 백업 디스크에만 둔다.

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
- `media.file`, `programs.download_files` 업로드 한도는 2GB다.

## Stage 2. iMac service rehearsal

1. `deploy/imac/install-runtime.sh`로 아이맥 CPU에 맞는 PocketBase/Caddy 바이너리를 `.local-bin/`에 둔다.
   - Intel iMac은 `darwin_amd64`/`mac_amd64`가 필요하다.
   - 현재 핀: PocketBase `v0.23.5`, Caddy `v2.11.4`.
2. `npm run build:imac`
3. 저장소의 `pb_migrations`로 PocketBase migration 적용
4. PocketBase를 `deploy/imac/com.coldwaterkim.pocketbase.plist`로 launchd 실행
5. Caddy는 운영 전 `/usr/local/bin/caddy`에 root-owned로 설치한 뒤 `deploy/imac/com.coldwaterkim.caddy.plist`로 LaunchDaemon 실행
6. 로컬 리허설은 외부 포트 없이 `127.0.0.1`에서만 한다. 예: PocketBase `127.0.0.1:8090`, Caddy `http://127.0.0.1:18081`.
7. `https://coldwaterkim.com` 전환 전 테스트는 `/etc/hosts` 또는 내부 DNS로만 한다.

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

운영 launchd 설치/기동은 아래 스크립트로 한 번에 처리한다. `--dry-run`으로 복사/등록될 경로를 먼저 확인한 뒤 실제 설치한다.

```bash
npm run imac:install-services:dry-run
npm run imac:install-services
npm run qa:launchd
```

launchd 설정 파일만 먼저 점검:

```bash
npm run qa:launchd:tooling
```

QA:

- `npm run qa:service-smoke:local` 통과
- `npm run qa:launchd:tooling` 통과
- `npm run imac:install-services:dry-run` 출력에 PocketBase/Caddy/백업 launchd 설치 경로가 모두 포함
- `/api/health`가 200
- `/` 홈 렌더링
- `/posts/`, `/daily/`, `/programs/`, `/nasajab/`, `/guestbook.html`, `/about.html` 직접 URL 200
- 브라우저 콘솔 error 0개
- `media.file`, `programs.download_files` maxSize가 `2147483648`
- launchd PocketBase 설정이 `pb_data`와 저장소의 `pb_migrations`를 함께 사용
- 관리자 로그인
- 테스트 글 작성/수정/삭제
- 테스트 미디어 업로드/삭제
- 500MB 이상 테스트 파일 업로드
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
- `media.file`, `programs.download_files` maxSize가 `2147483648`

## Stage 4. DNS cutover

1. 공유기에서 아이맥 `192.168.0.11`을 고정 할당한다.
2. 80/443을 아이맥으로 포트포워딩한다.
3. `coldwaterkim.com`과 `www.coldwaterkim.com` A record를 집 공인 IP로 바꾼다.
4. TTL을 짧게 둔 뒤 외부 네트워크에서 확인한다.

공유기/DNS 변경 직전 사전점검:

```bash
npm run qa:migration-go
npm run cutover:snapshot:dry-run
npm run cutover:snapshot
npm run qa:rollback
HOME_SERVER_LAN_IP=192.168.0.11 HOME_SERVER_PUBLIC_IP=<집-공인-IP> npm run qa:network-preflight
```

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
HOME_SERVER_PUBLIC_IP=<집-공인-IP> npm run qa:cutover:network
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
- 외부에서 HTTPS 인증서 정상
- `/api/health` 200
- 글/방명록/미디어가 운영 데이터와 일치
- `api.coldwaterkim.com` 없이도 공개 사이트가 동작
- 24시간 동안 PocketBase/Caddy 재시작 없음
- `npm run qa:cutover:network` 통과
- `npm run qa:service-smoke -- --origin https://coldwaterkim.com` 통과

## Stage 5. Post-cutover hardening

- `deploy/imac/backup-pocketbase.sh`를 매일 실행한다.
- 백업은 최소 30일 보관한다.
- Time Machine 또는 외장 디스크에 `pb_data`와 백업 폴더를 포함한다.
- Oracle API 서버와 GitHub Pages 배포는 7일 이상 롤백용으로 유지한 뒤 정리한다.

자동 백업 설치:

```bash
mkdir -p ~/Library/LaunchAgents ~/Library/Logs
cp deploy/imac/com.coldwaterkim.pocketbase-backup.plist ~/Library/LaunchAgents/
launchctl bootstrap "gui/$(id -u)" ~/Library/LaunchAgents/com.coldwaterkim.pocketbase-backup.plist
launchctl kickstart -k "gui/$(id -u)/com.coldwaterkim.pocketbase-backup"
```

백업 확인:

```bash
ls -lh ~/Backups/coldwaterkim-pocketbase/pb_data_*.tar.gz
shasum -a 256 -c ~/Backups/coldwaterkim-pocketbase/pb_data_*.tar.gz.sha256
tar -tzf "$(ls -t ~/Backups/coldwaterkim-pocketbase/pb_data_*.tar.gz | head -1)" >/dev/null
npm run qa:hardening
npm run qa:launchd
```

완료 기준:

- `com.coldwaterkim.pocketbase-backup` launchd job 등록
- 수동 kickstart 후 `pb_data_*.tar.gz`와 `.sha256` 생성
- `shasum -a 256 -c` 통과
- `tar -tzf` 통과
- `npm run qa:hardening` 통과
- `npm run qa:launchd` 통과
