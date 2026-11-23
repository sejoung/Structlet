import { expect, it } from 'vitest';
import { createAppearance } from '../../../src/adapters/catalog/services';
import { compileDraft } from '../../../src/adapters/draft/compile';
import { importInto } from '../../../src/adapters/draft/import';
import { parseFragment, serializeFragment } from '../../../src/adapters/format/clipboard';
import { parseStructlet, serializeStructlet } from '../../../src/adapters/format/structlet-format';
import { emptyDocument, extractFragment, type Edge } from '../../../src/domain';
import { computeScene, indexIsometricFlow } from '../../../src/engine';

const base = emptyDocument('example', 'Example');

function endpoints(edge: Edge) {
  return [edge.source, edge.target].map((e) => e.kind === 'attached' ? e.objectId : null);
}

it('preserves namespaces and declarative scheduling conditions independently, with dedicated Argo CD and Karpenter nodes', async () => {
  const manifests = [
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'payments' } },
    { apiVersion: 'argoproj.io/v1alpha1', kind: 'Application', metadata: { name: 'payments', namespace: 'argocd' },
      spec: { destination: { server: 'https://kubernetes.default.svc', namespace: 'payments' } } },
    { apiVersion: 'argoproj.io/v1alpha1', kind: 'ApplicationSet', metadata: { name: 'platform', namespace: 'argocd' } },
    { apiVersion: 'argoproj.io/v1alpha1', kind: 'Application', metadata: { name: 'external', namespace: 'argocd' },
      spec: { destination: { server: 'https://other.example.test', namespace: 'payments' } } },
    { apiVersion: 'karpenter.sh/v1', kind: 'NodePool', metadata: { name: 'compute' },
      spec: { template: { spec: { nodeClassRef: { group: 'karpenter.k8s.aws', kind: 'EC2NodeClass', name: 'linux' } } } } },
    { apiVersion: 'karpenter.sh/v1', kind: 'NodePool', metadata: { name: 'preferred' } },
    { apiVersion: 'karpenter.k8s.aws/v1', kind: 'EC2NodeClass', metadata: { name: 'linux' } },
    { apiVersion: 'apps/v1', kind: 'Deployment', metadata: { name: 'api', namespace: 'payments' },
      spec: { template: { spec: {
        nodeSelector: { 'eks.amazonaws.com/nodegroup': 'managed' },
        affinity: { nodeAffinity: {
          requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [
            { matchExpressions: [{ key: 'karpenter.sh/nodepool', operator: 'In', values: ['compute'] }],
              matchFields: [{ key: 'metadata.name', operator: 'NotIn', values: ['draining'] }] },
            { matchExpressions: [{ key: 'karpenter.sh/nodepool', operator: 'In', values: ['future'] }] },
          ] },
          preferredDuringSchedulingIgnoredDuringExecution: [{ weight: 90, preference: {
            matchExpressions: [{ key: 'karpenter.sh/nodepool', operator: 'In', values: ['preferred'] }],
          } }],
        } },
      } } } },
    { apiVersion: 'batch/v1', kind: 'Job', metadata: { name: 'flexible', namespace: 'payments' },
      spec: { template: { spec: { affinity: { nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: { nodeSelectorTerms: [
          { matchExpressions: [{ key: 'karpenter.sh/nodepool', operator: 'In', values: ['compute'] }] },
          { matchExpressions: [{ key: 'kubernetes.io/arch', operator: 'In', values: ['arm64'] }] },
        ] },
      } } } } } },
  ];
  const yaml = manifests.map((manifest) =>
    `apiVersion: ${manifest.apiVersion}\nkind: ${manifest.kind}\nmetadata: ${JSON.stringify(manifest.metadata)}\n${manifest.spec ? `spec: ${JSON.stringify(manifest.spec)}\n` : ''}`).join('---\n');
  const result = await importInto(base, yaml);
  expect(result).toMatchObject({ ok: true, source: 'kubernetes' });
  if (!result.ok) return;
  const { document } = result;
  const services = document.nodes.map((n) => n.serviceId);
  for (const service of ['k8s.argocd-application', 'k8s.argocd-applicationset', 'k8s.karpenter-nodepool', 'k8s.karpenter-ec2nodeclass']) {
    expect(services).toContain(service);
  }
  const api = document.nodes.find((n) => n.id === 'k8s-payments-deployment-api')!;
  expect(api).toMatchObject({
    parentId: 'k8s-ns-payments',
    infrastructure: { placement: {
      nodePools: ['compute', 'future'], nodeGroups: ['managed'],
      required: [[
        { key: 'karpenter.sh/nodepool', operator: 'In', values: ['compute'], source: 'label' },
        { key: 'metadata.name', operator: 'NotIn', values: ['draining'], source: 'field' },
      ], [{ key: 'karpenter.sh/nodepool', operator: 'In', values: ['future'], source: 'label' }]],
      preferred: [{ weight: 90, selectors: [{ key: 'karpenter.sh/nodepool', values: ['preferred'] }] }],
    } },
  });
  expect(document.nodes.find((n) => n.id.endsWith('job-flexible'))?.infrastructure?.placement?.nodePools).toBeUndefined();
  expect(document.nodes.find((n) => n.id === 'k8s-cluster-nodepool-compute')?.parentId).toBe('k8s-cluster');
  expect(document.edges.map(endpoints)).toEqual([
    ['k8s-argocd-application-payments', 'k8s-ns-payments'],
    ['k8s-cluster-nodepool-compute', 'k8s-cluster-ec2nodeclass-linux'],
    [api.id, 'k8s-cluster-nodepool-compute'],
  ]);
  expect(document.edges.every((edge) => edge.relationship && edge.style.dashed)).toBe(true);
  expect(indexIsometricFlow(computeScene(document, createAppearance('en'))).size).toBe(0);
  const saved = parseStructlet(serializeStructlet(document));
  expect(saved).toEqual({ ok: true, document });
  expect(parseFragment(serializeFragment(extractFragment(document, [api.id])))?.nodes[0]?.infrastructure).toEqual(api.infrastructure);
});

