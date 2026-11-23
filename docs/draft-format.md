# 초안 JSON 형식 (`structlet-draft`)

사람, 스크립트, AI 도우미가 좌표 없이 구성도를 쓰거나 기존 구성도를 고칠 때 쓰는 입력이다. 툴바 **가져오기**(또는 붙여넣기)로 현재 구성도에 합친다. 외부 AI 호출 없이 파일만으로 동작한다. 예시: [`samples/draft-example.json`](../samples/draft-example.json).

## 규칙

- 모든 필드는 생략할 수 있다. 생략한 값은 **현재 값을 유지**하고, 새 객체는 기본값을 쓴다.
- `id`가 현재 문서에 있으면 그 객체를 고치고, 없으면 새로 만든다. ID는 `[A-Za-z0-9_.:-]`만 쓴다.
- 좌표(`x`, `y`)는 부모 영역 기준이다. **좌표가 없는 새 객체만 자동 배치**된다. 기존 객체는 좌표를 주지 않으면 그 자리에 있다. 고정(`locked`)된 객체는 좌표를 줘도 움직이지 않는다.
- 연결선은 `id`가 있으면 그 선을, 없으면 같은 `from → to` 선을 고친다. 둘 다 없으면 새 선(`e-<from>-<to>`)을 만든다.
- `remove`에 적은 ID는 지운다. 영역을 지우면 내용과 거기 붙은 선도 지워진다.
- 하나라도 잘못되면(모르는 참조, 부모 순환, 종류 충돌, 잘못된 값) 아무것도 바뀌지 않고 오류만 보인다. 가져오기는 한 번의 실행 취소로 되돌린다.

## 필드

| 위치 | 필드 |
| --- | --- |
| 최상위 | `format: "structlet-draft"`, `formatVersion: 1`, `title`, `layout`(`flow` 왼→오, `flow-down` 위→아래, `grid`), `containers`, `nodes`, `edges`, `annotations`, `remove` |
| `containers[]` | `id`, `kind`(cloud, account, region, availability-zone, vpc, subnet, custom), `label`, `parent`, `layout`, `x`, `y`, `width`, `height`, `color`(gray, teal, purple, green, blue, orange, pink, red), `dashed`, `filled`, `locked` |
| `nodes[]` | `id`, `service`(서비스 ID, 예: `database`, `aws.lambda`; 모르는 ID는 일반 아이콘으로 보존), `label`(`\n`으로 줄바꿈: 첫 줄은 역할, 둘째 줄은 기술), `parent`, `x`, `y`, `variant`(`icon`, `box`), `size`(`s`, `m`, `l`), `locked`, `specs`, `infrastructure` |
| `nodes[].specs` | `instanceType`, `vcpus`, `memoryGiB`, `gpu`, `diskGiB`(시스템 디스크), `showDetails`(2D에서 상세 사양 표시) |
| `edges[]` | `id`, `from`, `to`, `label`, `dashed`(점선), `relationship`(설정 관계), `arrow`(end, start, both, none), `shape`(orthogonal, straight) |
| `annotations[]` | `id`, `kind`(text, step, legend), `text`, `x`, `y`(월드 좌표), `target`(붙을 객체). 좌표 없는 새 주석은 실제 텍스트 높이를 계산해 대상 옆 빈 공간이나 구성도 아래에 배치한다. |

범례 `text`의 줄은 `#rrggbb 이름`(색 견본), `--- 이름`(실선 견본), `- - 이름`(점선 견본)으로 시작할 수 있다.

`specs: null`은 노드의 사양을 지운다. 인스턴스 타입이 바뀌면 새 입력에서 제공한 CPU·메모리·GPU 값을 사용한다. 사양 값은 노드와 함께 저장되며 자동 배치가 사양 라벨의 공간을 확보한다.

`infrastructure`는 노드에 저장하는 선택 필드다. 필드를 생략하면 기존 정보를 유지하며 `null`이면 지운다. 객체를 전달하면 섹션 전체를 교체한다. 상세 형식과 예시는 [한국어 AI 프롬프트](../samples/ai/structlet/references/prompt-ko.md)에 있다. 네임스페이스는 워크로드의 부모 영역이다. NodePool 등과의 설정 관계는 `relationship: true`를 지정해 아이소메트릭 흐름 재생에서 제외할 수 있다.

## 배치 방식

영역은 안쪽부터 크기를 정하고 바깥부터 놓는다. 한 부모 안에서:

