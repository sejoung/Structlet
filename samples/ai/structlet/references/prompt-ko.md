# 편집 가능한 Structlet 구성도 만들기

아래 요구사항이나 제공한 프로젝트 자료를 읽고 엄격한 JSON으로 `structlet-draft` 버전 1 초안을 만들어 주세요. Structlet이 이 초안을 검증하고 새 객체를 자동 배치한 뒤 편집 가능한 `.structlet` 파일로 저장합니다.

## 조사 범위

- 현재 작업에서 사용자가 지정한 파일·디렉터리·저장소를 조사 범위로 사용하세요.
- 범위 밖의 참조는 범위 안의 선언에서 확인한 저장소, 브랜치 등 리비전, 경로, 목적지만 표시하세요.
- 다른 로컬 저장소나 원격 저장소, AWS API, Kubernetes 클러스터는 사용자가 해당 소스를 조사 범위에 포함한 경우에만 조회하세요. 렌더링이나 의존성 확인 과정에서 간접적으로 자료를 읽을 때도 같은 기준을 적용하세요.
- 이전에 수집한 자료와 임시 렌더링 결과도 같은 범위 기준으로 확인하세요. 출처가 현재 조사 범위에 포함된 내용만 재사용하세요.

## Kubernetes 간략 구성도

- Ingress와 Service에서 워크로드 및 의존 서비스까지 이어지는 경로를 그리세요. 워크로드마다 노드 하나를 쓰고, 독립 Pod는 Pod 노드로 표현하세요. 복제본 수와 CronJob 실행 일정은 `infrastructure.workload`에 담으세요.
- 이 연결은 제공된 매니페스트에서 확인하세요. Argo CD 선언만 있다면 확인된 배포 목적지를 표시하고, 워크로드 경로는 근거가 확보될 때까지 비워 두세요.
- 배포 주체가 구성도 이해에 도움이 되면 Argo CD 설치마다 `workflow` 노드 하나에 Argo CD 라벨을 붙이고, 확인된 클러스터나 네임스페이스에 점선 설정 관계를 연결하세요. 배포 상세를 요청받은 경우 개별 Application·ApplicationSet, 저장소·Helm 차트, 동기화 옵션까지 담으세요. 배포 상세를 요청받았을 때 조사 범위에 포함된 저장소를 따라가거나 범위 안의 자료로 ApplicationSet을 펼치세요.

## 초안 작성 규칙

