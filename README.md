# coldwaterkim.com — retro v1

진짜 90s/아날로그 감성의 정적 사이트. (테이블 레이아웃, 마퀴, 깜박임, 로컬 게스트북)

## 로컬에서 미리보기
파일을 더블클릭하여 브라우저로 여세요. (정적 HTML)

## 글 발행
- `posts/template.html` 복사 → 파일명 `posts/yyyymmdd-slug.html`
- `posts/index.html` 목록에 링크 1줄 추가

## GitHub Pages 배포
1. 새 레포 생성: `coldwaterkim.github.io` (또는 아무 레포 + Pages 설정)
2. 위 파일 그대로 업로드 (루트에 `CNAME` 포함)
3. Settings → Pages → Branch: `main` 선택 → Save
4. 커스텀 도메인에 `coldwaterkim.com` 입력 → 저장
5. 도메인 DNS에 CNAME 레코드 설정: `coldwaterkim.com` → `username.github.io`

## Vercel 배포 (선택)
1. Vercel에서 New Project → GitHub 레포 임포트
2. Framework: `Other` (정적) → Build/Output 설정 없이 배포
3. Domains → `coldwaterkim.com` 추가
