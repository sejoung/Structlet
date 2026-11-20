import type { Draft, DraftContainer, DraftEdge, DraftNode } from './draft-format';

/**
 * `terraform show -json` output (state or plan) → draft. HCL is not parsed:
 * the JSON form has resolved modules, values and references.
 * Networks become nested areas, mapped resources become nodes, and edges come
 * from configuration references (plan), `depends_on` (state) or attribute
 * values that name another drawn resource.
 */

const AWS: Record<string, string> = {
  instance: 'aws.ec2', launch_template: 'aws.ec2', autoscaling_group: 'aws.ec2', ecs_service: 'aws.ecs', ecs_cluster: 'aws.ecs',
  eks_cluster: 'aws.eks', lambda_function: 'aws.lambda', s3_bucket: 'aws.s3', ebs_volume: 'aws.ebs', efs_file_system: 'aws.efs',
  db_instance: 'aws.rds', rds_cluster: 'aws.aurora', dynamodb_table: 'aws.dynamodb', elasticache_cluster: 'aws.elasticache',
  elasticache_replication_group: 'aws.elasticache', sqs_queue: 'aws.sqs', sns_topic: 'aws.sns', cloudwatch_event_bus: 'aws.eventbridge',
  cloudwatch_event_rule: 'aws.eventbridge', kinesis_stream: 'aws.kinesis', sfn_state_machine: 'aws.stepfunctions',
  api_gateway_rest_api: 'aws.apigateway', apigatewayv2_api: 'aws.apigateway', cloudfront_distribution: 'aws.cloudfront',
  route53_zone: 'aws.route53', lb: 'aws.elb', alb: 'aws.elb', elb: 'aws.elb', nat_gateway: 'aws.natgateway', internet_gateway: 'aws.igw',
  cognito_user_pool: 'aws.cognito', secretsmanager_secret: 'aws.secretsmanager', kms_key: 'aws.kms', wafv2_web_acl: 'aws.waf',
  cloudwatch_log_group: 'aws.cloudwatch', opensearch_domain: 'aws.opensearch', elasticsearch_domain: 'aws.opensearch',
  redshift_cluster: 'aws.redshift', sagemaker_endpoint: 'aws.sagemaker', ses_domain_identity: 'aws.ses',
};

const GENERIC: [RegExp, string][] = [
  [/kubernetes_cluster|container_cluster|aks|gke/, 'cluster'],
  [/function/, 'function'],
  [/redis|memorystore|cache/, 'cache'],
  [/sql|database|postgres|mysql|spanner|cosmosdb/, 'database'],
  [/storage_bucket|storage_account|blob/, 'object-storage'],
  [/pubsub_topic|servicebus_topic|eventgrid/, 'topic'],
  [/pubsub_subscription|servicebus_queue|queue/, 'queue'],
  [/compute_instance|virtual_machine|vm_/, 'server'],
  [/load_balancer|forwarding_rule|application_gateway|lb/, 'load-balancer'],
  [/dns/, 'dns'],
  [/key_vault|secret/, 'secrets'],
  [/container_app|cloud_run|app_service|web_app/, 'container'],
];

const NETWORKS: Record<string, 'vpc' | 'subnet'> = {
  aws_vpc: 'vpc', aws_subnet: 'subnet', google_compute_network: 'vpc', google_compute_subnetwork: 'subnet', azurerm_virtual_network: 'vpc', azurerm_subnet: 'subnet',
};

const PROVIDERS: Record<string, string> = { aws: 'AWS', google: 'Google Cloud', azurerm: 'Azure' };

interface Resource {
  address: string;
  type: string;
  name: string;
  values: Record<string, unknown>;
  depends_on?: string[];
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_.:-]+/g, '-').slice(0, 120);

function collect(module: unknown, out: Resource[]): void {
  if (!module || typeof module !== 'object') return;
  const m = module as { resources?: Resource[]; child_modules?: unknown[] };
  for (const r of m.resources ?? []) if ((r as { mode?: string }).mode !== 'data') out.push(r);
  for (const child of m.child_modules ?? []) collect(child, out);
}

function serviceFor(type: string): string | null {
  const [provider, ...rest] = type.split('_');
  const short = rest.join('_');
  if (provider === 'aws') return AWS[short] ?? null;
  for (const [re, id] of GENERIC) if (re.test(short)) return id;
  return null;
}

function references(config: unknown): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  const walk = (module: unknown, prefix: string) => {
    const m = module as { resources?: { address: string; expressions?: unknown }[]; module_calls?: Record<string, { module?: unknown }> } | undefined;
    for (const r of m?.resources ?? []) {
      const found = new Set<string>();
      const scan = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(scan);
        else if (v && typeof v === 'object') {
          for (const [k, x] of Object.entries(v)) {
            if (k === 'references' && Array.isArray(x)) for (const ref of x) found.add(prefix + String(ref).split('.').slice(0, 2).join('.'));
            else scan(x);
          }
        }
      };
      scan(r.expressions);
      refs.set(prefix + r.address, [...found]);
    }
    for (const [name, call] of Object.entries(m?.module_calls ?? {})) walk(call.module, `${prefix}module.${name}.`);
  };
  walk((config as { root_module?: unknown } | undefined)?.root_module, '');
  return refs;
}