- `title`, `layout`(`flow`, `flow-down`, `grid`)과 필요한 `containers`, `nodes`, `edges`, `annotations` 배열을 사용하세요.
- 클라우드, VPC, 서브넷, 클러스터, 네임스페이스처럼 실제 경계를 영역으로 표현하세요. 영역 종류에는 `cloud`, `account`, `region`, `availability-zone`, `vpc`, `subnet`, `cluster`, `namespace`, `custom`이 있습니다. 영역과 노드는 `parent`로 묶고 최상위 객체는 생략해도 됩니다.
- ID는 영문자·숫자·밑줄·점·콜론·하이픈으로 만들고, 각 객체에 고유한 ID를 부여하세요. `parent`, `from`, `to`, `target`에는 실제로 정의된 ID를 쓰세요. 자동 배치를 위해 좌표를 생략하세요.
- 노드는 `service`로 아이콘을 지정하고 `label`에 짧은 이름을 쓰세요. 지원하는 ID 예시는 `user`, `server`, `database`, `cache`, `aws.ec2`, `aws.elb`, `aws.rds`, `aws.sqs`, `aws.s3`, `gcp.compute-engine`, `azure.vm`, `k8s.deployment`, `nvidia.gpu`, `nvidia.mig`, `nvidia.nvlink-switch`입니다. 정확한 아이콘을 모르면 역할에 맞는 일반 서비스 ID를 사용하세요.
- ECR, DocumentDB, MSK, Systems Manager, ACM, VPC 엔드포인트에는 각각 `aws.ecr`, `aws.documentdb`, `aws.msk`, `aws.systems-manager`, `aws.acm`, `aws.vpc-endpoint`를 쓰세요. 표준 서비스 ID를 쓰면 사용자가 불러온 아이콘 팩의 공식 이미지가 연결됩니다.
- 확인된 장비 사양은 `specs.instanceType`, `specs.vcpus`, `specs.memoryGiB`, `specs.gpu`, `specs.diskGiB`에 적으세요. vCPU, 메모리, 시스템 디스크는 양수로 입력하세요. 2D에서 상세 사양을 바로 표시하려면 `specs.showDetails: true`를 쓰세요. 확인하지 못한 값과 자격 증명은 생략하세요.
- Argo CD Application·ApplicationSet, Karpenter NodePool·EC2NodeClass, EKS 관리형 노드 그룹, CloudFront Functions에는 각각 `k8s.argocd-application`, `k8s.argocd-applicationset`, `k8s.karpenter-nodepool`, `k8s.karpenter-ec2nodeclass`, `aws.eks-nodegroup`, `aws.cloudfront-function`을 사용하세요.
- 관련 노드의 선택 필드인 `infrastructure`에 아래 설정을 기록하세요. 수정 초안에 이 객체를 넣으면 필드 전체를 교체하므로 유지할 값도 담으세요. 지우려면 `null`을 쓰세요.
  - `securityGroupRules`의 각 객체에 `direction`(`ingress` 또는 `egress`), `protocol`, `peers`(CIDR, 보안 그룹, 접두사 목록 ID 또는 `self`)를 넣으세요. 확인된 `group`, 정수형 `fromPort`·`toPort`, `description`을 추가할 수 있습니다.
  - `iamStatements`의 각 객체에는 `effect`(`Allow` 또는 `Deny`)가 필요합니다. 선언에 따라 `policy`, `sid`, 문자열 배열 `actions`·`notActions`·`resources`·`notResources`를 추가하세요. `principals`·`notPrincipals`는 `{type, values}` 배열이고, `conditions`는 `{operator, key, values}` 배열입니다. 참조 정책의 이름 또는 ARN은 문자열 배열 `iamPolicyRefs`에 넣으세요.
  - `remoteStates`의 각 객체에는 `address`와 선택 필드인 `backend`, 참조하는 출력 이름 배열 `outputs`를 넣으세요. 백엔드 설정, 비밀 값, 실제 출력 값은 생략하세요.
  - `placement`에는 선언에서 확인한 대상 이름 배열 `nodePools`·`nodeGroups`, 셀렉터 배열 `nodeSelector`, 대안별 셀렉터 배열을 담는 `required`, `{weight, selectors}` 배열 `preferred`를 넣을 수 있습니다. 셀렉터에는 `key`, `operator`, 선택 필드인 문자열 배열 `values`와 `source`(`label` 또는 `field`)를 씁니다. 같은 필수 항목 안의 셀렉터는 모두 충족해야 합니다.
  - 배포 상세를 담을 때는 `argoCd`에 ApplicationSet 기본 템플릿 여부(`template: true`), `destination`(`name` 또는 `server`, `namespace`), `sources`, `automated`, 문자열 배열 `syncOptions`를 기록하세요. `spec.sources` 배열의 순서를 유지하세요. 소스마다 `repoURL`과 선택 필드 `targetRevision`, `path`, `chart`, `ref`, `helm`을 담을 수 있습니다. `helm`은 `releaseName`, 문자열 배열 `valueFiles`, 불리언 `ignoreMissingValueFiles`를 받습니다. 인증 정보, URL 쿼리 문자열과 인라인 Helm 값은 생략하세요. `automated`는 불리언 `enabled`와 선택 불리언 `prune`·`selfHeal`·`allowEmpty`를 받습니다. 원본에 자동 동기화 블록이 있고 `enabled`가 생략되었거나 null이면 `enabled: true`로 쓰세요. 명시된 `false`는 유지하세요. ApplicationSet은 `spec.template.spec`에 선언한 값과 아직 해석되지 않은 템플릿 표현식을 기록하세요.
  - `workload`에 Deployment와 StatefulSet의 `replicas`를 0 이상의 정수로 기록하세요. CronJob은 크론식을 `schedule`에, 시간대가 선언된 경우 `timeZone`에 기록하세요.
  - `nodeProvisioning`에 `taints`, `startupTaints`, NodePool의 `limits`·`requirements`·`disruption`을 담으세요. 인스턴스 선택 조건은 `requirements`에 `key`, `operator`, 선택 필드인 문자열 배열 `values`와 양의 정수 `minValues`를 기록하세요. Taint는 `key`, 선택 필드 `value`, `effect`(`NoSchedule`, `PreferNoSchedule`, `NoExecute`)를 사용합니다. EKS 관리형 노드 그룹에도 같은 형식을 씁니다. 상한마다 `resource`와 문자열 `quantity`를 넣으세요. `disruption`에는 선언된 `consolidationPolicy`, `consolidateAfter`, `expireAfter`, `terminationGracePeriod`를 기록하세요. `budgets`에는 문자열 `nodes`(수 또는 비율)와 선택 필드인 `schedule`, `duration`, 문자열 배열 `reasons`를 담으세요.
  - `nodeClass`에 EC2NodeClass의 `amiFamily`, `role` 또는 `instanceProfile`, `amiSelectorTerms`를 기록하세요. 각 AMI 선택 항목은 선언에 따라 `alias`, `id`, `name`, `owner`, `ssmParameter`, `tags`(`{key, value}` 배열)를 담습니다. AMI 선택 대안과 각 대안에 속한 조건을 그대로 유지하세요. 서브넷은 `subnetSelectorTerms`(`id`, `tags`), 보안 그룹은 `securityGroupSelectorTerms`(`id`, `name`, `tags`)에 저장하세요. 선택 항목은 대안으로 유지하고 항목 안의 조건은 같은 객체에 담으세요.
  - `blockDevices`에 EC2NodeClass의 EBS 디스크 매핑을 담으세요. 각 디스크의 필수 필드는 `deviceName`입니다. 선택 필드로 `volumeType`, 문자열 용량 `volumeSize`, 불리언 `rootVolume`·`encrypted`·`deleteOnTermination`, 정수형 `iops`·`throughput`·`volumeInitializationRate`, `snapshotId`, `kmsKeyId`가 있습니다. `spec.blockDeviceMappings`에 명시된 설정을 기록하세요.
  - `cloudFront`에 배포의 `webAclId`, 기본 루트 객체의 파일 이름 또는 경로인 `defaultRootObject`, 뷰어 인증서 설정인 `viewerCertificate`, 순서가 있는 `cacheBehaviors` 배열을 기록하세요. `viewerCertificate`에는 선언된 `minimumProtocolVersion`(TLS 정책 이름)과 `sslSupportMethod`(예를 들어 `sni-only`)를 담으세요. 동작에는 `pathPattern`(기본 동작이면 생략), `originId`, `originRequestPolicyId`, `cachePolicy`를 담을 수 있습니다. 동작별로 선언된 `viewerProtocolPolicy`(`allow-all`, `https-only`, `redirect-to-https`), 별도 HTTP 메서드 문자열 배열인 `allowedMethods`(허용), `cachedMethods`(캐시 대상), `compress`(자동 압축 사용 여부)도 기록하세요. 정책은 `id`, `name`, 초 단위의 0 이상 정수 TTL인 `minTtl`·`defaultTtl`·`maxTtl`을 담습니다. 캐시 키의 `headers`·`cookies`·`queryStrings`는 `behavior`와 선택 문자열 배열 `items`를 씁니다. `gzip`과 `brotli`는 선택 불리언입니다. 정책 정의를 확인할 수 있으면 상세를 기록하고, 확인할 수 없는 정책은 선언에 있는 ID를 참조로 남기세요.
  - `waf`에 웹 ACL의 `id`(ARN이 있으면 사용), `scope`, `defaultAction`(`allow` 또는 `block`), `rules` 배열을 기록하세요. 웹 ACL과 각 규칙의 `visibility`에 `metricName`, `cloudWatchMetricsEnabled`, `sampledRequestsEnabled`를 기록하고 명시된 `false`를 유지하세요. `ipSets`에는 조건의 ARN과 일치하는 `reference`와, 조사 범위에서 확인한 `name`, `ipAddressVersion`(`IPV4` 또는 `IPV6`), `addresses`(CIDR 문자열 배열)를 담으세요. 주소 정의를 확인할 수 없는 IP Set은 조건에 ARN 참조를 유지하세요. 각 규칙은 `name`과 0 이상 정수 `priority`가 필요합니다. `action`(`allow`, `block`, `count`, `captcha`, `challenge`) 또는 `overrideAction`(`none`, `count`)과 `statements`를 담을 수 있습니다. 조건 객체는 `managed_rule_group`, `rate_based`, `ip_set_reference`와 같이 언더스코어로 연결한 `kind`를 씁니다. 선택 필드는 `reference`, `name`, `vendor`, `version`, 정수형 `limit`·`windowSeconds`, `aggregateKeyType`, 문자열 배열 `countryCodes`, `actionOverrides`(`{name, action}` 배열)입니다. 논리 조건은 `children`에, 적용 범위를 좁히는 조건은 `scopeDown`에 배열로 유지하세요. 요청 본문, 인증 정보, 일치 여부를 검사하는 문자열 원문은 생략하세요.
