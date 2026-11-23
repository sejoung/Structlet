---
name: structlet
description: Create or update editable Structlet architecture diagrams from requirements, repositories, or infrastructure definitions and produce a validated .structlet file.
---

# Build a Structlet diagram

Deliver a validated, editable `.structlet` file. Keep the intermediate JSON in a temporary directory unless the user asks for it as a separate deliverable.

## Investigation scope

- Use the files, directories, and repositories the user designates for the current task as the investigation scope.
- For references outside that scope, record only the repository, branch or other revision, path, and destination shown in the in-scope declaration.
- Read other local repositories, access remote repositories, or query AWS APIs or Kubernetes clusters only when the user includes those sources in scope. Apply the same rule to indirect reads during rendering or dependency resolution.
- Apply the same scope to previously collected material and temporary render results. Reuse only content whose sources are known to be within the current scope.

## Workflow

1. Read the draft contract in the [English prompt](references/prompt-en.md) or [Korean prompt](references/prompt-ko.md). Use the user's language for diagram labels. Select built-in service IDs from [the service catalog](references/services.tsv). Structlet applies any official icon assets users load in their browser to those IDs.
2. Use the supplied requirements and in-scope sources. Identify grouping boundaries and actual service connections before writing the draft. Include equipment specs where confirmed. Keep cloud credentials, tokens, and secret values out of the diagram.
3. For a new diagram, omit coordinates so Structlet can lay it out. For a revision, read the existing `.structlet` file, use its exact object IDs, and include only the requested changes. Include `remove` only for explicitly requested deletions.
4. Write a strict JSON draft. Resolve `scripts/compile.mjs` relative to this `SKILL.md` and run it with Node.js 22 or later. Use a new filename for a revision.

```sh
node /path/to/structlet/scripts/compile.mjs architecture.draft.json architecture.structlet
node /path/to/structlet/scripts/compile.mjs update.draft.json revised.structlet --base existing.structlet
```

The compiler validates through Structlet's importer, lays out new objects, and saves the file. Correct validation errors and retry. Lead with the resulting `.structlet` path once validation succeeds.

For Terraform diagrams, label the source as declared configuration and state which environment it covers. Describe observed deployment state only when supported by separate evidence. Label traffic, management actions, and configuration dependencies by their meaning. Store declared security group rules, IAM statements or policy references, and Terraform remote-state addresses in `nodes[].infrastructure` using the prompt contract. Include only referenced output names and the backend type for remote state. Use `aws.cloudfront-function` for CloudFront Functions and label confirmed distribution associations with their event type. Store cache behavior protocol, allowed and cached methods, compression, policies, and the viewer certificate TLS policy in `infrastructure.cloudFront`. Store Web ACL rules, referenced IP sets, and monitoring settings in `infrastructure.waf`. Use the provided Terraform values for policy details, and record unresolved IDs or ARNs as references. When a referenced script or configuration file is unavailable, show the declared association and mark the implementation as unverified.

For Kubernetes architecture overviews, trace the paths from ingress and services to workloads and their dependencies. Show a single node per workload and use Pod nodes for standalone Pods. Record declared replica counts and CronJob schedules in `infrastructure.workload`. Use supplied workload manifests or charts to establish runtime relationships. Use the destinations already declared in the supplied Argo CD files as deployment context. When GitOps ownership matters, summarize each Argo CD installation with a `workflow` node labeled Argo CD and a dashed configuration link to its known destination. Follow referenced repositories, expand ApplicationSets, and record individual sync settings only when the user asks for deployment detail. Use the Argo CD detail fields in the prompt contract and limit source investigation to the scope above.

Group workloads by namespace and record node selectors and affinity in `infrastructure.placement`. For explicit targets, link to the matching `k8s.karpenter-nodepool` or `aws.eks-nodegroup` when cluster identity is verified. Put cluster-scoped `k8s.karpenter-nodepool` and `k8s.karpenter-ec2nodeclass` nodes in the cluster and link them through declared `nodeClassRef` values. Use `infrastructure.nodeProvisioning` for taints, NodePool instance requirements and limits, and cleanup policies. Use `infrastructure.nodeClass` for EC2NodeClass AMI, subnet, and security group selectors and IAM references. Use `infrastructure.blockDevices` for EC2NodeClass EBS mappings. Set `relationship: true` and `dashed: true` on configuration links. Use separate evidence to report actual pod placement, sync, or deployment status.

When compilation is blocked, report the specific problem. The draft can be converted in **User guide → Build a diagram with AI** for a new diagram, or applied through **File → Import** with the existing diagram open for a revision. Share the draft when the user asks for it.
