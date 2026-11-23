# Create an editable Structlet diagram

Turn my architecture description or supplied project material into a strict JSON `structlet-draft` version 1. Structlet will validate the draft, automatically place new objects, and save it as an editable `.structlet` file.

## Draft contract

- Use `title`, `layout` (`flow`, `flow-down`, or `grid`), and the arrays `containers`, `nodes`, `edges`, and `annotations` as needed.
- Put related services in containers for real boundaries such as a cloud, VPC, subnet, cluster, or namespace. Container kinds include `cloud`, `account`, `region`, `availability-zone`, `vpc`, `subnet`, `cluster`, `namespace`, and `custom`. Use `parent` to nest a container or node. Omit it for top-level objects.
- Use unique, stable IDs made of letters, digits, underscores, dots, colons, or hyphens. All `parent`, `from`, `to`, and `target` references must match existing or newly defined IDs. Omit coordinates for automatic layout.
- Set a node's icon with `service` and use a short name in `label`. Examples of supported IDs are `user`, `server`, `database`, `cache`, `aws.ec2`, `aws.elb`, `aws.rds`, `aws.sqs`, `aws.s3`, `gcp.compute-engine`, `azure.vm`, `k8s.deployment`, `nvidia.gpu`, `nvidia.mig`, and `nvidia.nvlink-switch`. Use a generic service that matches the role when the exact icon is unknown.
- Use `aws.ecr`, `aws.documentdb`, `aws.msk`, `aws.systems-manager`, `aws.acm`, and `aws.vpc-endpoint` for those AWS services. Use the canonical service ID so a user-loaded icon pack can supply its official image.
- Use `specs.instanceType`, `specs.vcpus`, `specs.memoryGiB`, `specs.gpu`, and `specs.diskGiB` for confirmed hardware. Use positive numbers for vCPU, RAM, and boot disk capacity. `specs.showDetails: true` shows the full specs in 2D. Omit unknown values and keep credentials out of the draft.
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
    { "id": "api", "service": "aws.ec2", "parent": "private", "label": "Checkout API", "specs": { "instanceType": "t4g.small", "vcpus": 2, "memoryGiB": 2, "showDetails": true } }
  ],
  "edges": [{ "from": "customer", "to": "api", "label": "HTTPS" }]
}
```

Match the language of my request in the diagram labels. If you can create a file, save the draft as `architecture.draft.json`. Otherwise return a single raw JSON object.

## My architecture

Replace this line with the requirements, actual service connections, diagrams, or relevant project details.
