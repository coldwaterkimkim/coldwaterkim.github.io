# 수동 점검 운영 기록 · 2026-09-16

상태: **ENABLED**. 사용자가 철학서/heritage 정리 시작과 함께 요청했다. 커밋·푸시·배포 후에도 해제하지 않는다.

## 범위와 검증

- 기존 `maintenance.html`을 사용한다. 새 점검 UI는 만들지 않았다.
- 런타임 Caddy의 임시 override로 `/assets/*`, `/favicon.ico`를 제외한 요청을 점검 화면에 연결한다.
- 공개 메인, www, `/album/`, `/posts/check/`, `/api/health`: HTTP 503, `Cache-Control: no-store`, `Retry-After: 300`.
- 점검 CSS/JS/작업자 이미지: HTTP 200. 실제 브라우저에서 공사중 화면을 확인했다.
- 내부 `http://127.0.0.1:8090/api/health`: HTTP 200. PocketBase는 종료하지 않았다. 외부 API도 점검 상태이므로 OWNER/iPhone의 외부 API 작업은 점검 해제 전까지 사용할 수 없다.
- 기존 자동 health 확인은 공개 health의 503 때문에 점검 페이지를 유지한다.
- 전체 DB·미디어 백업은 이 변경의 영향 범위에 해당하지 않는다. 원래 Caddy 설정을 별도 보존했다. 정적 배포는 `dist.previous`로 이전 한 세대를 보존한다.

## 실제 운영 파일

런타임 루트: `/Users/kimchansu/.local/share/coldwaterkim/home-server`

- 활성 설정: `Caddyfile`
- 점검 후보 사본: `Caddyfile.manual-maintenance`
- 정상 설정 롤백: `Caddyfile.before-manual-maintenance-20260916-153713`
- 상태 표시: `MANUAL-MAINTENANCE.md`

저장소 `deploy/imac/Caddyfile`은 정상 서비스 기준으로 유지했다. 배포는 `npm run imac:sync-runtime`(dist만 동기화)을 사용해야 한다. 전체 서비스 재설치로 점검 설정을 덮어쓰지 않는다.

## 해제 절차 — 사용자 재개 요청 후 실행

1. 활성 설정과 `Caddyfile.manual-maintenance`가 일치하는지 먼저 비교한다. 이후 변경이 있으면 무조건 덮어쓰지 않는다.
2. 정상 설정 롤백을 `bin/caddy validate --config <롤백 파일> --adapter caddyfile`로 검증한다.
3. 검증된 정상 설정을 활성 `Caddyfile`로 복원하고 `bin/caddy reload --config <활성 파일> --adapter caddyfile`로 반영한다.
4. 메인/www/대표 콘텐츠/API health의 HTTP 200과 정상 브라우저 화면을 확인한다.
5. 런타임 상태 표시와 STATUS.md, 이 기록의 상태를 DISABLED로 갱신한다.

## 검증 경계

이 문서는 수동 점검 활성화 증거다. 새 Sketchbook + Crayon 홈페이지 구현이나 점검 해제를 뜻하지 않는다. 공사중의 공개 503은 의도된 동작이므로 정상 서비스용 smoke 검사의 기대값 200과 구분한다.
