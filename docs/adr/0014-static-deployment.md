# ADR 0014: 정적 HTML 배포

- 상태: 채택
- 날짜: 2026-11-20

## 배경

Structlet은 서버 없이 HTML로만 배포한다. 정적 호스팅(루트나 하위 경로)과 HTML 파일을 더블클릭해 여는 경우(`file://`)를 모두 지원해야 한다. 브라우저는 `file://`에서 외부 모듈 스크립트를 막는다.

## 결정

- 기본 빌드(`npm run build`, `dist/`)는 `base: './'`로 상대 경로를 쓴다. 어느 경로에 올려도 동작하고, compose·Kubernetes 파서는 필요할 때 불러오는 별도 청크다.
- 단일 파일 빌드(`npm run build:single`)는 `vite-plugin-singlefile`로 JS·CSS·지연 청크를 모두 넣은 `dist-single/structlet.html` 하나를 만든다(약 0.5MB). 파비콘도 `data:` URI로 넣었다.
- 모든 기능(가져오기, 저장, 내보내기, 아이콘 팩)은 브라우저 안에서만 동작한다. `file://`에서 생길 수 있는 제약은 다음과 같다.
  - 자동 저장과 아이콘 팩 보관은 브라우저의 저장소 정책을 따른다.
  - 같은 파일 덮어쓰기는 API가 없으면 다운로드로 대신한다.

## 결과

`tests/e2e/single-file.spec.ts`가 `file://`로 연 `structlet.html`에서 다음을 확인한다: 샘플, compose 가져오기(지연 청크 포함), SVG·PNG 내보내기, 새로 고침 후 자동 저장 유지, 페이지 오류 없음. `npm run e2e`는 단일 파일을 먼저 빌드한다.
