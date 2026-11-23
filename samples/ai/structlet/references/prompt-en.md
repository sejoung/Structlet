# Create an editable Structlet diagram

Turn my architecture description or supplied project material into a strict JSON `structlet-draft` version 1. Structlet will validate the draft, automatically place new objects, and save it as an editable `.structlet` file.

## Kubernetes overview

- Follow the service path from ingress and services to workloads and their dependencies. Show one node per workload. Use Pod nodes for standalone Pods and represent replicas as workload details.
- Use the supplied manifests to establish these relationships. If only Argo CD declarations are available, show the known destinations as deployment context and leave the workload path unspecified until there is workload evidence.
- When GitOps ownership helps explain the overview, use one `workflow` node labeled Argo CD per installation and a dashed configuration link to the known destination cluster or namespace. Include individual Applications, ApplicationSets, their repositories or Helm charts, and sync options when the request calls for deployment detail. Follow referenced repositories or expand ApplicationSets only for deployment detail, using authorized inputs.

## Draft contract

- Use `title`, `layout` (`flow`, `flow-down`, or `grid`), and the arrays `containers`, `nodes`, `edges`, and `annotations` as needed.
- Put related services in containers for real boundaries such as a cloud, VPC, subnet, cluster, or namespace. Container kinds include `cloud`, `account`, `region`, `availability-zone`, `vpc`, `subnet`, `cluster`, `namespace`, and `custom`. Use `parent` to nest a container or node. Omit it for top-level objects.
- Use unique, stable IDs made of letters, digits, underscores, dots, colons, or hyphens. All `parent`, `from`, `to`, and `target` references must match existing or newly defined IDs. Omit coordinates for automatic layout.
- Set a node's icon with `service` and use a short name in `label`. Examples of supported IDs are `user`, `server`, `database`, `cache`, `aws.ec2`, `aws.elb`, `aws.rds`, `aws.sqs`, `aws.s3`, `gcp.compute-engine`, `azure.vm`, `k8s.deployment`, `nvidia.gpu`, `nvidia.mig`, and `nvidia.nvlink-switch`. Use a generic service that matches the role when the exact icon is unknown.
- Use `aws.ecr`, `aws.documentdb`, `aws.msk`, `aws.systems-manager`, `aws.acm`, and `aws.vpc-endpoint` for those AWS services. Use the canonical service ID so a user-loaded icon pack can supply its official image.
- Use `specs.instanceType`, `specs.vcpus`, `specs.memoryGiB`, `specs.gpu`, and `specs.diskGiB` for confirmed hardware. Use positive numbers for vCPU, RAM, and boot disk capacity. `specs.showDetails: true` shows the full specs in 2D. Omit unknown values and keep credentials out of the draft.
- Use `k8s.argocd-application`, `k8s.argocd-applicationset`, `k8s.karpenter-nodepool`, `k8s.karpenter-ec2nodeclass`, `aws.eks-nodegroup`, and `aws.cloudfront-function` for these resource types.
- Record configuration on the relevant node using the optional `infrastructure` object. Set it to `null` to clear the field in a revision. An object replaces the full field, so include the values to retain.
  - `securityGroupRules` contains objects with `direction` (`ingress` or `egress`), `protocol`, and `peers` (CIDRs, security groups, prefix list IDs, or `self`). Add `group`, integer `fromPort` and `toPort`, and `description` when declared.
  - `iamStatements` contains `effect` (`Allow` or `Deny`), optional `policy` and `sid`, and string arrays `actions`, `notActions`, `resources`, and `notResources` where present. `principals` and `notPrincipals` contain `{type, values}` entries. `conditions` contains `{operator, key, values}` entries. `iamPolicyRefs` is a string array of referenced policy names or ARNs.
  - `remoteStates` contains `address`, optional `backend`, and `outputs` as referenced output names. Omit backend configuration, secrets, and output values.
  - `placement` may include `nodePools` and `nodeGroups` as confirmed target names, `nodeSelector` as a selector array, `required` as an array of alternative selector arrays, and `preferred` as an array of `{weight, selectors}`. Each selector uses `key`, `operator`, optional string array `values`, and optional `source` (`label` or `field`). Together, selectors in one term must all match.
  - For deployment details, `argoCd` holds optional `template` (true for an ApplicationSet base template), `destination` (`name` or `server`, plus `namespace`), `sources`, `automated`, and string array `syncOptions`. Preserve the order of `spec.sources` when present. Each source has `repoURL` and optional `targetRevision`, `path`, `chart`, `ref`, and `helm` (`releaseName`, string array `valueFiles`, boolean `ignoreMissingValueFiles`). Keep credentials, URL query strings, and inline Helm values out of the file. `automated` has boolean `enabled` and optional booleans `prune`, `selfHeal`, `allowEmpty`. When `spec.syncPolicy.automated` is present and its `enabled` is absent or null, use `enabled: true`. Preserve all explicit `false` values. Copy ApplicationSet configuration from `spec.template.spec` and retain unresolved template expressions.
  - `nodeProvisioning` holds `taints`, `startupTaints`, NodePool `limits`, and `disruption`. Taints have `key`, optional `value`, and `effect` (`NoSchedule`, `PreferNoSchedule`, `NoExecute`). Use the same form for EKS managed node group taints. Each limit has `resource` and string `quantity`. Store declared `consolidationPolicy`, `consolidateAfter`, `expireAfter`, and `terminationGracePeriod` under `disruption`. Its `budgets` have string `nodes` (count or percentage), optional `schedule`, `duration`, and string array `reasons`.
  - `blockDevices` stores EC2NodeClass EBS device mappings. Each entry requires `deviceName`. Optional fields are `volumeType`, `volumeSize` (string quantity), `rootVolume`, `encrypted`, `deleteOnTermination` (booleans), `iops`, `throughput`, `volumeInitializationRate` (integers), `snapshotId`, and `kmsKeyId`. Use values declared in `spec.blockDeviceMappings`. Omit unspecified defaults.
