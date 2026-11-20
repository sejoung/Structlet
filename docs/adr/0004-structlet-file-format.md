# ADR 0004: `.structlet` 파일 형식과 가져오기 검증

- 상태: 채택
- 날짜: 2026-11-20

## 배경

문서는 사용자의 파일과 브라우저에만 있으므로 형식이 곧 데이터 계약이다. Stormlet 파일과 하위 호환할 필요는 없다(샘플 `.stormlet`은 그대로 읽지 않는다). 잘못된 입력이 열린 문서를 망가뜨리면 안 된다.

## 결정

- 확장자 `.structlet`, MIME `application/vnd.structlet+json`, 2칸 들여쓴 JSON. 최상위는 `format: "structlet"`, `formatVersion: 1`, `id`, `title`, `containers`, `nodes`, `edges`, `annotations`.
- 저장 문서는 모든 위치가 확정된 상태다. 자동 경로는 저장하지 않고, `routingMode: "manual"`일 때만 `waypoints`를 쓴다(읽을 때도 auto의 꺾임점은 버린다).
- 읽기(`parseStructlet`)는 예외를 던지지 않고 `{ ok, document | errors }`를 돌려준다. 순서대로 검사한다.
  1. 크기 5MB 이하, JSON 문법
  2. `format`과 버전(새 버전은 "더 새로운 파일" 오류)
  3. 필드 형태: 타입, 유한한 숫자, 허용 값(종류·면·화살표 등), ID 문자(`[A-Za-z0-9_.:-]`), 글자 수, 배열 길이
  4. domain `validateDocument`: ID 중복, 부모·끝점·주석 대상 참조, 부모 순환, 좌표 범위(±1,000,000), 양수 크기, offset 0..1, 객체 수(5,000)
- 생략 가능한 필드는 기본값을 쓴다(`locked: false`, 영역 종류의 기본 스타일, 빈 라벨 등). 모르는 필드는 무시한다. 모르는 `serviceId`는 보존한다.
- 쓰기(`serializeStructlet`)는 필드 순서가 고정이라 같은 문서는 같은 텍스트가 된다.
- 브라우저 자동 저장도 같은 형식으로 `localStorage`의 `structlet:autosave:v1`에 400ms 디바운스로 쓴다. 검증에 실패한 사본은 무시한다.

## 결과

`tests/unit/adapters/format.test.ts`가 노드 두 개·연결 왕복, 중첩 영역·수동 경로·주석 왕복, 출력 안정성, 12가지 잘못된 입력 거부, 모르는 서비스 보존, 자동 저장을 검사한다. e2e는 저장 → 새로 만들기 → 열기 → 새로 고침 후 같은 ID·위치·관계, 순환 파일을 열어도 기존 문서 유지를 확인한다.

노드의 `variant`는 v1에 추가한 선택 필드다(없으면 `icon`). 좌표 없는 초안과 부분 수정은 별도 형식(`structlet-draft`, [ADR 0008](0008-auto-layout-and-draft-import.md))으로 받는다. 버전을 올릴 때는 이전 버전 변환기를 adapters에 둔다.
