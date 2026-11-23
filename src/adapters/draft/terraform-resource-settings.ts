import type { ResourceSettings, SettingValues } from '../../domain';
import { array, blocks, record, text, texts } from './infrastructure-values';
import { safeSetting, settingFields, settingsSection } from './resource-settings';
import { chartValues } from './terraform-chart-values';
import type { TerraformResource } from './terraform-resource';
import { TERRAFORM_FIELDS } from './terraform-setting-fields';

function jsonValue(value: unknown) {
  if (typeof value !== 'string' || value.length > 262_144) return undefined;
  try {
    return safeSetting(JSON.parse(value));
  } catch {
    return undefined;
  }
}

const KAFKA_PROPERTY = /^(?:auto\.create\.topics\.enable|delete\.topic\.enable|default\.replication\.factor|min\.insync\.replicas|num\.partitions|num\.network\.threads|num\.io\.threads|num\.replica\.fetchers|unclean\.leader\.election\.enable|log\.(?:retention|segment|cleanup)\.[a-z.]+|offsets\.topic\.replication\.factor|transaction\.state\.log\.(?:min\.isr|replication\.factor))$/;

function kafkaSettings(properties: string) {
  return Object.fromEntries(properties.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*([\w.]+)\s*=\s*(.*)$/.exec(line);
    return match && KAFKA_PROPERTY.test(match[1]!) ? [[match[1]!, match[2]!]] : [];
  }));
}

function resourceSection(resource: TerraformResource): ResourceSettings | undefined {
  const fields = TERRAFORM_FIELDS[resource.type];
  if (!fields) return undefined;
  const mask = resource.sensitive_values ?? {};
  const raw = resource.values ?? {};
  const inputs = { ...raw };
  for (const key of ['event_pattern', 'filter_policy', 'policy']) {
    if (mask[key]) continue;
    const parsed = jsonValue(inputs[key]);
    if (parsed !== undefined) inputs[key] = parsed;
  }
  if (resource.type === 'aws_msk_configuration' && !mask.server_properties && typeof raw.server_properties === 'string') {
    inputs.server_properties = kafkaSettings(raw.server_properties);
  }
  const values = { ...settingFields(inputs, `${fields} tags`, mask) };
  if (resource.type === 'helm_release') {
    const masked = Array.isArray(mask.values) ? mask.values : [];
    const charts = mask.values === true ? [] : chartValues(array(raw.values).filter((_, index) => !masked[index]));
    if (charts.length) values.values = charts;
  }
  return settingsSection(resource.type, values, resource.address);
}

type ResourceIndex = (type: string, value: unknown) => TerraformResource | undefined;

function resourceIndex(resources: readonly TerraformResource[]): ResourceIndex {
  const index = new Map<string, TerraformResource | null>();
  for (const resource of resources) {
    if (resource.mode === 'data') continue;
    for (const key of new Set([resource.address, ...['id', 'arn', 'name', 'bucket'].flatMap((field) =>
      resource.sensitive_values?.[field] ? [] : texts(resource.values?.[field]))])) {
      const lookup = `${resource.type}\0${key}`;
      index.set(lookup, index.has(lookup) ? null : resource);
    }
  }
  return (type, value) => typeof value === 'string' ? index.get(`${type}\0${value}`) ?? undefined : undefined;
}

const OWNERS: Record<string, readonly [key: string, owner: string][]> = {
  aws_acm_certificate_validation: [['certificate_arn', 'aws_acm_certificate']],
  aws_route_table: [['vpc_id', 'aws_vpc']],
  aws_route_table_association: [['subnet_id', 'aws_subnet']],
  aws_vpc_endpoint_route_table_association: [['vpc_endpoint_id', 'aws_vpc_endpoint']],
  aws_lb_listener: [['load_balancer_arn', 'aws_lb'], ['load_balancer_arn', 'aws_alb']],
  aws_alb_listener: [['load_balancer_arn', 'aws_alb'], ['load_balancer_arn', 'aws_lb']],
  aws_lb_target_group: [['load_balancer_arns', 'aws_lb'], ['load_balancer_arns', 'aws_alb']],
  aws_eks_access_entry: [['cluster_name', 'aws_eks_cluster']],
  aws_eks_access_policy_association: [['cluster_name', 'aws_eks_cluster']],
  aws_eks_addon: [['cluster_name', 'aws_eks_cluster']],
  aws_eks_pod_identity_association: [['cluster_name', 'aws_eks_cluster']],
  aws_ecr_lifecycle_policy: [['repository', 'aws_ecr_repository']],
  aws_rds_cluster_instance: [['cluster_identifier', 'aws_rds_cluster']],
  aws_docdb_cluster_instance: [['cluster_identifier', 'aws_docdb_cluster']],
  aws_cloudwatch_event_target: [['rule', 'aws_cloudwatch_event_rule']],
  aws_sns_topic_subscription: [['topic_arn', 'aws_sns_topic']],
};

const PARAMETER_GROUPS: Record<string, readonly [field: string, type: string]> = {
  aws_db_instance: ['parameter_group_name', 'aws_db_parameter_group'],
  aws_rds_cluster: ['db_cluster_parameter_group_name', 'aws_rds_cluster_parameter_group'],
  aws_docdb_cluster: ['db_cluster_parameter_group_name', 'aws_docdb_cluster_parameter_group'],
  aws_elasticache_replication_group: ['parameter_group_name', 'aws_elasticache_parameter_group'],
  aws_elasticache_cluster: ['parameter_group_name', 'aws_elasticache_parameter_group'],
};