- Keep the namespace as the workload's parent and link declared placement targets in the same cluster with `dashed: true` and `relationship: true`. Use the same flags for Argo CD destination links and NodePool → EC2NodeClass references. Configuration relationships remain visible in both views and are skipped by isometric flow playback. Use confirmed declarations for these links and keep preferred affinity as a separate field.
- Set edges with `from`, `to`, and an optional `label`. Use the actual traffic or dependency direction. Add `dashed: true` for asynchronous links and `arrow: "none"` for undirected links such as an NVLink fabric. Give parallel edges distinct IDs.
- Use `annotations` for useful notes or flow numbers. Each has an `id`, a `kind` (`text`, `step`, or `legend`), `text`, and an optional `target` to attach it to an object.
- When I supply an existing `.structlet` file, return a partial draft with its original IDs and only the requested changes. Omit unchanged fields. List IDs under `remove` only when I specifically ask to delete them.

## Example

```json
{
  "format": "structlet-draft",
  "formatVersion": 1,
  "title": "Checkout API",
  "layout": "flow",
  "containers": [{ "id": "private", "kind": "subnet", "label": "Private subnet" }],
  "nodes": [
    { "id": "customer", "service": "user", "label": "Customer" },
    { "id": "api", "service": "aws.ec2", "parent": "private", "label": "Checkout API", "specs": { "instanceType": "t4g.small", "vcpus": 2, "memoryGiB": 2, "showDetails": true }, "infrastructure": { "securityGroupRules": [{ "direction": "ingress", "protocol": "tcp", "fromPort": 443, "toPort": 443, "peers": ["192.0.2.0/24"] }] } }
  ],
  "edges": [{ "from": "customer", "to": "api", "label": "HTTPS" }]
}
```

Match the language of my request in the diagram labels. If you can create a file, save the draft as `architecture.draft.json`. Otherwise return a single raw JSON object.

## My architecture

Replace this line with the requirements, actual service connections, diagrams, or relevant project details.