export function terraformToDraft(text: string, title = 'Terraform'): Draft {
  const json = JSON.parse(text) as Record<string, unknown>;
  const resources: Resource[] = [];
  collect((json.values as { root_module?: unknown } | undefined)?.root_module, resources);
  collect((json.planned_values as { root_module?: unknown } | undefined)?.root_module, resources);
  if (resources.length === 0) throw new Error('No resources found. Use the output of `terraform show -json`.');
  const refs = references(json.configuration);
  const byId = new Map<string, string>();
  const drawn = new Map<string, string>();
  const containers: DraftContainer[] = [];
  const nodes: DraftNode[] = [];
  const providers = new Set<string>();
  for (const r of resources) {
    const key = safe(`tf-${r.address}`);
    const provider = r.type.split('_')[0]!;
    const kind = NETWORKS[r.type];
    const service = kind ? null : serviceFor(r.type);
    if (!kind && !service) continue;
    drawn.set(r.address, key);
    for (const attr of ['id', 'arn', 'self_link']) {
      const v = r.values?.[attr];
      if (typeof v === 'string' && v.length > 3) byId.set(v, r.address);
    }
    providers.add(provider);
    const label = `${String(r.values?.tags && (r.values.tags as Record<string, unknown>).Name ? (r.values.tags as Record<string, unknown>).Name : r.name)}\n${r.type}`;
    if (kind) containers.push({ id: key, kind, label: `${kind === 'vpc' ? 'VPC' : 'Subnet'} · ${label.split('\n')[0]}`, layout: 'flow' });
    else nodes.push({ id: key, service: service!, label });
  }
  const providerArea = (p: string) => `tf-cloud-${p}`;
  for (const p of providers) containers.unshift({ id: providerArea(p), kind: 'cloud', label: PROVIDERS[p] ?? p, layout: 'flow' });
  const parentOf = (r: Resource): string => {
    const v = r.values ?? {};
    const subnet = [v.subnet_id, ...(Array.isArray(v.subnet_ids) ? v.subnet_ids : []), ...(Array.isArray(v.subnets) ? v.subnets : []), (v.vpc_config as { subnet_ids?: unknown[] }[] | undefined)?.[0]?.subnet_ids?.[0], v.subnetwork, v.network]
      .find((x) => typeof x === 'string' && byId.has(x));
    const vpc = [v.vpc_id, v.virtual_network_name, v.network].find((x) => typeof x === 'string' && byId.has(x));
    const owner = (subnet ?? vpc) as string | undefined;
    return owner ? drawn.get(byId.get(owner)!)! : providerArea(r.type.split('_')[0]!);
  };
  const resourceOf = new Map(resources.map((r) => [r.address, r]));
  for (const c of containers) {
    const r = [...drawn].find(([, k]) => k === c.id)?.[0];
    if (r) c.parent = parentOf(resourceOf.get(r)!) === c.id ? providerArea(resourceOf.get(r)!.type.split('_')[0]!) : parentOf(resourceOf.get(r)!);
  }
  for (const n of nodes) {
    const r = [...drawn].find(([, k]) => k === n.id)![0];
    n.parent = parentOf(resourceOf.get(r)!);
  }
  const containment = new Set(['vpc_id', 'subnet_id', 'subnet_ids', 'subnets', 'vpc_config', 'subnetwork', 'network', 'virtual_network_name']);
  const edges: DraftEdge[] = [];
  const add = (from: string, to: string) => {
    const a = drawn.get(from);
    const b = drawn.get(to);
    if (!a || !b || a === b || NETWORKS[resourceOf.get(to)!.type] || NETWORKS[resourceOf.get(from)!.type]) return;
    if (!edges.some((e) => e.from === a && e.to === b)) edges.push({ from: a, to: b });
  };
  const strings = (v: unknown, depth = 0): string[] =>
    depth > 6 ? [] : typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap((x) => strings(x, depth + 1)) : v && typeof v === 'object' ? Object.values(v).flatMap((x) => strings(x, depth + 1)) : [];
  for (const r of resources) {
    const named = (k: string) => strings(r.values?.[k]).map((x) => byId.get(x)).find(Boolean);
    if (!drawn.has(r.address)) {
      // Linking resources (event source mappings, subscriptions, triggers) become an edge between what they join.
      const from = named('event_source_arn') ?? named('topic_arn') ?? named('source_arn');
      const to = named('function_name') ?? named('endpoint') ?? named('target_arn') ?? named('arn');
      if (from && to) add(from, to);
      continue;
    }
    for (const to of [...(refs.get(r.address) ?? []), ...(r.depends_on ?? [])]) add(r.address, to);
    for (const [k, v] of Object.entries(r.values ?? {})) {
      if (containment.has(k) || k === 'id' || k === 'arn') continue;
      for (const s of strings(v)) {
        const target = byId.get(s);
        if (target) add(r.address, target);
      }
    }
  }
  return { title, layout: 'flow', containers, nodes, edges, annotations: [], remove: [] };
}
