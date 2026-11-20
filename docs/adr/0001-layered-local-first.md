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
| `adapters` | `.structlet` 형식, 브라우저 저장소, 파일 입출력, SVG/PNG 내보내기, 서비스 카탈로그 | domain, engine, application, `lucide` |
| `components` | 캔버스, 팔레트, 속성 패널. 주입받은 값과 액션으로만 동작 | domain, engine, application, i18n, `react` |
| `app` | 조립, 수명 주기, 자동 저장, 단축키 | 전부 |
| `i18n` | 한국어·영어 메시지 | 없음 |

- domain·application·engine·i18n은 브라우저 전역(`window`, `document`, `localStorage` 등)을 쓰지 않는다. ID는 호출자가 넘긴다(`IdGenerator`).
- 상태를 가진 어댑터(`LocalDocumentStore`)는 `app`에서만 만든다.
- 파일은 400줄을 넘지 않고, 소스에 `console` 출력과 import 순환이 없다.

## 결과

`tests/unit/architecture/layers.test.ts`가 계층 import, 허용 패키지, 순수 계층의 브라우저 전역, 어댑터 생성 위치, 콘솔, 파일 길이, 순환, 한·영 메시지 키 일치를 검사한다. 규칙을 바꾸려면 이 ADR과 그 테스트를 함께 고친다.

테스트는 `tests/unit`(Vitest, 계층별 폴더)과 `tests/e2e`(Playwright, 실제 앱)로 나눈다.
