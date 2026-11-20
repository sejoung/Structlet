# Structlet

시스템 구성도를 만들고 다듬는 **로컬 우선 웹 편집기**. 서비스 노드를 놓고, Cloud/Region/VPC/Subnet 같은 영역을 중첩하고, 직교 연결선을 이어 `.structlet` 파일로 저장하고 SVG·PNG로 내보낸다. 좌표 없는 JSON 초안, docker-compose, Kubernetes 매니페스트, `terraform show -json` 결과(AWS·Google Cloud·Azure)를 가져와 자동 배치할 수 있다. 사용자가 받은 공식 아이콘 팩을 불러와 쓸 수 있다. 서버·계정·외부 AI 호출 없이 HTML 하나로도 동작한다.

## 실행

Node.js 20 이상(개발 확인: Node 24, npm 11).

```bash
npm install
npm run dev          # http://localhost:5183
```

| 명령 | 내용 |
| --- | --- |
| `npm run dev` | 개발 서버 (포트 5183) |
| `npm run build` | 타입 검사 + 정적 빌드(`dist/`). 상대 경로라 도메인 루트든 하위 경로든 아무 정적 호스팅에 올리면 된다 |
| `npm run build:single` | HTML 한 파일(`dist-single/structlet.html`, 약 0.5MB). 더블클릭(`file://`)으로 열린다 |
| `npm run preview` | 빌드 결과 미리보기 (포트 5184) |
| `npm test` | 단위 테스트 (Vitest, `tests/unit`) |
| `npm run e2e` | 단일 파일 빌드 후 실제 앱 E2E (Playwright, `tests/e2e`). 처음 한 번 `npx playwright install chromium` |
| `npm run verify` | 타입 검사 → 단위 → 빌드 → E2E 전부 |

처음 열면 빈 캔버스다. 툴바의 **샘플**을 누르면 검증용 구성도(사용자 → DNS → 로드밸런서 → API → DB/캐시/큐 → 워커 → 결제·메일, VPC 안 두 서브넷, 노드 11개·영역 5개·연결 10개)가 열린다. 원본은 `samples/three-tier.structlet`이다.

## 사용법

