# CI와 Pages 배포

## 워크플로

| 워크플로 | 언제 | 하는 일 |
| --- | --- | --- |
| **CI** (`.github/workflows/ci.yml`) | 모든 push와 pull request | 두 job이 나란히 돈다. `checks`: 타입 검사, 린트(oxlint), 의존성 규칙(dependency-cruiser), 단위 테스트, 웹 빌드, 단일 파일 빌드(`npm run check`). `e2e`: 단일 파일 빌드 후 Playwright E2E(`npm run e2e`). 같은 브랜치에 새 push가 오면 이전 실행은 취소된다 |
| **Pages** (`.github/workflows/pages.yml`) | **수동**: Actions 탭 → Pages → Run workflow | 저장소 변수로 빌드하고 `npm run verify`(위 검사 전부 + E2E)가 모두 통과해야 배포한다. 오프라인용 `structlet.html`(단일 파일)도 함께 올린다 |

E2E는 프로덕션 빌드 두 벌(기본, 테스트 GA 측정 ID)을 `vite preview`로 띄워 실행한다. Google 로그인·Picker·Drive API·GA 스크립트는 테스트 안에서 흉내 내므로 실제 Google에 닿지 않는다. 실패하면 `test-results/`가 artifact(3일 보관)로 남는다.

브라우저 job은 공식 Playwright 컨테이너(`mcr.microsoft.com/playwright:v1.65.1-noble`)를 써서 매번 브라우저와 OS 패키지를 설치하지 않는다. Playwright를 올릴 때는 두 워크플로의 이미지 태그를 `package-lock.json`의 버전에 맞춘다. `scripts/check-playwright-image.mjs`가 어긋나면 테스트 전에 실패시킨다. Node 버전은 `.nvmrc`(24)를 따른다.

## 처음 한 번 설정

1. **Pages 소스**: 저장소 Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 둔다.
2. **변수**: Settings → Secrets and variables → Actions → **Variables** 탭에 다음을 넣는다. 모두 번들에 들어가는 공개 값이라 Secrets가 아니라 Variables를 쓴다. 값이 없으면 그 기능 없이 배포된다(워크플로가 경고를 남긴다).

   | 변수 | 내용 |
   | --- | --- |
   | `VITE_GOOGLE_CLIENT_ID` | OAuth 클라이언트 ID |
   | `VITE_GOOGLE_API_KEY` | Picker용 API 키 |
   | `VITE_GOOGLE_APP_ID` | Google Cloud 프로젝트 번호 |
   | `VITE_GA_MEASUREMENT_ID` | GA4 측정 ID(선택) |

3. **Google 쪽 등록**([docs/google-drive.md](google-drive.md)): 배포 주소의 origin을 OAuth 클라이언트의 승인된 JavaScript 원본에, `origin/*`를 API 키의 웹사이트 제한에 추가한다.
   - 기본 Pages 주소는 `https://sejoung.github.io/Structlet/`이고, 등록할 origin은 **`https://sejoung.github.io`**(경로 없이)다.
4. **배포**: Actions 탭 → **Pages** → **Run workflow**. 배포가 끝나면 실행 요약과 `github-pages` 환경에 주소가 표시된다.

## 배포 주소와 origin

`https://sejoung.github.io/Structlet/`은 같은 계정의 다른 프로젝트 페이지(예: `/Stormlet/`)와 **origin이 같다**. 브라우저는 localStorage·IndexedDB·Drive 토큰 채널을 origin 단위로 나누므로, 같은 origin의 다른 페이지가 Structlet의 저장 정보와 Drive 토큰 채널에 접근할 수 있다([google-drive.md](google-drive.md#배포)).

Drive를 켜서 배포한다면 **사용자 지정 도메인**을 권한다. Settings → Pages → Custom domain에 `structlet.<도메인>`을 넣고 DNS에 `sejoung.github.io`를 가리키는 CNAME을 추가한다. 그다음 Google 쪽 origin도 그 도메인으로 등록한다. 빌드는 상대 경로라 어느 주소에서든 그대로 동작한다.

## 로컬에서 같은 검사

```bash
npm run check     # CI의 checks job
npm run e2e       # CI의 e2e job (처음 한 번 npx playwright install chromium)
npm run verify    # Pages가 배포 전에 돌리는 전부
CI=true npm run verify   # CI 설정(forbidOnly, workers 2, github reporter)으로
```
