# Stormlet 참고 ADR

Structlet을 시작할 때 참고한 Stormlet의 설계 기록 원본이다. Stormlet의 과거 결정이며 Structlet의 요구사항이 아니다. 본문의 링크(ADR 0002, 0008, 0009, 0017 등)는 Stormlet 레포 기준이라 여기서는 열리지 않는다.

| 파일 | 내용 | Structlet에서 쓴 방식 |
| --- | --- | --- |
| [0001-layered-local-first.md](0001-layered-local-first.md) | 로컬 우선 계층 구조, 테스트로 강제하는 의존 규칙 | 원리만 가져와 [ADR 0001](../0001-layered-local-first.md)로 다시 정함 |
| [0018-architecture-diagrams.md](0018-architecture-diagrams.md) | 메모 아이콘, 겹친 프레임, 흐름 배치 | 포스트잇·프레임 모델은 버리고 서비스 노드·명시적 영역 계층으로 대체([ADR 0002](../0002-service-nodes-and-explicit-areas.md)) |
| [0019-diagram-polish.md](0019-diagram-polish.md) | 연결점 분산, 장애물 회피, 단어 단위 줄바꿈 | 포트 분산·A* 회피·keep-all 줄바꿈 원리를 새로 구현([ADR 0003](../0003-edge-routing-and-manual-waypoints.md)) |
