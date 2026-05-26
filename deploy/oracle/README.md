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

## 백업

설치 스크립트는 `/home/pocketbase/backup.sh`를 복사한다.

권장 cron:

```bash
sudo crontab -e
```

```cron
0 3 * * * /home/pocketbase/backup.sh
```
