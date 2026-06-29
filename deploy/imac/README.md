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

Rollback 기준:

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
3. PocketBase migration 적용
4. PocketBase를 `deploy/imac/com.coldwaterkim.pocketbase.plist`로 launchd 실행
5. Caddy는 운영 전 `/usr/local/bin/caddy`에 root-owned로 설치한 뒤 `deploy/imac/com.coldwaterkim.caddy.plist`로 LaunchDaemon 실행
6. 로컬 리허설은 외부 포트 없이 `127.0.0.1`에서만 한다. 예: PocketBase `127.0.0.1:8090`, Caddy `http://127.0.0.1:18081`.
7. `https://coldwaterkim.com` 전환 전 테스트는 `/etc/hosts` 또는 내부 DNS로만 한다.

Caddy 운영 바이너리 설치 예:

```bash
sudo install -m 755 -o root -g wheel .local-bin/caddy /usr/local/bin/caddy
sudo cp deploy/imac/com.coldwaterkim.caddy.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.coldwaterkim.caddy.plist
sudo launchctl bootstrap system /Library/LaunchDaemons/com.coldwaterkim.caddy.plist
```

QA:

- `/api/health`가 200
- `/` 홈 렌더링
- `/posts/`, `/daily/`, `/programs/`, `/nasajab/`, `/guestbook.html`, `/about.html` 직접 URL 200
- 브라우저 콘솔 error 0개
- `media.file`, `programs.download_files` maxSize가 `2147483648`
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
$EDITOR ~/.config/coldwaterkim/pocketbase-admin.env
```

```env
PB_URL=https://api.coldwaterkim.com
PB_ADMIN_EMAIL=you@example.com
PB_ADMIN_PASSWORD=your-password
```

운영 백업 생성/다운로드:

```bash
npm run pb:backup:production
```

백업 검증:

```bash
unzip -t migration_backups/pocketbase/<backup-name>.zip
cat migration_backups/pocketbase/<backup-name>.zip.manifest.json
```

복원 리허설:

```bash
deploy/imac/restore-pocketbase-backup.sh migration_backups/pocketbase/<backup-name>.zip
.local-bin/pocketbase serve --http=127.0.0.1:8090 --dir migration_backups/restore-rehearsal-pb_data
```

완료 기준:

- 백업 ZIP 다운로드 성공
- manifest에 `sizeBytes`, `sha256`, `backupName` 기록
- `unzip -t` 통과
- 리허설 `pb_data`로 PocketBase가 기동
- `/api/health` 200
- 운영 글/방명록/미디어 샘플이 리허설 DB에서 일치
- `media.file`, `programs.download_files` maxSize가 `2147483648`

## Stage 4. DNS cutover

1. 공유기에서 아이맥 `192.168.0.11`을 고정 할당한다.
2. 80/443을 아이맥으로 포트포워딩한다.
3. `coldwaterkim.com`과 `www.coldwaterkim.com` A record를 집 공인 IP로 바꾼다.
4. TTL을 짧게 둔 뒤 외부 네트워크에서 확인한다.

QA:

- 외부에서 HTTPS 인증서 정상
- `/api/health` 200
- 글/방명록/미디어가 운영 데이터와 일치
- `api.coldwaterkim.com` 없이도 공개 사이트가 동작
- 24시간 동안 PocketBase/Caddy 재시작 없음

## Stage 5. Post-cutover hardening

- `deploy/imac/backup-pocketbase.sh`를 매일 실행한다.
- 백업은 최소 30일 보관한다.
- Time Machine 또는 외장 디스크에 `pb_data`와 백업 폴더를 포함한다.
- Oracle API 서버와 GitHub Pages 배포는 7일 이상 롤백용으로 유지한 뒤 정리한다.
