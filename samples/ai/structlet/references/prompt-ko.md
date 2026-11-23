# 편집 가능한 Structlet 구성도 만들기

아래 요구사항이나 제공한 프로젝트 자료를 읽고 엄격한 JSON으로 `structlet-draft` 버전 1 초안을 만들어 주세요. Structlet이 이 초안을 검증하고 새 객체를 자동 배치한 뒤 편집 가능한 `.structlet` 파일로 저장합니다.

## 초안 작성 규칙

- `title`, `layout`(`flow`, `flow-down`, `grid`)과 필요한 `containers`, `nodes`, `edges`, `annotations` 배열을 사용하세요.
- 클라우드, VPC, 서브넷, 클러스터, 네임스페이스처럼 실제 경계를 영역으로 표현하세요. 영역 종류에는 `cloud`, `account`, `region`, `availability-zone`, `vpc`, `subnet`, `cluster`, `namespace`, `custom`이 있습니다. 영역과 노드는 `parent`로 묶고 최상위 객체는 생략해도 됩니다.
- ID는 영문자·숫자·밑줄·점·콜론·하이픈으로 만들고, 각 객체에 고유한 ID를 부여하세요. `parent`, `from`, `to`, `target`에는 실제로 정의된 ID를 쓰세요. 자동 배치를 위해 좌표를 생략하세요.
- 노드는 `service`로 아이콘을 지정하고 `label`에 짧은 이름을 쓰세요. 지원하는 ID 예시는 `user`, `server`, `database`, `cache`, `aws.ec2`, `aws.elb`, `aws.rds`, `aws.sqs`, `aws.s3`, `gcp.compute-engine`, `azure.vm`, `k8s.deployment`, `nvidia.gpu`, `nvidia.mig`, `nvidia.nvlink-switch`입니다. 정확한 아이콘을 모르면 역할에 맞는 일반 서비스 ID를 사용하세요.
- ECR, DocumentDB, MSK, Systems Manager, ACM, VPC 엔드포인트에는 각각 `aws.ecr`, `aws.documentdb`, `aws.msk`, `aws.systems-manager`, `aws.acm`, `aws.vpc-endpoint`를 쓰세요. 표준 서비스 ID를 쓰면 사용자가 불러온 아이콘 팩의 공식 이미지가 연결됩니다.
- 확인된 장비 사양은 `specs.instanceType`, `specs.vcpus`, `specs.memoryGiB`, `specs.gpu`, `specs.diskGiB`에 적으세요. vCPU, 메모리, 시스템 디스크는 양수로 입력하세요. 2D에서 상세 사양을 바로 표시하려면 `specs.showDetails: true`를 쓰세요. 확인하지 못한 값과 자격 증명은 생략하세요.
- 연결선은 `from`, `to`, 선택 사항인 `label`로 표현하세요. 실제 호출·의존 방향을 사용하세요. 비동기 연결은 `dashed: true`, NVLink 패브릭처럼 방향이 없는 연결은 `arrow: "none"`으로 지정하세요. 두 대상 사이에 별도 연결이 여러 개면 각각 ID를 지정하세요.
- 설명이나 흐름 번호는 `annotations`에 적으세요. 각 항목에는 `id`, `kind`(`text`, `step`, `legend`), `text`가 들어가고, 필요하면 `target`으로 객체에 붙일 수 있습니다.
- 기존 `.structlet` 파일을 수정할 때는 원래 ID와 요청된 변경만 담은 초안을 만들고, 그대로 둘 필드는 생략하세요. 명시적으로 요청된 삭제만 `remove`에 적으세요.

## 예시

```json
{
  "format": "structlet-draft",
  "formatVersion": 1,
  "title": "주문 API",
  "layout": "flow",
  "containers": [{ "id": "private", "kind": "subnet", "label": "프라이빗 서브넷" }],
  "nodes": [
    { "id": "customer", "service": "user", "label": "고객" },
    { "id": "api", "service": "aws.ec2", "parent": "private", "label": "주문 API", "specs": { "instanceType": "t4g.small", "vcpus": 2, "memoryGiB": 2, "showDetails": true } }
  ],
  "edges": [{ "from": "customer", "to": "api", "label": "HTTPS" }]
}
```

구성도 라벨은 요청에 사용한 언어로 작성하세요. 파일을 만들 수 있으면 `architecture.draft.json`으로 저장해 주세요. 그 외에는 순수 JSON 객체 하나를 반환해 주세요.

## 만들고 싶은 구성도

이 줄을 요구사항, 실제 서비스 연결, 그림 또는 관련 프로젝트 자료로 바꿔 주세요.
