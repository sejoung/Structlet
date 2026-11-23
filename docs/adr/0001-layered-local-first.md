# ADR 0001: 로컬 우선 계층 구조

- 상태: 채택
- 날짜: 2026-11-20

## 배경

Structlet은 서버 없이 정적 호스팅으로 동작한다. 문서는 사용자의 `.structlet` 파일과 브라우저 저장소에만 있다. 외부 AI 호출이나 API 키 없이도 모든 기능을 쓸 수 있어야 한다. 기능이 늘어도 구조를 지키도록 Stormlet의 방식([참고](stormlet-reference/0001-layered-local-first.md))대로 계층 규칙을 테스트로 강제한다. 다만 규칙 표와 검사는 Structlet 구조에 맞게 새로 만든다.

## 결정

의존 방향은 `domain ← application / engine / adapters ← components ← app`이고, `i18n`은 어디에도 의존하지 않는다.

| 계층 | 책임 | 쓸 수 있는 것 |
| --- | --- | --- |
| `domain` | 문서·노드·영역·연결선·주석 모델, 계층 계산, 명령, 패치, 검증 | domain |
| `application` | 편집 세션, 선택, undo/redo, 편집 유스케이스, 저장소 포트 | domain |
| `engine` | 월드 좌표, 장면 계산, 포트, 라우팅, 스냅, 정렬, 히트 테스트, SVG 마크업 | domain |
| `adapters` | `.structlet` 형식, 브라우저 저장소, 파일 입출력, SVG/PNG 내보내기, 서비스 카탈로그, Google Drive, 사용 통계 | domain, engine, application, `lucide`, `yaml`, `fflate` |
| `components` | 위 막대, 사이드바, 캔버스, 인스펙터. 주입받은 값과 액션으로만 동작 | domain, engine, application, i18n, `react`, `lucide`(화면 아이콘 데이터) |
| `app` | 조립, 수명 주기, 자동 저장, 단축키 | 전부 |
| `i18n` | 한국어·영어 메시지 | 없음 |

- domain·application·engine·i18n은 브라우저 전역(`window`, `document`, `localStorage` 등)을 쓰지 않는다. ID는 호출자가 넘긴다(`IdGenerator`).
- 상태를 가진 어댑터(`LocalDocumentStore`)는 `app`에서만 만든다.
- 파일은 400줄을 넘지 않고, 소스에 `console` 출력과 import 순환이 없다.

## 결과

규칙은 세 도구로 나눠 검사하고, 모두 `npm run check`(CI의 `checks` job)에 들어 있다.

| 검사 | 도구 | 파일 |
| --- | --- | --- |
| 계층 import 방향, 계층별 허용 패키지, `src` 밖 import(`app`의 `samples/`만 허용), Node 내장 모듈과 devDependencies 금지, 순환, 풀리지 않는 import, package.json에 없는 패키지 | dependency-cruiser (`npm run deps`) | `.dependency-cruiser.cjs` |
| 파일 400줄 이하, `src`의 `console` 금지, 정확성 규칙 | oxlint (`npm run lint`) | `.oxlintrc.json` |
| 코드 주석 금지 | `npm run lint` | `scripts/check-comments.mjs` |
| 모든 파일이 알려진 계층에 속함, 순수 계층의 브라우저 전역, 어댑터 생성 위치, 한·영 메시지 키 일치 | Vitest | `tests/unit/architecture/layers.test.ts` |

규칙을 바꾸려면 이 ADR과 해당 파일을 함께 고친다. 계층 표는 `.dependency-cruiser.cjs`의 `LAYERS`·`PACKAGES`와 같아야 한다.

- `virtual:structlet-skill`은 Vite가 생성하는 스킬 ZIP 데이터다. 이 가상 모듈의 해석은 웹과 단일 HTML 빌드에서 검사하고, 소스 파일 의존성 검사에서는 이 이름만 제외한다.
- 처음에는 정규식으로 import를 읽는 테스트 하나가 전부 검사했다. 실제 모듈 해석(확장자, `exports`, 타입 전용 import)을 하는 dependency-cruiser로 옮겨, 풀리지 않는 import와 선언하지 않은 패키지까지 잡는다. 파일 길이와 `console`은 편집기에서 바로 보이도록 린트로 옮겼다.
- TypeScript 7.0에는 JavaScript API가 없어 typescript-eslint와 dependency-cruiser의 tsc 파서를 쓸 수 없다. 그래서 린트는 TypeScript에 기대지 않는 oxlint를, dependency-cruiser는 swc 파서를 쓴다. 실행할 때 나오는 `missing-tsc-transpiler` 경고는 이 때문이고, swc가 모든 소스를 읽는다(파일 수로 확인). dependency-cruiser가 Node 22 이상을 요구해 `engines`도 22 이상으로 올렸다.
- oxlint의 React 규칙(`react`, `react-hooks`)은 켜지 않았다. 켜면 기존 코드에서 렌더 중 ref 읽기 등 24건이 나와 별도 작업으로 다룬다.

테스트는 `tests/unit`(Vitest, 계층별 폴더)과 `tests/e2e`(Playwright, 실제 앱)로 나눈다.
