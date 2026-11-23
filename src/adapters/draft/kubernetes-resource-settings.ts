import type { ResourceSettings } from '../../domain';
import { record } from './infrastructure-values';
import { settingFields, settingsSection } from './resource-settings';

const ALB_ANNOTATIONS = [
  'scheme', 'group.name', 'group.order', 'subnets', 'inbound-cidrs', 'target-type', 'certificate-arn',
  'ssl-policy', 'listen-ports', 'ssl-redirect', 'backend-protocol', 'backend-protocol-version',
  'healthcheck-protocol', 'healthcheck-port', 'healthcheck-path', 'healthcheck-interval-seconds',
  'healthcheck-timeout-seconds', 'healthy-threshold-count', 'unhealthy-threshold-count', 'success-codes',
];

const SCHEDULING = `serviceAccountName tolerations
  containers.name containers.resources.requests containers.resources.limits
  initContainers.name initContainers.resources.requests initContainers.resources.limits
  overhead resources.requests resources.limits`;

export function kubernetesResourceSettings(value: unknown, workload?: unknown): ResourceSettings[] {
  const resource = record(value);
  const metadata = record(resource.metadata);
  const spec = record(resource.spec);
  const annotations = record(metadata.annotations);
  const kind = typeof resource.kind === 'string' ? resource.kind : '';
  if (!kind) return [];
  const source = [kind, metadata.namespace, metadata.name].filter(Boolean).join(' ');
  let section: ResourceSettings | undefined;
  if (kind === 'Ingress') {
    const settings = settingFields(spec, 'ingressClassName rules defaultBackend tls');
    const selected = Object.fromEntries(ALB_ANNOTATIONS.flatMap((key) => {
      const value = annotations[`alb.ingress.kubernetes.io/${key}`];
      if (typeof value !== 'string' || value.length > 2048) return [];
      try {
        return [[key, JSON.parse(value)]];
      } catch {
        return [[key, value]];
      }
    }));
    const alb = Object.keys(selected).length ? settingFields({ alb: selected }, 'alb') : undefined;
    section = settingsSection(kind, { ...settings, ...alb }, source);
  } else if (kind === 'StorageClass') {
    section = settingsSection(kind, settingFields(resource,
      'provisioner volumeBindingMode reclaimPolicy allowVolumeExpansion mountOptions allowedTopologies parameters.type parameters.encrypted parameters.kmsKeyId parameters.fsType parameters.iops parameters.throughput'), source);
  } else if (kind === 'IngressClass') {
    section = settingsSection(kind, settingFields(spec, 'controller parameters'), source);
  } else if (workload) {
    section = settingsSection(kind, settingFields(workload, SCHEDULING), source);
  }
  return section ? [section] : [];
}