export function terraformResourceSettings(resources: readonly TerraformResource[]) {
  const lookup = resourceIndex(resources);
  const related = new Map<string, Map<string, ResourceSettings>>();
  const add = (owner: TerraformResource | undefined, section: ResourceSettings | undefined) => {
    if (!owner || !section?.source || owner.address === section.source) return;
    const sections = related.get(owner.address) ?? new Map();
    sections.set(section.source, section);
    related.set(owner.address, sections);
  };
  const sectionOf = new Map(resources.flatMap((r) => {
    const section = resourceSection(r);
    return section ? [[r.address, section] as const] : [];
  }));
  const listenerOwner = (resource: TerraformResource | undefined) =>
    lookup('aws_lb', resource?.values?.load_balancer_arn) ?? lookup('aws_alb', resource?.values?.load_balancer_arn);

  for (const resource of resources) {
    const v = resource.values ?? {};
    const section = sectionOf.get(resource.address);
    for (const [field, type] of OWNERS[resource.type] ?? []) {
      for (const value of texts(v[field])) add(lookup(type, value), section);
    }
    if (resource.type.startsWith('aws_s3_bucket_')) add(lookup('aws_s3_bucket', v.bucket), section);
    if (['aws_route', 'aws_route_table_association'].includes(resource.type)) {
      const table = lookup('aws_route_table', v.route_table_id);
      add(lookup('aws_vpc', table?.values?.vpc_id), section);
    }
    if (['aws_lb_listener_certificate', 'aws_lb_listener_rule'].includes(resource.type)) {
      add(listenerOwner(lookup('aws_lb_listener', v.listener_arn) ?? lookup('aws_alb_listener', v.listener_arn)), section);
    }
    if (['aws_lb_listener', 'aws_alb_listener', 'aws_lb_listener_rule'].includes(resource.type)) {
      const listener = resource.type === 'aws_lb_listener_rule'
        ? lookup('aws_lb_listener', v.listener_arn) ?? lookup('aws_alb_listener', v.listener_arn) : resource;
      const owner = listenerOwner(listener);
      for (const action of blocks(v.default_action ?? v.action)) {
        const forward = blocks(action.forward).flatMap((entry) => blocks(entry.target_group));
        for (const arn of [action.target_group_arn, ...forward.map((entry) => entry.arn)]) {
          const target = lookup('aws_lb_target_group', arn);
          if (target) add(owner, sectionOf.get(target.address));
        }
      }
    }
    if (resource.type === 'aws_cloudwatch_log_group' && typeof v.name === 'string') {
      const cluster = /^\/aws\/eks\/([^/]+)\/cluster$/.exec(v.name)?.[1];
      add(lookup('aws_eks_cluster', cluster), section);
    }
    const group = PARAMETER_GROUPS[resource.type];
    if (group) {
      const parameterGroup = lookup(group[1], v[group[0]]);
      if (parameterGroup) add(resource, sectionOf.get(parameterGroup.address));
    }
    if (resource.type === 'aws_msk_cluster') {
      const config = lookup('aws_msk_configuration', blocks(v.configuration_info)[0]?.arn);
      if (config) add(resource, sectionOf.get(config.address));
    }
    if (resource.type !== 'aws_cloudfront_distribution') continue;
    for (const origin of blocks(v.origin)) {
      const oac = lookup('aws_cloudfront_origin_access_control', origin.origin_access_control_id);
      if (oac) add(resource, sectionOf.get(oac.address));
    }
    for (const [key, behaviors] of [['default', v.default_cache_behavior], ['ordered', v.ordered_cache_behavior]] as const) {
      for (const behavior of blocks(behaviors)) {
        for (const association of blocks(behavior.function_association)) {
          const fn = lookup('aws_cloudfront_function', association.function_arn);
          const scope = settingFields({ distribution: resource.address, behavior: key, path_pattern: behavior.path_pattern, event_type: association.event_type },
            'distribution behavior path_pattern event_type');
          const source = `${resource.address} ${String(behavior.path_pattern ?? key)} ${String(association.event_type ?? '')}`.trim();
          add(fn, settingsSection('CloudFront Function association', scope, source));
        }
      }
    }
  }
  return (resource: TerraformResource, references: readonly string[]): ResourceSettings[] => {
    const own = sectionOf.get(resource.address);
    const relations = settingFields({
      depends_on: resource.depends_on,
      expression_references: references.length ? [...new Set(references)] : undefined,
    }, 'depends_on expression_references');
    return [
      ...(own ? [own] : []),
      ...(related.get(resource.address)?.values() ?? []),
      ...((relations && TERRAFORM_FIELDS[resource.type]) ? [{ kind: 'Terraform references', values: relations }] : []),
    ].slice(0, 1024);
  };
}

export function terraformProjectSettings(input: Record<string, unknown>): ResourceSettings | undefined {
  const configuration = record(input.configuration);
  const root = record(configuration.root_module);
  const providers = Object.entries(record(configuration.provider_config)).flatMap(([name, provider]) => {
    const value = settingFields(provider, 'name full_name alias module_address version_constraint');
    return value ? [{ key: name, ...value }] : [];
  });
  const modules = Object.entries(record(root.module_calls)).flatMap(([name, module]) => {
    const value = settingFields(module, 'source resolved_source version_constraint count_expression for_each_expression');
    return value ? [{ name, ...value }] : [];
  });
  const values: Record<string, SettingValues[string]> = {
    ...(providers.length ? { providers } : {}),
    ...(modules.length ? { modules } : {}),
  };
  const version = text(input.terraform_version);
  if (version) values.terraform_version = version;
  return settingsSection('Terraform', values);
}
