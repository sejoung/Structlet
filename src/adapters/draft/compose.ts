import { parse } from 'yaml';
import type { Draft, DraftEdge, DraftNode } from './draft-format';

/**
 * docker-compose.yml → draft. Services become nodes (icon from the image),
 * `depends_on` and service names in `environment` become edges, published
 * `ports` get a client node, named volumes become storage nodes and multiple
 * networks become nested areas.
 */

const IMAGE_SERVICES: [RegExp, string][] = [
  [/postgres|mysql|mariadb|mssql|oracle|cockroach/, 'database'],
  [/mongo|dynamo|cassandra|couch|scylla/, 'table'],
  [/redis|memcache|valkey|keydb/, 'cache'],
  [/rabbitmq|activemq|nats|sqs/, 'queue'],
  [/kafka|redpanda|pulsar/, 'stream'],
  [/nginx|traefik|haproxy|envoy|caddy/, 'load-balancer'],
  [/elastic|opensearch|meilisearch|solr/, 'search'],
  [/minio|s3/, 'object-storage'],
  [/prometheus|grafana|datadog|jaeger|zipkin/, 'monitoring'],
  [/loki|fluent|logstash|vector/, 'logs'],
  [/keycloak|auth|oauth/, 'auth'],
  [/vault/, 'secrets'],
  [/mailhog|mailpit|smtp|postfix/, 'email'],
];

function serviceFor(image: string, name: string): string {
  const s = `${image} ${name}`.toLowerCase();
  for (const [re, id] of IMAGE_SERVICES) if (re.test(s)) return id;
  if (/worker|job|consumer|celery|sidekiq/.test(s)) return 'worker';
  if (/web|frontend|ui|next|react|vue/.test(s)) return 'browser';
  return 'container';
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_.:-]+/g, '-').slice(0, 100) || 'x';
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v && typeof v === 'object' ? Object.keys(v) : typeof v === 'string' ? [v] : []);

export function composeToDraft(text: string, title = 'Docker Compose'): Draft {
  const doc = parse(text, { maxAliasCount: 100 }) as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') throw new Error('Not a docker-compose file');
  const services = (doc.services ?? {}) as Record<string, Record<string, unknown>>;
  if (typeof services !== 'object' || Object.keys(services).length === 0) throw new Error('No services found');
  const names = Object.keys(services);
  const networks = [...new Set(names.flatMap((n) => list(services[n]?.networks)))];
  const project = `compose-${safe(String(doc.name ?? 'project'))}`;
  const draft: Draft = {
    title,
    layout: 'flow',
    containers: [{ id: project, kind: 'custom', label: String(doc.name ?? title), layout: 'flow' }],
    nodes: [],
    edges: [],
    annotations: [],
    remove: [],
  };
  if (networks.length > 1) for (const net of networks) draft.containers.push({ id: `net-${safe(net)}`, kind: 'subnet', label: net, parent: project, layout: 'flow-down' });
  const nodes: DraftNode[] = [];
  const edges: DraftEdge[] = [];
  const nodeId = (n: string) => `svc-${safe(n)}`;
  for (const name of names) {
    const svc = services[name] ?? {};
    const image = String(svc.image ?? (svc.build ? `build:${name}` : name));
    const nets = list(svc.networks);
    const parent = networks.length > 1 && nets[0] ? `net-${safe(nets[0])}` : project;
    nodes.push({ id: nodeId(name), service: serviceFor(image, name), label: `${name}\n${image.split('@')[0]}`, parent });
    for (const dep of list(svc.depends_on)) if (names.includes(dep)) edges.push({ from: nodeId(name), to: nodeId(dep) });
    const env = JSON.stringify(svc.environment ?? '');
    for (const other of names) {
      if (other === name || edges.some((e) => e.from === nodeId(name) && e.to === nodeId(other))) continue;
      if (new RegExp(`[/@:"=]${other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:/"]`).test(env)) edges.push({ from: nodeId(name), to: nodeId(other), dashed: false });
    }
    const ports = list(svc.ports);
    if (ports.length) {
      const client = `client-${safe(name)}`;
      nodes.push({ id: client, service: 'user', label: 'Client' });
      edges.push({ from: client, to: nodeId(name), label: ports.map((p) => p.split(':').slice(-2, -1)[0] ?? p).join(', ') });
    }
    for (const vol of list(svc.volumes)) {
      const source = vol.split(':')[0] ?? '';
      if (!source || source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) continue;
      const vid = `vol-${safe(source)}`;
      if (!nodes.some((n) => n.id === vid)) nodes.push({ id: vid, service: 'disk', label: source, parent: project });
      edges.push({ from: nodeId(name), to: vid, dashed: true });
    }
  }
  draft.nodes = nodes;
  draft.edges = edges;
  return draft;
}
