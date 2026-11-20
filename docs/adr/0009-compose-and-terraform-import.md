# ADR 0009: docker-compose와 Terraform 가져오기

- 상태: 채택
- 날짜: 2026-11-20

## 배경

편집기를 검증한 뒤 설정 파일 파서를 단계적으로 더하기로 했다. 파서마다 따로 배치하지 않도록 모든 입력을 초안([ADR 0008](0008-auto-layout-and-draft-import.md))으로 바꾼 뒤 같은 병합·배치·검증을 거친다.

## 결정

- 입력 종류는 내용으로 고른다. `values`·`planned_values`·`terraform_version`이 있는 JSON은 Terraform, 그 밖의 JSON은 초안, 나머지는 YAML(compose)이다.
- **docker-compose**: `yaml` 패키지(ISC)로 읽는다. 이 파서는 compose를 가져올 때만 불러온다(별도 청크). 매핑은 [draft-format.md](../draft-format.md#다른-입력)에 있다. 노드 ID는 `svc-<이름>`이라 같은 파일을 다시 가져오면 기존 객체를 고친다.
- **Terraform**: HCL을 직접 파싱하지 않고 `terraform show -json` 결과를 읽는다. 모듈·변수·참조가 이미 풀려 있기 때문이다.
  - AWS 리소스 약 45종은 AWS 서비스로, Google·Azure는 이름 규칙으로 일반 서비스로 바꾼다.
  - VPC·서브넷·가상 네트워크는 중첩 영역이 된다. 리소스는 `subnet_id(s)`·`vpc_id`로 영역에 들어간다.
  - 선은 plan의 `configuration` 참조, state의 `depends_on`, 다른 리소스의 ID·ARN을 값으로 가진 속성(중첩 포함)에서 만든다. 이벤트 소스 매핑·구독 같은 연결 리소스는 두 끝 사이의 선이 된다.
  - 노드 ID는 `tf-<주소>`다.

## 결과

`tests/unit/adapters/draft.test.ts`가 compose(네트워크 영역, 포트, 볼륨, 환경 변수 연결)와 Terraform state(VPC/서브넷 중첩, IAM 제외, 매핑·환경 변수 연결)를 검사한다. e2e는 compose 파일 가져오기를 확인한다.

Kubernetes 매니페스트, HCL 직접 파싱, Terraform 모듈 경계를 영역으로 그리기는 다루지 않는다.
