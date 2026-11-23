import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { compileDraft } from '../../../src/adapters/draft/compile';
import { importInto } from '../../../src/adapters/draft/import';
import { parseStructlet, serializeStructlet } from '../../../src/adapters/format/structlet-format';
import { emptyDocument } from '../../../src/domain';

const base = emptyDocument('details', 'Example');

it('imports workload, Argo CD, NodePool and EC2NodeClass declarations', async () => {
  const fixture = readFileSync(new URL('./fixtures/kubernetes-infrastructure.yaml', import.meta.url), 'utf8');
  const result = await importInto(base, fixture);
  expect(result).toMatchObject({ ok: true, source: 'kubernetes' });
  if (!result.ok) return;
  const { document } = result;
  const details = (service: string) => document.nodes.find((node) => node.serviceId === service)?.infrastructure;
  expect(details('k8s.argocd-application')).toMatchObject({
    argoCd: {
      sources: [{
        repoURL: 'https://charts.example.test/public', chart: 'billing', targetRevision: '1.4.2',
        helm: { releaseName: 'billing-api', valueFiles: ['$values/profiles/test.yaml'], ignoreMissingValueFiles: false },
      }, { repoURL: 'https://git.example.test/platform.git', ref: 'values', targetRevision: 'main' }],
      destination: { name: 'in-cluster', namespace: 'billing' },
      automated: { enabled: false, prune: true, selfHeal: true, allowEmpty: false },
      syncOptions: ['CreateNamespace=true'],
    },
  });
  expect(details('k8s.argocd-applicationset')).toMatchObject({
    argoCd: {
      template: true, sources: [{ path: 'clusters/{{ .name }}', targetRevision: 'main' }],
      automated: { enabled: true },
    },
  });
  expect(details('k8s.karpenter-nodepool')).toMatchObject({
    nodeProvisioning: {
      taints: [{ key: 'workload', value: 'gpu', effect: 'NoSchedule' }],
      startupTaints: [{ key: 'node.example.test/initialize', effect: 'NoExecute' }],
      requirements: [
        { key: 'kubernetes.io/arch', operator: 'In', values: ['arm64', 'amd64'], minValues: 2 },
        { key: 'karpenter.k8s.aws/instance-family', operator: 'Exists', minValues: 3 },
        { key: 'environment', operator: 'In', values: [''] },
      ],
      limits: [{ resource: 'cpu', quantity: '120' }, { resource: 'memory', quantity: '512Gi' }, { resource: 'nvidia.com/gpu', quantity: '4' }],
      disruption: {
        consolidationPolicy: 'WhenEmptyOrUnderutilized', consolidateAfter: '30m', expireAfter: 'Never', terminationGracePeriod: '1h',
        budgets: [{ nodes: '20%', reasons: ['Empty', 'Drifted'] }, { nodes: '0', schedule: '0 10 * * mon-fri', duration: '8h' }],
      },
    },
  });
  expect(details('k8s.karpenter-ec2nodeclass')).toMatchObject({
    nodeClass: {
      amiFamily: 'AL2023', role: 'KarpenterNodeRole-example',
      subnetSelectorTerms: [
        { tags: [{ key: 'tier', value: 'private' }, { key: 'platform.example.test/discovery', value: '' }] },
        { id: 'subnet-synthetic' },
      ],
      securityGroupSelectorTerms: [
        { name: 'worker-*', tags: [{ key: 'environment', value: 'test' }] },
        { id: 'sg-synthetic' },
      ],
      amiSelectorTerms: [
        { name: 'eks-linux-*', owner: 'self', tags: [{ key: 'release-channel', value: '' }] },
        { id: 'ami-synthetic' },
        { ssmParameter: '/platform/amis/approved' },
      ],
    },
    blockDevices: [
      { deviceName: '/dev/xvda', rootVolume: true, volumeType: 'gp3', volumeSize: '80Gi', encrypted: true, deleteOnTermination: false, iops: 3500, throughput: 150 },
      { deviceName: '/dev/xvdb', snapshotId: 'snap-example', kmsKeyId: 'key-example', volumeInitializationRate: 100 },
    ],
  });
  expect(document.nodes.find((node) => node.id === 'k8s-cluster-ec2nodeclass-profile')?.infrastructure).toMatchObject({
    nodeClass: { instanceProfile: 'example-managed-instance-profile', amiSelectorTerms: [{ alias: 'al2023@v20241010' }] },
  });
  expect(details('k8s.deployment')).toMatchObject({ workload: { replicas: 0 }, placement: { nodePools: ['compute'] } });
  expect(details('k8s.cronjob')).toMatchObject({ workload: { schedule: '30 2 * * 1-5', timeZone: 'Asia/Seoul' } });
  expect(document.annotations).toHaveLength(0);
  const file = serializeStructlet(document);
  expect(file).not.toMatch(/SYNTHETIC_|unused\.example\.test/);
  expect(parseStructlet(file)).toEqual({ ok: true, document });
});

