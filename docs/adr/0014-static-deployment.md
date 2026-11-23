# ADR 0014: 정적 HTML 배포

- 상태: 채택
- 날짜: 2026-11-20

## 배경

Structlet은 서버 없이 HTML로만 배포한다. 정적 호스팅(루트나 하위 경로)과 HTML 파일을 더블클릭해 여는 경우(`file://`)를 모두 지원해야 한다. 브라우저는 `file://`에서 외부 모듈 스크립트를 막는다.

## 결정

- 기본 빌드(`npm run build`, `dist/`)는 `base: './'`로 상대 경로를 쓴다. 어느 경로에 올려도 동작하고, compose·Kubernetes 파서는 필요할 때 불러오는 별도 청크다.
- 단일 파일 빌드(`npm run build:single`)는 `vite-plugin-singlefile`로 JS·CSS·지연 청크와 매뉴얼 화면 캡처를 넣은 `dist-single/structlet.html` 하나를 만든다(약 0.9MB). 파비콘도 `data:` URI로 넣었다.
- 개발 서버와 미리보기는 `127.0.0.1`(5183·5184)에서 연다. Google OAuth에 등록하는 origin과 같게 하기 위해서다.
- 웹 배포 빌드에는 CSP를 넣는다(`scripts/csp.ts`). Drive·GA는 설정된 빌드에서만 그 origin을 연다([ADR 0016](0016-google-drive-sync.md), [ADR 0017](0017-usage-statistics.md)). 단일 파일 빌드는 스크립트가 인라인이라 CSP를 넣지 않고, Drive·GA도 꺼진다.
- E2E는 개발 서버가 아니라 프로덕션 빌드를 `vite preview`로 띄워 실행한다. 그래서 CSP를 포함해 배포되는 모습 그대로 검사한다.
- 모든 기능(가져오기, 저장, 내보내기, 아이콘 팩)은 브라우저 안에서만 동작한다. `file://`에서 생길 수 있는 제약은 다음과 같다.
  - 자동 저장과 아이콘 팩 보관은 브라우저의 저장소 정책을 따른다.
  - 같은 파일 덮어쓰기는 API가 없으면 다운로드로 대신한다.

- GitHub Actions의 **CI**는 모든 push·PR에서 검사와 E2E를 돌린다. **Pages**는 수동 실행(`workflow_dispatch`)으로만 배포하고, 전체 검사(`npm run verify`)가 통과해야 배포 job이 실행된다. 빌드 job은 읽기 권한만 갖고, 배포 job만 `pages: write`를 갖는다. 오프라인용 단일 파일도 `/structlet.html`로 함께 올린다([CI와 배포](../ci.md)).

## 결과

`tests/e2e/single-file.spec.ts`가 `file://`로 연 `structlet.html`에서 다음을 확인한다: 샘플, compose 가져오기(지연 청크 포함), SVG·PNG 내보내기, 새로 고침 후 자동 저장 유지, 페이지 오류 없음. `npm run e2e`는 단일 파일을 먼저 빌드한다.
