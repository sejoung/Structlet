import type { ContainerKind } from '../../domain';
import type { ServiceDefinition } from '../catalog/types';
import type { IconPack } from './pack';


type PackProvider = IconPack['provider'];

const STOP = new Set(['and', 'for', 'of', 'the', 'service', 'services', 'icon']);
const VENDOR = /^(amazon|aws|azure|microsoft|google|gcp)-/;

export function normalize(path: string): string {
  let s = (path.split(/[\\/]/).pop() ?? path).replace(/\.(svg|png)$/i, '').toLowerCase();
  s = s.replace(/^(arch|res|arch-category|arch-group)_/, '').replace(/^\d+-icon-service-/, '');
  s = s.replace(/[_\s.]+/g, '-').replace(/-(16|24|32|48|64|96|128|256|512)(px)?$/, '').replace(/-(light|dark|color|colour)$/, '');
  return s.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function singular(w: string): string {
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ses') || w.endsWith('xes')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

export function tokenKey(text: string): string {
  const words = text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const kept = words.filter((w, i) => !(i === 0 && /^(amazon|aws|azure|microsoft|google)$/.test(w)) && !STOP.has(w)).map(singular);
  return [...new Set(kept)].sort().join(' ');
}

const ALIASES: Record<PackProvider, Record<string, string>> = {
  aws: {
    'elastic-container-service': 'aws.ecs', 'elastic-kubernetes-service': 'aws.eks', 'simple-storage-service': 'aws.s3',
    'elastic-block-store': 'aws.ebs', 'elastic-file-system': 'aws.efs', efs: 'aws.efs', 'simple-queue-service': 'aws.sqs',
    'simple-notification-service': 'aws.sns', 'kinesis-data-streams': 'aws.kinesis', 'vpc-nat-gateway': 'aws.natgateway',
    'vpc-internet-gateway': 'aws.igw', 'identity-and-access-management': 'aws.iam', 'key-management-service': 'aws.kms',
    'simple-email-service': 'aws.ses', 'sagemaker-ai': 'aws.sagemaker', 'elastic-load-balancing': 'aws.elb',
    'elastic-load-balancing-application-load-balancer': 'aws.elb', 'opensearch-service': 'aws.opensearch',
  },
  gcp: { 'pub-sub': 'gcp.pubsub', pubsub: 'gcp.pubsub', gke: 'gcp.gke', 'kubernetes-engine': 'gcp.gke', gcs: 'gcp.cloud-storage', 'cloud-load-balancing': 'gcp.cloud-load-balancing', 'load-balancing': 'gcp.cloud-load-balancing', 'identity-and-access-management': 'gcp.iam', 'key-management-service': 'gcp.kms', 'vertexai': 'gcp.vertex-ai' },
  azure: {
    'function-apps': 'azure.functions', 'event-grid-topics': 'azure.event-grid', 'api-management-services': 'azure.api-management',
    'front-door-and-cdn-profiles': 'azure.front-door', 'dns-zones': 'azure.dns', nat: 'azure.nat-gateway', 'log-analytics-workspaces': 'azure.log-analytics',
    'power-bi-embedded': 'azure.power-bi', 'vm-scale-sets': 'azure.vmss', 'container-apps-environments': 'azure.container-apps', 'worker-container-app': 'azure.container-apps',
    'azure-database-postgresql-server': 'azure.postgresql', 'database-postgresql-server': 'azure.postgresql', 'azure-database-mysql-server': 'azure.mysql',
    'database-mysql-server': 'azure.mysql', 'entra-id': 'azure.entra-id', 'microsoft-entra-id': 'azure.entra-id', 'azure-active-directory': 'azure.entra-id',
    'file-shares': 'azure.files', 'azure-files': 'azure.files', 'storage-accounts': 'azure.storage', openai: 'azure.openai', 'azure-openai': 'azure.openai',
  },
  k8s: { deploy: 'k8s.deployment', sts: 'k8s.statefulset', ds: 'k8s.daemonset', job: 'k8s.job', cronjob: 'k8s.cronjob', pod: 'k8s.pod', svc: 'k8s.service', ing: 'k8s.ingress', cm: 'k8s.configmap', secret: 'k8s.secret', pvc: 'k8s.pvc', hpa: 'k8s.hpa', rs: 'k8s.replicaset' },
};

const AREA_ALIASES: Record<PackProvider, Record<string, ContainerKind>> = {
  aws: { 'aws-cloud': 'cloud', 'aws-cloud-logo': 'cloud', cloud: 'cloud', region: 'region', 'virtual-private-cloud-vpc': 'vpc', vpc: 'vpc', 'private-subnet': 'subnet', 'aws-account': 'account', account: 'account', 'availability-zone': 'availability-zone' },
  gcp: { 'virtual-private-cloud': 'vpc', vpc: 'vpc', 'google-cloud': 'cloud', 'cloud-logo': 'cloud', region: 'region', zone: 'availability-zone', project: 'account' },
  azure: { 'virtual-networks': 'vpc', subnet: 'subnet', subscriptions: 'account', 'resource-groups': 'custom', azure: 'cloud', 'availability-zones': 'availability-zone', region: 'region' },
  k8s: { ns: 'namespace', 'control-plane': 'cluster', 'k8s-cluster': 'cluster' },
};

export interface Matcher {
  service(path: string): string | null;
  area(path: string): ContainerKind | null;
}

export function createMatcher(provider: PackProvider, catalog: readonly ServiceDefinition[]): Matcher {
  const byToken = new Map<string, string>();
  for (const s of catalog) {
    if (s.provider !== provider) continue;
    byToken.set(tokenKey(s.name.en), s.id);
    byToken.set(tokenKey(s.id.slice(s.id.indexOf('.') + 1)), s.id);
  }
  const aliases = ALIASES[provider];
  const areas = AREA_ALIASES[provider];
  return {
    service(path) {
      const key = normalize(path);
      const bare = key.replace(VENDOR, '');
      return aliases[key] ?? aliases[bare] ?? byToken.get(tokenKey(key)) ?? null;
    },
    area(path) {
      const key = normalize(path);
      return areas[key] ?? areas[key.replace(VENDOR, '')] ?? null;
    },
  };
}

export function preference(path: string): number {
  const p = path.toLowerCase();
  let score = p.endsWith('.svg') ? 100 : 0;
  if (/unlabeled/.test(p)) score += 20;
  const size = /[_-](16|24|32|48|64|96|128|256|512)(px)?\.(svg|png)$/.exec(p)?.[1];
  score += size === '48' ? 10 : size === '64' ? 8 : size === '32' ? 6 : size ? 2 : 5;
  if (/dark/.test(p)) score -= 3;
  return score;
}