it('imports Terraform security group rules, IAM statements, remote-state names, and CloudFront Functions', async () => {
  const aws = (type: string, name: string, values: Record<string, unknown>) => ({ address: `aws_${type}.${name}`, type: `aws_${type}`, name, values });
  const resources = [
    aws('instance', 'api', { vpc_security_group_ids: ['sg-app'], iam_instance_profile: 'app-profile' }),
    aws('security_group', 'app', { id: 'sg-app', ingress: [{ protocol: 'tcp', from_port: 443, to_port: 443, cidr_blocks: ['192.0.2.0/24'] }] }),
    aws('vpc_security_group_egress_rule', 'api', { security_group_id: 'sg-app', ip_protocol: 'tcp', from_port: 5432, to_port: 5433, referenced_security_group_id: 'sg-db' }),
    aws('iam_instance_profile', 'app', { name: 'app-profile', role: 'app-role' }),
    aws('iam_role', 'app', { name: 'app-role', assume_role_policy: { Statement: {
      Effect: 'Allow', Action: 'sts:AssumeRole', Principal: { Service: 'ec2.amazonaws.com' },
    } } }),
    aws('iam_role_policy', 'app', { role: 'app-role', policy: JSON.stringify({ Statement: [{
      Sid: 'Read', Effect: 'Allow', Action: ['s3:GetObject'], Resource: 'arn:aws:s3:::example/*',
      Condition: { Bool: { 'aws:SecureTransport': true } },
    }] }) }),
    aws('iam_role_policy_attachment', 'managed', { role: 'app-role', policy_arn: 'arn:aws:iam::aws:policy/ReadOnlyAccess' }),
    aws('cloudfront_function', 'path', { arn: 'arn:aws:cloudfront::000000000000:function/path', code: 'SYNTHETIC_SOURCE' }),
    aws('cloudfront_distribution', 'site', { default_cache_behavior: [{ function_association: [{
      event_type: 'viewer-request', function_arn: 'arn:aws:cloudfront::000000000000:function/path',
    }] }] }),
    { address: 'data.terraform_remote_state.network', name: 'network', type: 'terraform_remote_state', mode: 'data',
      values: { backend: 's3', config: { key: 'SYNTHETIC_BACKEND_KEY' }, outputs: { vpc_id: 'SYNTHETIC_VALUE' } } },
  ];
  const input = {
    planned_values: { root_module: { resources } },
    configuration: { root_module: { resources: [{
      address: 'aws_instance.api', expressions: { subnet_id: { references: [
        'data.terraform_remote_state.network.outputs.subnet_id', 'data.terraform_remote_state.network.outputs["vpc_id"]',
        'data.terraform_remote_state.network.outputs', 'data.terraform_remote_state.network',
      ] } },
    }] } },
  };
  const result = await importInto(base, JSON.stringify(input));
  expect(result).toMatchObject({ ok: true, source: 'terraform' });
  if (!result.ok) return;
  const { document } = result;
  expect(document.nodes.find((n) => n.id === 'tf-aws_instance.api')?.infrastructure).toMatchObject({
    securityGroupRules: [
      { direction: 'ingress', protocol: 'tcp', fromPort: 443, toPort: 443, peers: ['192.0.2.0/24'], group: 'aws_security_group.app' },
      { direction: 'egress', protocol: 'tcp', fromPort: 5432, toPort: 5433, peers: ['sg-db'] },
    ],
    iamStatements: [
      { effect: 'Allow', sid: 'Read', actions: ['s3:GetObject'], resources: ['arn:aws:s3:::example/*'],
        conditions: [{ operator: 'Bool', key: 'aws:SecureTransport', values: ['true'] }] },
      { effect: 'Allow', actions: ['sts:AssumeRole'], principals: [{ type: 'Service', values: ['ec2.amazonaws.com'] }] },
    ],
    iamPolicyRefs: ['arn:aws:iam::aws:policy/ReadOnlyAccess'],
    remoteStates: [{ address: 'data.terraform_remote_state.network', backend: 's3', outputs: ['subnet_id', 'vpc_id'] }],
  });
  expect(document.nodes).toContainEqual(expect.objectContaining({ id: 'tf-aws_cloudfront_function.path', serviceId: 'aws.cloudfront-function' }));
  expect(document.edges.map((e) => [endpoints(e), e.label])).toContainEqual([
    ['tf-aws_cloudfront_distribution.site', 'tf-aws_cloudfront_function.path'], 'viewer-request',
  ]);
  const saved = serializeStructlet(document);
  expect(saved).not.toMatch(/SYNTHETIC_/);
  expect(parseStructlet(saved)).toEqual({ ok: true, document });
});

it('validates infrastructure records and preserves omitted fields when updating an AI draft', () => {
  const bad = compileDraft(JSON.stringify({ nodes: [{ id: 'api', infrastructure: { iamStatements: [{ effect: 'Assume' }] } }] }), base);
  expect(bad).toMatchObject({ ok: false, errors: [expect.stringContaining('nodes[0].infrastructure.iamStatements[0].effect')] });
  const first = compileDraft(JSON.stringify({ nodes: [{ id: 'api', infrastructure: { remoteStates: [{ address: 'network' }] } }] }), base);
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  const updated = compileDraft(JSON.stringify({ nodes: [{ id: 'api', label: 'API' }] }), first.document);
  expect(updated).toMatchObject({ ok: true, document: { nodes: [{ label: 'API', infrastructure: { remoteStates: [{ address: 'network' }] } }] } });
  const cleared = compileDraft(JSON.stringify({ nodes: [{ id: 'api', infrastructure: null }] }), first.document);
  expect(cleared.ok && cleared.document.nodes[0]?.infrastructure).toBeUndefined();
  expect(parseStructlet(first.text.replace('"network"', 'false'))).toMatchObject({ ok: false, errors: [expect.stringContaining('remoteStates[0].address')] });
});
