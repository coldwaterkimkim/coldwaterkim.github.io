# coldwaterkim.com 배포 메모

## 권장 배포 구조

- `coldwaterkim.com`: GitHub Pages가 정적 프론트엔드를 서빙한다.
- `api.coldwaterkim.com`: VPS의 Nginx가 PocketBase로 프록시한다.
- `/admin/`: GitHub Pages에 올라간 커스텀 CMS 화면이다.
- PocketBase 내장 관리자 UI는 `https://api.coldwaterkim.com/_/`로 접속한다.

이 구조에서는 코드 수정은 GitHub Actions로 자동 반영되고, 글/방명록/미디어 수정은 PocketBase에 저장되는 즉시 공개 사이트에 반영된다.

## 대안: 전체 VPS 배포

전체 사이트를 VPS 하나로 옮기면 다음 구조가 된다.

- Nginx가 `dist/` 정적 파일을 서빙한다.
- `/api/` 요청은 PocketBase `127.0.0.1:8090`으로 프록시한다.
- `/admin/`은 커스텀 CMS 관리자 화면이다.
- `/_/`은 PocketBase 내장 관리자 UI 비상 접속 경로다.

이 경우 `deploy/nginx.conf`를 사용한다. 지금 기본 추천은 GitHub Pages + API 서브도메인이라서, API 서버만 올릴 때는 `deploy/nginx-api-subdomain.conf`를 쓴다.

## 대안: 아이맥 홈서버 배포

아이맥 자체를 서버/DB/파일 저장소로 쓰는 이주 경로는 `deploy/imac/README.md`를 따른다. 이 경로는 GitHub Pages와 Oracle API 서버를 최종적으로 빼고, Caddy + 로컬 PocketBase + `pb_data` 백업으로 운영한다.

## API 서버 파일 배치

```bash
/home/pocketbase/pocketbase
/home/pocketbase/pb_data
```

전체 VPS 배포를 선택한다면 정적 파일은 추가로 `/var/www/coldwaterkim/dist`에 둔다.

## 프론트엔드 배포 흐름

로컬:

```bash
npm run build
```

운영:

```bash
git push origin main
```

GitHub Actions가 `dist/`를 `gh-pages` 브랜치에 배포하고 `coldwaterkim.com` CNAME을 유지한다.

전체 VPS 배포를 직접 할 때만 서버로 rsync한다.

```bash
mkdir -p /var/www/coldwaterkim/dist
rsync -av --delete dist/ root@YOUR_SERVER:/var/www/coldwaterkim/dist/
```

## Nginx

API 서버만 운영할 때:

```bash
cp deploy/nginx-api-subdomain.conf /etc/nginx/sites-available/coldwaterkim-api.conf
ln -s /etc/nginx/sites-available/coldwaterkim-api.conf /etc/nginx/sites-enabled/coldwaterkim-api.conf
nginx -t
systemctl reload nginx
```

전체 VPS 배포를 선택할 때:

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/coldwaterkim.conf
ln -s /etc/nginx/sites-available/coldwaterkim.conf /etc/nginx/sites-enabled/coldwaterkim.conf
nginx -t
systemctl reload nginx
```

## PocketBase

PocketBase 바이너리를 `/home/pocketbase/pocketbase`에 둔다.

```bash
cd /home/pocketbase
./pocketbase serve --http=127.0.0.1:8090 --dir=/home/pocketbase/pb_data --origins=https://coldwaterkim.com,https://www.coldwaterkim.com
```

초기 세팅:

1. `/_/`에서 PocketBase 내장 관리자 접속
2. `pb_schema.json` 기준 컬렉션 생성/가져오기
3. `users` auth collection에 관리자 계정 생성
4. `/admin/`에서 그 계정으로 로그인 테스트

systemd 등록은 `deploy/pocketbase.service`를 참고한다. 운영에서는 `pocketbase` Linux user를 만들어서 root가 아닌 사용자로 실행한다.

## 백업

`deploy/backup.sh`는 `/home/pocketbase/pb_data`를 압축 백업한다.

권장 cron:

```bash
0 3 * * * /home/pocketbase/backup.sh
```