1. 이미 자리가 있는 형제와 선으로 이어진 새 객체는 그 형제 옆(나가는 선이면 오른쪽, 들어오는 선이면 왼쪽)의 빈자리에 놓는다.
2. 나머지는 부모의 `layout`으로 기존 내용 아래에 배치한다. `flow`는 연결선의 최장 경로로 열을 정하고, 교차가 적어지도록 열 안의 순서를 정한다.
3. 새 영역은 내용에 맞는 크기가 되고, 기존 영역은 내용이 넘치면 커진다.

## 다른 입력

- **docker-compose.yml**: 서비스 → 노드(이미지로 아이콘 추정), `depends_on`과 `environment` 안의 서비스 이름 → 선, `ports` → 클라이언트 노드, 이름 있는 볼륨 → 스토리지 노드, 네트워크가 둘 이상이면 영역.
- **Terraform**: HCL이 아니라 `terraform show -json`(state 또는 `terraform show -json plan.out`) 결과를 읽는다. VPC/서브넷(가상 네트워크) → 중첩 영역, 알려진 리소스 → 노드, 선은 plan의 참조, state의 `depends_on`, 다른 리소스의 ID·ARN을 값으로 가진 속성, 이벤트 소스 매핑 같은 연결 리소스에서 만든다. 연결 대상을 확인할 수 있는 AWS 보안 그룹 규칙과 IAM 정책, Terraform 원격 상태 참조는 대상 노드의 인프라 상세로 저장한다. 원격 상태에는 출력 이름만 기록한다. EKS 관리형 노드 그룹의 taint는 `infrastructure.nodeProvisioning.taints`에 저장한다.
  - AWS EC2는 인스턴스 타입, CPU 설정, 시스템 디스크를 읽는다. T4g는 [AWS 공식 사양](https://docs.aws.amazon.com/ec2/latest/instancetypes/gp.html)으로 기본 vCPU와 메모리를 채운다. `data.aws_ec2_instance_type`의 결과가 있으면 일치하는 타입의 vCPU·메모리·GPU를 가져온다.
  - Google Compute Engine은 머신 타입, 커스텀 타입의 vCPU와 메모리, 지정된 GPU와 시스템 디스크를 읽는다. Azure VM은 크기와 지정된 시스템 디스크를 읽는다. Terraform 출력에서 확인할 수 없는 값은 인스펙터에서 입력할 수 있다.
- **Kubernetes**: 여러 문서 YAML, `kubectl get -o yaml` 또는 `-o json`(List), `helm template` 결과. 클러스터·네임스페이스 → 영역, 워크로드·Service·Ingress·ConfigMap·Secret·PVC·HPA → 노드. 선은 Ingress 규칙, Service selector, 볼륨·환경 변수 참조, HPA 대상에서 만든다. Argo CD Application·ApplicationSet, Karpenter NodePool·EC2NodeClass도 노드로 표시한다. 선언된 NodePool 참조를 점선으로 연결하고 노드 셀렉터와 어피니티를 워크로드에 저장한다. 컨트롤러가 관리하는 Pod·ReplicaSet은 그리지 않는다.

Argo CD Application의 소스와 동기화 옵션 및 ApplicationSet의 기본 템플릿은 `infrastructure.argoCd`에 저장한다. NodePool의 taint, 리소스 상한, 통합·만료·중단 한도는 `infrastructure.nodeProvisioning`에 있다. EC2NodeClass의 EBS 매핑은 `infrastructure.blockDevices`에 저장한다. Deployment·StatefulSet의 복제본 수와 CronJob 크론식·시간대는 `infrastructure.workload`에 저장한다. NodePool 인스턴스 선택 조건은 `infrastructure.nodeProvisioning.requirements`에, EC2NodeClass의 AMI 선택 조건과 IAM 참조는 `infrastructure.nodeClass`에 저장한다. 2D 발표 모드와 아이소메트릭에서 노드를 클릭하면 상세가 열린다.

AI 스킬과 프롬프트는 Kubernetes 구성도에서 Ingress → Service → 워크로드 경로를 기본으로 그린다. 배포 주체를 표시할 때는 Argo CD 설치마다 요약 노드 하나를 쓰고, 배포 상세를 요청받으면 Application과 ApplicationSet의 선언까지 기록한다. YAML을 파일 메뉴에서 직접 가져오면 파일에 들어 있는 리소스를 노드로 표시한다.
