# PocketBase on Fly.io

이 폴더는 `api.coldwaterkim.com`에 PocketBase를 올리기 위한 Fly.io 배포 설정이다.

## 왜 Fly.io인가

- PocketBase는 SQLite와 업로드 파일을 디스크에 저장한다.
- 그래서 `/data` 같은 persistent volume이 필요하다.
- Fly.io는 Docker + volume + custom domain 조합이 단순해서 이 사이트의 CMS 서버에 잘 맞는다.

## 준비물

- Fly.io 계정
- 결제수단 등록
- `flyctl` 설치 및 로그인
- `api.coldwaterkim.com` DNS를 수정할 수 있는 권한

## 배포

프로젝트 루트에서 실행한다.

```bash
scripts/deploy-pocketbase-fly.sh
```

기본값:

- app: `coldwaterkim-pocketbase`
- region: `nrt`
- domain: `api.coldwaterkim.com`
- volume: `pb_data`, 1GB

필요하면 환경변수로 바꿀 수 있다.

```bash
FLY_APP_NAME=my-pocketbase FLY_REGION=nrt PB_DOMAIN=api.coldwaterkim.com scripts/deploy-pocketbase-fly.sh
```

## 첫 관리자 세팅

배포 후 Fly SSH에서 superuser를 만든다.

```bash
flyctl ssh console --app coldwaterkim-pocketbase
/pb/pocketbase superuser upsert YOUR_EMAIL YOUR_PASSWORD --dir /data
```

그 다음:

1. `https://api.coldwaterkim.com/_/` 접속
2. superuser로 로그인
3. `pb_schema.json` 기준 컬렉션 생성/import
4. `users` auth collection에 블로그 관리자 계정 생성
5. `https://coldwaterkim.com/admin/`에서 로그인 테스트

## DNS

`scripts/deploy-pocketbase-fly.sh`는 마지막에 `flyctl certs setup api.coldwaterkim.com`을 실행한다. 그 출력에 나온 DNS 레코드를 도메인 DNS provider에 추가한다.

DNS가 퍼진 뒤 확인:

```bash
flyctl certs check api.coldwaterkim.com --app coldwaterkim-pocketbase
curl https://api.coldwaterkim.com/api/health
```

## 주의

이 배포는 단일 Machine + 단일 volume 기준이다. 개인 블로그 CMS에는 충분히 단순하지만, volume이 붙은 호스트 장애 때는 다운타임이 생길 수 있다. 중요한 데이터가 쌓이면 PocketBase Dashboard 백업이나 별도 object storage 백업을 추가한다.
