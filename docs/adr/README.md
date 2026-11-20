# 설계 기록 (ADR)

Structlet의 구조와 동작에 대한 결정이다. 결정을 바꾸면 해당 ADR과 이를 강제하는 테스트를 함께 고친다.

| 번호 | 제목 | 상태 |
| --- | --- | --- |
| [0001](0001-layered-local-first.md) | 로컬 우선 계층 구조 | 채택 |
| [0002](0002-service-nodes-and-explicit-areas.md) | 서비스 노드와 명시적 영역 계층 | 채택 |
| [0003](0003-edge-routing-and-manual-waypoints.md) | 연결선: 직교 자동 경로와 수동 꺾임점 | 채택 |
| [0004](0004-structlet-file-format.md) | `.structlet` 파일 형식과 가져오기 검증 | 채택 |
| [0005](0005-one-renderer-for-canvas-and-export.md) | 캔버스와 내보내기가 같은 렌더러를 쓴다 | 채택 |
| [0006](0006-service-catalog-and-icons.md) | 서비스 카탈로그와 아이콘 | 채택 (개정) |
| [0007](0007-editing-session-and-undo.md) | 편집 세션, 미리보기, 실행 취소 | 채택 |
| [0008](0008-auto-layout-and-draft-import.md) | 자동 배치와 초안 가져오기 | 채택 |
| [0009](0009-compose-and-terraform-import.md) | docker-compose, Terraform, Kubernetes 가져오기 | 채택 (개정) |
| [0010](0010-clipboard-and-file-access.md) | 클립보드와 같은 파일에 저장 | 채택 |
| [0011](0011-views-themes-and-accessibility.md) | 보기, 테마, 접근성 | 채택 |
| [0012](0012-local-architecture-checks.md) | 로컬 구성 점검 | 채택 |
| [0013](0013-icon-packs.md) | 사용자가 불러오는 아이콘 팩 | 채택 |
| [0014](0014-static-deployment.md) | 정적 HTML 배포 | 채택 |
| [0015](0015-editor-layout.md) | 편집기 화면 구성 | 채택 |

[stormlet-reference/](stormlet-reference/)에는 시작할 때 참고한 Stormlet ADR 원본을 따로 보관한다.

## 출발점

Structlet은 시스템 구성도를 만들고 다듬는 로컬 우선 웹 편집기다. 시작 패키지(Stormlet과 분리된 별도 제품, React + TypeScript + Vite, AWS 문서풍 2D 구성도, Cloudcraft식 서비스 중심 표현)의 요구사항은 아래 ADR과 루트 [README](../../README.md)의 "범위" 절로 옮겼다.
