# ADR 0009: docker-compose, Terraform, Kubernetes 가져오기

- 상태: 채택 (2026-11-20 개정: Kubernetes, Google Cloud·Azure 매핑)
- 날짜: 2026-11-20

## 배경

편집기를 검증한 뒤 설정 파일 파서를 단계적으로 더하기로 했다. 파서마다 따로 배치하지 않도록 모든 입력을 초안([ADR 0008](0008-auto-layout-and-draft-import.md))으로 바꾼 뒤 같은 병합·배치·검증을 거친다.

## 결정

- 입력 종류는 내용으로 고른다.
  - `values`·`planned_values`·`terraform_version`이 있는 JSON은 Terraform이다.
  - 최상위에 `apiVersion`·`kind`가 있으면 Kubernetes다(JSON이든 YAML이든).
  - 그 밖의 JSON은 초안, 나머지 YAML은 compose다.
- **docker-compose**: `yaml` 패키지(ISC)로 읽는다. 이 파서는 compose를 가져올 때만 불러온다(별도 청크). 매핑은 [draft-format.md](../draft-format.md#다른-입력)에 있다. 노드 ID는 `svc-<이름>`이라 같은 파일을 다시 가져오면 기존 객체를 고친다.
- **Terraform**: HCL을 직접 파싱하지 않고 `terraform show -json` 결과를 읽는다. 모듈·변수·참조가 이미 풀려 있기 때문이다.
  - 리소스는 표로 카탈로그 서비스에 짝짓는다: AWS 약 45종(`aws.*`), Google Cloud 약 40종(`gcp.*`), Azure 약 50종(`azure.*`).
  - VPC·서브넷, `google_compute_network`/`subnetwork`, `azurerm_virtual_network`/`subnet`은 중첩 영역이 된다.
  - 리소스가 들어갈 영역은 속성 안의 서브넷·네트워크 참조로 찾는다. 중첩된 `network_interface`·`ip_configuration`·`default_node_pool` 안도 찾는다. 그리지 않는 네트워크 인터페이스는 한 단계 따라간다. Azure 서브넷은 `virtual_network_name`으로 찾는다.
  - 선은 plan의 `configuration` 참조, state의 `depends_on`, 다른 리소스의 ID·ARN을 값으로 가진 속성(중첩 포함)에서 만든다. 이벤트 소스 매핑·구독 같은 연결 리소스는 두 끝 사이의 선이 된다.
  - 노드 ID는 `tf-<주소>`다.

- **Kubernetes**: 여러 문서 YAML, `kubectl get -o yaml|json`의 `List`, `helm template` 결과를 읽는다. 파서는 가져올 때만 불러온다.
  - 클러스터와 네임스페이스는 영역(`cluster`, `namespace`)이 된다.
  - 노드가 되는 것: Deployment·StatefulSet·DaemonSet·Job·CronJob·단독 Pod, Service, Ingress·Gateway·HTTPRoute, ConfigMap·Secret, PVC(StatefulSet의 `volumeClaimTemplates` 포함), HPA. 둘째 줄에 레플리카 수, 스케줄, 서비스 종류, 용량을 쓴다.
  - 선이 되는 것:
    - Ingress 규칙 → Service(호스트+경로 라벨), HTTPRoute → Service
    - Service의 selector가 맞는 워크로드(포트 라벨)
    - 워크로드 → ConfigMap/Secret(볼륨·envFrom·env, 점선), 워크로드 → PVC
    - HPA → 대상(`scales` 점선)
    - Ingress·Gateway·LoadBalancer/NodePort 서비스로 들어오는 "Clients"
  - 컨트롤러가 관리하는 Pod, ReplicaSet, Endpoints, 서비스 계정 토큰과 Helm 릴리스 Secret은 그리지 않는다.
  - ID는 `k8s-<네임스페이스>-<종류>-<이름>`이라 다시 가져오면 기존 객체를 고친다.

## 결과

`tests/unit/adapters/draft.test.ts`는 다음을 검사한다.

- compose: 네트워크 영역, 포트, 볼륨, 환경 변수 연결
- Terraform AWS state: VPC/서브넷 중첩, IAM 제외, 매핑·환경 변수 연결
- Terraform Azure·GCP: 서비스 매핑, 네트워크 중첩, NIC 경유 서브넷
- Kubernetes: 영역, 관계 9종, 관리되는 Pod 제외, JSON List, 다시 가져와도 위치 유지

e2e는 compose와 Kubernetes 가져오기를 확인한다.

HCL 직접 파싱과 Terraform 모듈 경계를 영역으로 그리기는 다루지 않는다.