- **서비스 추가**: 왼쪽 팔레트에서 검색(한국어·영어)해 클릭하거나 캔버스로 끌어 놓는다. 영역 안에 놓으면 그 영역의 자식이 된다. 팔레트는 일반·AWS·Google Cloud·Azure·Kubernetes 묶음으로 나뉜다.
- **아이콘 팩**: 툴바 **아이콘 팩**에서 제공자 공식 아이콘(zip 또는 압축을 푼 폴더)을 불러온다. Structlet은 제공자 아이콘을 포함하지 않는다. 받는 곳: [AWS](https://aws.amazon.com/architecture/icons/), [Google Cloud](https://cloud.google.com/icons), [Azure](https://learn.microsoft.com/azure/architecture/icons/), Kubernetes(kubernetes/community 저장소). 아이콘은 이 브라우저에만 저장되고 화면·SVG·PNG에 쓰인다. `.structlet`에는 서비스 ID만 남아 팩이 없는 사람에게는 일반 기호로 보인다. 팩은 켜고 끄거나 지울 수 있다.
- **영역**: 팔레트의 영역 버튼. 상자를 선택한 상태면 선택한 것을 감싸는 영역을 만든다. 영역을 끌면 안의 모든 것이 따라오고, 노드·영역을 다른 영역 위로 끌어 놓으면 부모가 바뀐다. 모서리 손잡이로 크기를 바꾼다.
- **연결**: 노드에 마우스를 올리면 나타나는 면 손잡이를 다른 객체로 끈다. 두 상자를 선택하고 속성 패널의 **연결 →**도 된다.
- **선 편집**: 선을 선택하고 선분 손잡이(또는 선 자체)를 끌면 경로가 수동이 된다. 끝점 손잡이를 끌어 다른 객체·면에 다시 붙이거나 빈 곳에 놓아 자유 끝점으로 만든다. 속성 패널에서 라벨, 점선, 화살표, 직교/직선, 시작·끝 면, **경로 초기화**.
- **이름 바꾸기**: 더블클릭 또는 Enter/F2. Shift+Enter는 줄바꿈.
- **정렬·간격·자동 배치**: 여러 개를 선택하면 속성 패널에 정렬 6종, 간격 맞춤, 자동 배치(왼→오, 위→아래, 격자)가 나온다. 영역을 선택하면 "안쪽 자동 배치". 고정한 상자와 수동 경로는 그대로 둔다. 끌 때는 다른 객체의 가장자리·가운데에 맞춰지고, 그 외에는 8px 격자에 붙는다(Alt를 누르면 끔).
- **노드 모양**: 속성 패널에서 아이콘형/상자형, 크기 S·M·L.
- **주석**: 텍스트, 흐름 번호, 범례. 범례는 구성도에서 쓰는 역할 색과 선 모양으로 자동으로 채워지고 "다시 만들기"로 갱신한다. 주석을 객체에 붙이면 함께 움직인다.
- **가져오기**: 툴바 **가져오기**로 초안 JSON([형식](docs/draft-format.md), [예시](samples/draft-example.json)), `docker-compose.yml`, Kubernetes 매니페스트(`kubectl get -o yaml|json`, `helm template`), `terraform show -json` 결과를 현재 구성도에 합친다. 기존 객체의 ID·위치·고정은 유지되고 새 객체만 배치된다. 오류가 있으면 아무것도 바뀌지 않는다. 한 번의 실행 취소로 되돌린다. 같은 내용을 붙여넣어도 된다.
- **복사·붙여넣기**: ⌘C/⌘X/⌘V. 영역은 내용과 내부 연결선까지 복사되고, 선택한 영역 안에 붙는다.
- **점검**: 아무것도 선택하지 않으면 속성 패널에 점검 결과(퍼블릭 서브넷의 데이터 저장소, 클라이언트→DB 직접 연결, 모르는 서비스, 연결 없는 서비스, 빈 영역)가 나오고, 누르면 해당 객체를 선택한다.
- **보기**: 스크롤로 이동, ⌘/Ctrl+스크롤로 확대, Space+끌기 또는 가운데 버튼으로 이동, ⌘0 화면 맞춤, 오른쪽 아래 미니맵. 터치는 한 손가락 이동·두 손가락 확대. **아이소메트릭** 보기는 읽기 전용이고, 이 보기에서 SVG·PNG를 내보내면 아이소메트릭 그림이 된다. 테마는 시스템/라이트/다크(내보내기는 항상 라이트).
- **키보드**: 캔버스에서 Tab/Shift+Tab으로 객체 사이를 옮기고, 선택한 객체는 화면 낭독기가 읽는다.

| 단축키 | 동작 |
| --- | --- |
| ⌘/Ctrl+Z, ⇧⌘Z / Ctrl+Y | 실행 취소, 다시 실행 |
| ⌘S, ⇧⌘S, ⌘O | 저장, 다른 이름으로 저장, 열기 |
| ⌘C, ⌘X, ⌘V | 복사, 잘라내기, 붙여넣기 |
| ⌘D, Delete/Backspace | 복제, 삭제 |
| ⌘A, Esc | 전체 선택, 선택 해제 |
| 화살표, ⇧+화살표 | 1px, 8px 이동 |
| Alt+영역 끌기 | 영역 위에서 범위 선택 |

변경은 이 브라우저의 `localStorage`에 자동 저장되고 새로 고침해도 남는다. 파일로 보관하려면 **저장**한다. Chrome·Edge처럼 File System Access API가 있는 브라우저에서는 연 파일에 바로 덮어쓰고, 없는 브라우저에서는 다운로드한다.

## 구조

```text
src/
  domain/       문서·노드·영역·연결선·주석 모델, 계층, 명령, 패치, 검증   (의존 없음)
  application/  편집 세션(미리보기·undo/redo·선택), 편집 유스케이스        (domain)
  engine/       월드 좌표, 장면, 포트·라우팅, 자동 배치, 스냅·정렬, 히트, SVG·아이소메트릭 마크업  (domain)
  adapters/     .structlet 형식, 초안·compose·Kubernetes·Terraform 가져오기, 자동 저장, 파일 입출력, SVG/PNG,
                제공자별 카탈로그·아이콘 팩·범례·점검
  components/   캔버스, 팔레트, 속성 패널, 툴바
  app/          조립, 자동 저장, 단축키
  i18n/         한국어·영어 메시지
tests/
  unit/         domain · application · engine · adapters · architecture (Vitest)
  e2e/          실제 앱을 띄워 검증 (Playwright)
samples/        샘플 .structlet, 초안 JSON 예시
docs/draft-format.md  초안 JSON 형식
docs/adr/       설계 기록. stormlet-reference/ 에 참고한 Stormlet ADR 원본
```

계층 규칙은 `tests/unit/architecture/layers.test.ts`가 강제한다. 결정 배경은 [docs/adr](docs/adr/README.md)에 있다.

- 모델: 노드·영역은 명시적 `parentId`와 부모 기준 로컬 좌표로 저장한다. 순환은 거부한다([ADR 0002](docs/adr/0002-service-nodes-and-explicit-areas.md)).
- 연결선: 자동 경로는 저장하지 않고 매번 계산하며(장애물 회피 A*), 사용자가 고친 경로만 꺾임점으로 저장한다([ADR 0003](docs/adr/0003-edge-routing-and-manual-waypoints.md)).
- 파일: 버전 있는 JSON, 열 때 크기·유한 좌표·참조·순환·버전을 검증한다. 실패하면 열린 문서를 바꾸지 않는다([ADR 0004](docs/adr/0004-structlet-file-format.md)).
- 화면과 내보내기는 같은 장면과 같은 SVG 렌더러를 쓴다([ADR 0005](docs/adr/0005-one-renderer-for-canvas-and-export.md)).
- 서비스 정의(카탈로그)와 모양(아이콘 팩)을 나눈다. 공식 아이콘은 사용자가 불러온다([ADR 0006](docs/adr/0006-service-catalog-and-icons.md), [ADR 0013](docs/adr/0013-icon-packs.md)).
- 배포는 정적 사이트 또는 HTML 한 파일이다([ADR 0014](docs/adr/0014-static-deployment.md)).

## 검증 현황

- **단위 96개** (`tests/unit`)
  - domain: 계층·로컬 좌표·자식 동반 이동, 부모 변경·순환 거부, 패치 undo(인접 삭제 순서 포함), 조각 복사·붙여넣기, 문서 차이
  - application: 세션의 미리보기·한 번의 커밋·입력 합치기
  - engine:
    - 경로: 기본 모양, 장애물 우회, 수동 경로 재현과 이동 후 유지, 수동 구간 우회, 붐비는 면 피하기, 포트 분산, 라벨 겹침 회피
    - 배치: 층 순서, 교차 줄이기, 선택 배치의 고정 유지
    - 렌더링: 상자 노드, 범례 견본, 다크 테마, 아이소메트릭
    - 성능: 노드 400·선 300
  - adapters:
    - 파일: 왕복, 12가지 잘못된 입력 거부
    - 초안: 빈 문서 배치, 부분 수정(ID·위치·고정 유지), 오류 4종 거부, 문서화된 예시
    - compose, Kubernetes, Terraform(AWS·Azure·GCP) 변환
    - 아이콘 팩: 제공자별 짝짓기, 자동 감지, zip, 한도, 렌더링
    - SVG가 캔버스와 같은 경로·라벨인지, 점검, 범례, 같은 파일에 저장
  - architecture: 계층 규칙
- **E2E 20개** (`tests/e2e`)
  - 기본 흐름: 노드 두 개 → 연결 → 저장 → 열기 → 새로 고침 → SVG(화면과 같은 경로), PNG, 잘못된 파일 거부
  - 영역: VPC 끌기 후 한 번의 undo, 다른 영역으로 끌어 넣기, 감싸기
  - 연결선: 수동 경로 유지·초기화, 끝점 재부착
  - 편집: 한국어 긴 이름 편집, 자동 배치 undo, 복사·붙여넣기
  - 가져오기: 초안 부분 수정과 오류 거부, compose
  - 아이콘 팩: AWS zip 팩(캔버스·영역·팔레트·내보내기·새로 고침 후 유지·끄기), Kubernetes 아이콘 폴더 + 매니페스트 가져오기
  - 보기: 아이소메트릭 보기·내보내기, 다크 테마·상자 노드·범례·점검·미니맵·Tab 이동, 터치 이동·확대
  - 배포: `file://`로 연 단일 HTML(가져오기, 내보내기, 자동 저장)

## 범위

시작 요구사항의 첫 버전 1–7과 구현 순서 1–5를 모두 구현했다. 후속 검토 항목 중 로컬에서 가능한 것도 넣었다: 아이소메트릭 보기, Terraform/Compose/Kubernetes 가져오기, 보안 성격의 구성 점검. 추가로 다음을 넣었다: 아이콘 팩, 클립보드, 같은 파일에 저장, 미니맵, 다크 모드, 터치, 키보드 탐색, 상자형 노드, 범례 자동 생성, 단일 HTML 배포.

**하지 않은 것과 이유**

| 항목 | 이유 |
| --- | --- |
| 공식 아이콘 포함 | 제공자 조건상 번들링은 별도 허가가 권장된다. 사용자가 직접 받은 팩을 불러오는 방식으로 대신했다([ADR 0013](docs/adr/0013-icon-packs.md)). 유료로 제공하기 전에는 조건을 다시 확인한다 |
| 클라우드 계정 연동, 비용 분석 | 자격 증명·외부 API·가격 데이터가 필요하다. 외부 호출 없이 동작한다는 로컬 우선 원칙과 맞지 않는다. 계정 상태는 `terraform show -json`이나 `kubectl get -o yaml`로 가져올 수 있다 |
| 실시간 협업 | 동기화 서버나 P2P 계층이 필요하다. 문서 모델(객체 단위 패치)은 병합하기 쉬운 형태로 두었다 |
| 이름·도메인·상표 확인 | 법률 검토 사항이라 코드로 처리할 수 없다 |
| 선 묶기 | 포트 분산·차선 분리로 선마다 출발·도착을 구분하는 방식을 택했다([ADR 0003](docs/adr/0003-edge-routing-and-manual-waypoints.md)) |
| HCL 직접 파싱 | Terraform은 `terraform show -json`을 쓴다 |

## 상표

AWS, Amazon Web Services 및 AWS 서비스 이름은 Amazon.com, Inc. 또는 계열사의 상표다. Google Cloud는 Google LLC의 상표다. Microsoft Azure는 Microsoft 그룹의 상표다. Kubernetes는 The Linux Foundation의 등록 상표다. Structlet은 이들과 제휴하거나 보증받지 않았다. 서비스 이름은 구성 요소를 가리키는 글자로만 쓴다.

## 라이선스

Apache-2.0. 기호는 Lucide(ISC, 일부 Feather MIT), YAML 파서는 yaml(ISC), zip 읽기는 fflate(MIT) — [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