- 워크로드는 네임스페이스 영역에 두고 같은 클러스터에 선언된 배치 대상에는 `dashed: true`, `relationship: true`를 지정해 연결하세요. Argo CD 목적지와 NodePool → EC2NodeClass 참조도 같은 방식으로 연결하세요. 설정 관계는 두 뷰에 표시되며 아이소메트릭 흐름 재생에서 제외됩니다. 선호 어피니티는 전용 필드에 기록하세요.
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
    { "id": "api", "service": "aws.ec2", "parent": "private", "label": "주문 API", "specs": { "instanceType": "t4g.small", "vcpus": 2, "memoryGiB": 2, "showDetails": true }, "infrastructure": { "securityGroupRules": [{ "direction": "ingress", "protocol": "tcp", "fromPort": 443, "toPort": 443, "peers": ["192.0.2.0/24"] }] } }
  ],
  "edges": [{ "from": "customer", "to": "api", "label": "HTTPS" }]
}
```

구성도 라벨은 요청에 사용한 언어로 작성하세요. 파일을 만들 수 있으면 `architecture.draft.json`으로 저장해 주세요. 그 외에는 순수 JSON 객체 하나를 반환해 주세요.

## 만들고 싶은 구성도

이 줄을 요구사항, 실제 서비스 연결, 그림 또는 관련 프로젝트 자료로 바꿔 주세요.
