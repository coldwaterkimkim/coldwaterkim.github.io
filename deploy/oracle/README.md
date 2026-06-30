# Oracle Always Free PocketBase API 배포

무료를 최대한 유지하면서 현재 PocketBase CMS 구조를 살리는 배포 경로다.

## 결론

- `coldwaterkim.com`: GitHub Pages 유지
- `api.coldwaterkim.com`: Oracle Cloud Always Free VM에서 PocketBase 운영
- 서버 형태: Ubuntu VM + Nginx + systemd + PocketBase

## 왜 Oracle인가

Oracle Always Free는 AMD 기반 `VM.Standard.E2.1.Micro`와 ARM 기반 `VM.Standard.A1.Flex`, 그리고 일정량의 boot/block volume을 무료 한도 안에서 제공한다. 개인 블로그 CMS 정도의 트래픽이면 PocketBase를 돌리기에 충분하다.

주의할 점은 두 가지다.

- 가입/카드/VM 생성은 사용자가 직접 해야 한다.
- Always Free VM은 장기간 idle로 판단되면 회수될 수 있으니 백업이 필요하다.

## Oracle Console에서 할 일

1. Oracle Cloud 계정 생성
2. Home region 선택
3. 비용 안전장치 확인
   - Cost Analysis에서 현재 비용 확인
   - Budgets에서 월 $1 정도의 알림 예산 생성
4. Compute Instance 생성
   - Image: Ubuntu
   - Shape: `VM.Standard.E2.1.Micro` 또는 `VM.Standard.A1.Flex`
   - 현재 운영 인스턴스는 `VM.Standard.E2.1.Micro`
   - Public IPv4: enabled
   - SSH key 등록
5. VCN/Security List ingress 열기
   - TCP 22: 내 IP만
   - TCP 80: `0.0.0.0/0`
   - TCP 443: `0.0.0.0/0`
6. DNS provider에서 `api.coldwaterkim.com` A record를 VM public IP로 연결

## 현재 Oracle 배포 상태

2026-05-26 기준으로 생성된 운영 VM:

- Instance: `coldwaterkim-pocketbase-api`
- Region: `ap-chuncheon-1`
- Shape: `VM.Standard.E2.1.Micro`
- OS: Canonical Ubuntu 24.04
- Public IPv4: `134.185.98.185`
- Budget: `coldwaterkim-pocketbase-budget`, 월 US$1, 1% actual spend 알림
- DNS provider: Cloudflare
- DNS: `api.coldwaterkim.com` A record, DNS 전용, `134.185.98.185`
- HTTPS: Let's Encrypt/certbot enabled

## 서버에서 실행

VM에 SSH 접속 후 repo를 가져온다.

```bash
git clone https://github.com/coldwaterkimkim/coldwaterkim.github.io.git
cd coldwaterkim.github.io
sudo deploy/oracle/install-pocketbase-api.sh
```

스크립트가 하는 일:

- PocketBase `0.23.5` 설치
- ARM/AMD 아키텍처 자동 감지
- `pocketbase` system user 생성
- `/home/pocketbase/pb_data` 데이터 디렉토리 준비
- systemd 서비스 등록/실행
- Nginx API reverse proxy 등록
- 백업 스크립트 설치
- Oracle 이미지 기본 iptables에서 TCP 80/443 허용 및 재부팅 후 유지

## HTTPS 인증서

DNS가 `api.coldwaterkim.com`으로 잘 퍼진 뒤 서버에서 실행한다.

```bash
sudo apt-get update
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d api.coldwaterkim.com
```

확인:

```bash
curl https://api.coldwaterkim.com/api/health
```

## PocketBase 초기 세팅

```bash
sudo -u pocketbase /home/pocketbase/pocketbase superuser upsert YOUR_EMAIL YOUR_PASSWORD --dir /home/pocketbase/pb_data
```

이미 운영 중인 VM에서 superuser 이메일/비밀번호를 잊었으면 repo가 있는 서버 터미널에서 아래 스크립트를 실행한다. 비밀번호는 프롬프트로 입력되며 shell history에 남지 않는다.

```bash
deploy/oracle/reset-pocketbase-superuser.sh
```

Oracle Console Browser SSH처럼 서버에 repo가 없는 터미널만 열 수 있을 때는, 아이맥 로컬 repo에서 아래 명령을 실행한 뒤 출력된 전체 shell block을 VM 터미널에 붙여넣는다.

```bash
npm run pb:oracle-reset-command
```

그 다음:

1. `https://api.coldwaterkim.com/_/` 접속
2. superuser로 로그인
3. 필요하면 `pb_schema.json` 기준 컬렉션을 수정/import
4. `users` auth collection의 블로그 관리자 계정 확인
5. `https://coldwaterkim.com/admin/`에서 로그인 테스트

운영 초기 credentials는 로컬 보안 파일에 저장한다.

```bash
cat ~/.config/coldwaterkim/pocketbase-admin.env
```

## VM 로그인도 막혔을 때의 부트볼륨 백업 fallback

PocketBase superuser도 모르고 SSH/Browser SSH도 막힌 상태에서는 운영 VM을 바로 재부팅하기 전에 부트볼륨 백업을 먼저 만든다. 이 경로는 운영 인스턴스를 계속 켜둔 채 저장장치 레벨의 fallback을 확보하는 용도다.

아이맥 로컬 repo에서 아래 명령을 실행하고, 출력된 전체 shell block을 Oracle Cloud Shell에 붙여넣는다.

```bash
npm run pb:oracle-boot-volume-backup-command
```

Cloud Shell 붙여넣기가 길어서 불안정하면 짧은 `curl` 버전을 쓴다.

```bash
npm run pb:oracle-boot-volume-backup-curl-command
```

첫 실행은 inspect-only라서 인스턴스/부트볼륨 정보만 보여주고 OCI 리소스를 만들지 않는다. 출력된 `CREATE_BACKUP=1 ...` 명령을 Cloud Shell에서 다시 실행하면 FULL boot volume backup을 만든다.

주의:

- 이건 PocketBase의 논리 백업 ZIP이 아니다.
- 운영 중인 디스크 백업은 crash-consistent일 수 있다.
- 백업 스토리지는 과금 대상이 될 수 있으니 Oracle 예산/무료 한도를 먼저 확인한다.
- 백업 생성 후에는 임시 복구 볼륨/헬퍼 VM에 붙여 `/home/pocketbase/pb_data`를 복사하고, 아이맥에서 `npm run pb:verify:data -- <copied-pb-data> --schema pb_schema.json`로 검증한다.

## 백업

설치 스크립트는 `/home/pocketbase/backup.sh`를 복사한다.

권장 cron:

```bash
sudo crontab -e
```

```cron
0 3 * * * /home/pocketbase/backup.sh
```