it('keeps older Karpenter expiration declarations and distinguishes manual Argo CD sync', async () => {
  const result = await importInto(base, [
    'apiVersion: karpenter.sh/v1beta1\nkind: NodePool\nmetadata: {name: legacy}\nspec: {disruption: {expireAfter: 720h}}',
    'apiVersion: argoproj.io/v1alpha1\nkind: Application\nmetadata: {name: manual}\nspec: {source: {repoURL: "https://git.example.test/manual.git"}}',
    'apiVersion: batch/v1\nkind: CronJob\nmetadata: {name: default-timezone}\nspec: {schedule: "@daily"}',
  ].join('\n---\n'));
  expect(result).toMatchObject({ ok: true, document: { nodes: [
    { infrastructure: { nodeProvisioning: { disruption: { expireAfter: '720h' } } } },
    { infrastructure: { argoCd: { automated: { enabled: false } } } },
    { infrastructure: { workload: { schedule: '@daily' } } },
  ] } });
  if (result.ok) expect(result.document.nodes.find((node) => node.serviceId === 'k8s.cronjob')?.infrastructure?.workload?.timeZone).toBeUndefined();
});

it('normalizes declared Terraform EKS taints into Kubernetes effects', async () => {
  const result = await importInto(base, JSON.stringify({
    planned_values: { root_module: { resources: [{
      address: 'aws_eks_node_group.workers', type: 'aws_eks_node_group', name: 'workers',
      values: { taint: [{ key: 'gpu', value: 'only', effect: 'NO_SCHEDULE' }, { key: 'io', effect: 'PREFER_NO_SCHEDULE' }] },
    }] } },
  }));
  expect(result).toMatchObject({ ok: true, document: { nodes: [{
    serviceId: 'aws.eks-nodegroup',
    infrastructure: { nodeProvisioning: { taints: [
      { key: 'gpu', value: 'only', effect: 'NoSchedule' }, { key: 'io', effect: 'PreferNoSchedule' },
    ] } },
  }] } });
});

it.each([
  [{ argoCd: { automated: { enabled: 'false' } } }, 'argoCd.automated.enabled'],
  [{ nodeProvisioning: { taints: [{ key: 'gpu', effect: 'Never' }] } }, 'nodeProvisioning.taints[0].effect'],
  [{ workload: { replicas: -1 } }, 'workload.replicas'],
  [{ nodeProvisioning: { requirements: [{ key: 'instance-family', operator: 'Exists', minValues: 0 }] } }, 'nodeProvisioning.requirements[0].minValues'],
  [{ nodeClass: { amiSelectorTerms: [{ tags: [{ key: 'channel', value: false }] }] } }, 'nodeClass.amiSelectorTerms[0].tags[0].value'],
  [{ blockDevices: [{ deviceName: '/dev/xvda', iops: '3500' }] }, 'blockDevices[0].iops'],
])('rejects invalid provisioning details', (infrastructure, path) => {
  const result = compileDraft(JSON.stringify({ nodes: [{ id: 'node', infrastructure }] }), base);
  expect(result).toMatchObject({ ok: false, errors: [expect.stringContaining(path)] });
});
