import type { Draft, DraftContainer, DraftEdge, DraftNode } from './draft-format';
import { ec2InstanceType, terraformNodeSpecs } from './terraform-specs';


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
  ecr_repository: 'aws.ecr', ecrpublic_repository: 'aws.ecr', docdb_cluster: 'aws.documentdb', docdb_instance: 'aws.documentdb',
  msk_cluster: 'aws.msk', msk_serverless_cluster: 'aws.msk', ssm_document: 'aws.systems-manager', ssm_parameter: 'aws.systems-manager',
  ssm_association: 'aws.systems-manager', acm_certificate: 'aws.acm', vpc_endpoint: 'aws.vpc-endpoint',
};

const GOOGLE: Record<string, string> = {
  compute_instance: 'gcp.compute-engine', compute_instance_group_manager: 'gcp.compute-engine', compute_region_instance_group_manager: 'gcp.compute-engine',
  container_cluster: 'gcp.gke', cloud_run_service: 'gcp.cloud-run', cloud_run_v2_service: 'gcp.cloud-run', cloud_run_v2_job: 'gcp.cloud-run',
  cloudfunctions_function: 'gcp.cloud-functions', cloudfunctions2_function: 'gcp.cloud-functions', app_engine_application: 'gcp.app-engine',
  sql_database_instance: 'gcp.cloud-sql', spanner_instance: 'gcp.spanner', alloydb_cluster: 'gcp.alloydb', firestore_database: 'gcp.firestore',
  bigtable_instance: 'gcp.bigtable', redis_instance: 'gcp.memorystore', storage_bucket: 'gcp.cloud-storage', filestore_instance: 'gcp.filestore',
  pubsub_topic: 'gcp.pubsub', pubsub_subscription: 'gcp.pubsub', cloud_tasks_queue: 'gcp.cloud-tasks', cloud_scheduler_job: 'gcp.cloud-scheduler',
  workflows_workflow: 'gcp.workflows', eventarc_trigger: 'gcp.eventarc', api_gateway_gateway: 'gcp.api-gateway', apigee_organization: 'gcp.apigee',
  compute_global_forwarding_rule: 'gcp.cloud-load-balancing', compute_forwarding_rule: 'gcp.cloud-load-balancing', compute_backend_bucket: 'gcp.cloud-cdn',
  dns_managed_zone: 'gcp.cloud-dns', compute_router_nat: 'gcp.cloud-nat', compute_security_policy: 'gcp.cloud-armor', secret_manager_secret: 'gcp.secret-manager',
  kms_key_ring: 'gcp.kms', kms_crypto_key: 'gcp.kms', bigquery_dataset: 'gcp.bigquery', dataflow_job: 'gcp.dataflow', vertex_ai_endpoint: 'gcp.vertex-ai',
  logging_project_sink: 'gcp.cloud-logging', monitoring_alert_policy: 'gcp.cloud-monitoring',
};

const AZURERM: Record<string, string> = {
  linux_virtual_machine: 'azure.vm', windows_virtual_machine: 'azure.vm', virtual_machine: 'azure.vm', linux_virtual_machine_scale_set: 'azure.vmss',
  windows_virtual_machine_scale_set: 'azure.vmss', orchestrated_virtual_machine_scale_set: 'azure.vmss', kubernetes_cluster: 'azure.aks', container_app: 'azure.container-apps',
  linux_web_app: 'azure.app-service', windows_web_app: 'azure.app-service', app_service: 'azure.app-service', linux_function_app: 'azure.functions',
  windows_function_app: 'azure.functions', function_app: 'azure.functions', mssql_database: 'azure.sql-database', sql_database: 'azure.sql-database',
  postgresql_flexible_server: 'azure.postgresql', postgresql_server: 'azure.postgresql', mysql_flexible_server: 'azure.mysql', mysql_server: 'azure.mysql',
  cosmosdb_account: 'azure.cosmos-db', redis_cache: 'azure.cache-redis', storage_account: 'azure.storage', storage_share: 'azure.files',
  servicebus_namespace: 'azure.service-bus', servicebus_queue: 'azure.service-bus', servicebus_topic: 'azure.service-bus', eventhub_namespace: 'azure.event-hubs',
  eventhub: 'azure.event-hubs', eventgrid_topic: 'azure.event-grid', logic_app_workflow: 'azure.logic-apps', api_management: 'azure.api-management',
  application_gateway: 'azure.application-gateway', lb: 'azure.load-balancer', cdn_frontdoor_profile: 'azure.front-door', frontdoor: 'azure.front-door',
  dns_zone: 'azure.dns', nat_gateway: 'azure.nat-gateway', firewall: 'azure.firewall', key_vault: 'azure.key-vault', user_assigned_identity: 'azure.managed-identity',
  log_analytics_workspace: 'azure.log-analytics', application_insights: 'azure.application-insights', monitor_action_group: 'azure.monitor',
  synapse_workspace: 'azure.synapse', machine_learning_workspace: 'azure.machine-learning', cognitive_account: 'azure.openai',
};

const NETWORKS: Record<string, 'vpc' | 'subnet'> = {
  aws_vpc: 'vpc', aws_subnet: 'subnet', google_compute_network: 'vpc', google_compute_subnetwork: 'subnet', azurerm_virtual_network: 'vpc', azurerm_subnet: 'subnet',
};

const PROVIDERS: Record<string, string> = { aws: 'AWS', google: 'Google Cloud', azurerm: 'Azure' };

interface Resource {
  address: string;
  type: string;
  name: string;
  mode?: string;
  values: Record<string, unknown>;
  depends_on?: string[];
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_.:-]+/g, '-').slice(0, 120);

function collect(module: unknown, out: Resource[]): void {
  if (!module || typeof module !== 'object') return;
  const m = module as { resources?: Resource[]; child_modules?: unknown[] };
  for (const r of m.resources ?? []) out.push(r);
  for (const child of m.child_modules ?? []) collect(child, out);
}

function serviceFor(type: string): string | null {
  const [provider, ...rest] = type.split('_');
  const short = rest.join('_');
  if (provider === 'aws') return AWS[short] ?? null;
  if (provider === 'google') return GOOGLE[short] ?? null;
  if (provider === 'azurerm') return AZURERM[short] ?? null;
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
  const all: Resource[] = [];
  collect((json.values as { root_module?: unknown } | undefined)?.root_module, all);
  collect((json.planned_values as { root_module?: unknown } | undefined)?.root_module, all);
  const resources = all.filter((r) => r.mode !== 'data');
  if (resources.length === 0) throw new Error('No resources found. Use the output of `terraform show -json`.');
  const ec2Types = new Map(all.flatMap((r) => {
    const specs = r.mode === 'data' && r.type === 'aws_ec2_instance_type' ? ec2InstanceType(r.values ?? {}) : undefined;
    return specs ? [[specs.instanceType, specs] as const] : [];
  }));
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
    else nodes.push({ id: key, service: service!, label, specs: terraformNodeSpecs(r.type, r.values ?? {}, ec2Types) });
  }
  const providerArea = (p: string) => `tf-cloud-${p}`;
  const strings = (v: unknown, depth = 0): string[] =>
    depth > 6 ? [] : typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap((x) => strings(x, depth + 1)) : v && typeof v === 'object' ? Object.values(v).flatMap((x) => strings(x, depth + 1)) : [];
  const resourceOf = new Map(resources.map((r) => [r.address, r]));
  const anyById = new Map<string, string>();
  for (const r of resources) for (const attr of ['id', 'arn', 'self_link']) if (typeof r.values?.[attr] === 'string') anyById.set(r.values[attr] as string, r.address);
  for (const p of providers) containers.unshift({ id: providerArea(p), kind: 'cloud', label: PROVIDERS[p] ?? p, layout: 'flow' });
  const networkKind = (address: string) => NETWORKS[resourceOf.get(address)?.type ?? ''];
  const vnetByName = new Map(resources.filter((r) => NETWORKS[r.type] === 'vpc' && typeof r.values?.name === 'string').map((r) => [String(r.values.name), r.address]));
  const parentOf = (r: Resource): string => {
    const v = r.values ?? {};
    const direct = [...strings(v.subnet_id), ...strings(v.subnet_ids), ...strings(v.subnets), ...strings(v.vpc_config), ...strings(v.subnetwork), ...strings(v.network_interface), ...strings(v.ip_configuration), ...strings(v.network_profile), ...strings(v.default_node_pool), ...strings(v.vpc_id), ...strings(v.network), ...strings(v.virtual_network_id)];
    const viaInterfaces = strings(v.network_interface_ids).flatMap((x) => {
      const nic = resourceOf.get(anyById.get(x) ?? '');
      return nic ? strings(nic.values) : [];
    });
    const refs = [...direct, ...viaInterfaces]
      .map((x) => byId.get(x))
      .filter((a): a is string => !!a && a !== r.address && !!networkKind(a));
    const owner = refs.find((a) => networkKind(a) === 'subnet') ?? refs.find((a) => networkKind(a) === 'vpc') ?? (typeof v.virtual_network_name === 'string' ? vnetByName.get(v.virtual_network_name) : undefined);
    return owner ? drawn.get(owner)! : providerArea(r.type.split('_')[0]!);
  };
  for (const c of containers) {
    const r = [...drawn].find(([, k]) => k === c.id)?.[0];
    if (r) c.parent = parentOf(resourceOf.get(r)!) === c.id ? providerArea(resourceOf.get(r)!.type.split('_')[0]!) : parentOf(resourceOf.get(r)!);
  }
  for (const n of nodes) {
    const r = [...drawn].find(([, k]) => k === n.id)![0];
    n.parent = parentOf(resourceOf.get(r)!);
  }
  const containment = new Set(['vpc_id', 'subnet_id', 'subnet_ids', 'subnets', 'vpc_config', 'subnetwork', 'network', 'virtual_network_name', 'virtual_network_id', 'network_interface', 'network_interface_ids', 'ip_configuration', 'network_profile', 'default_node_pool']);
  const edges: DraftEdge[] = [];
  const add = (from: string, to: string) => {
    const a = drawn.get(from);
    const b = drawn.get(to);
    if (!a || !b || a === b || NETWORKS[resourceOf.get(to)!.type] || NETWORKS[resourceOf.get(from)!.type]) return;
    if (!edges.some((e) => e.from === a && e.to === b)) edges.push({ from: a, to: b });
  };
  for (const r of resources) {
    const named = (k: string) => strings(r.values?.[k]).map((x) => byId.get(x)).find(Boolean);
    if (!drawn.has(r.address)) {
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
