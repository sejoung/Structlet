import { WAF_IP_VERSIONS, type WafDetails, type WafIpSetDetails, type WafRuleDetails, type WafStatement } from '../../domain';
import { block, blocks, boolean, natural, present, text, texts } from './infrastructure-values';
import type { TerraformResource } from './terraform-resource';

const ACTIONS = ['allow', 'block', 'count', 'captcha', 'challenge'] as const;
const DEFAULT_ACTIONS = ['allow', 'block'] as const;
const OVERRIDES = ['none', 'count'] as const;

function action<const A extends readonly string[]>(value: unknown, allowed: A): A[number] | undefined {
  return allowed.find((key) => value === key || blocks(value).some((entry) => blocks(entry[key]).length));
}

function statementDetails(kind: string, v: Record<string, unknown>, depth: number): WafStatement {
  const children = statements(v.statement, depth + 1);
  const scopeDown = statements(v.scope_down_statement, depth + 1);
  const actionOverrides = blocks(v.rule_action_override).flatMap((entry) => {
    const name = text(entry.name);
    const chosen = action(entry.action_to_use, ACTIONS);
    return name && chosen ? [{ name, action: chosen }] : [];
  });
  const codes = texts(v.country_codes);
  return {
    kind,
    reference: text(v.arn),
    name: text(v.name),
    vendor: text(v.vendor_name),
    version: text(v.version),
    limit: natural(v.limit, 1),
    windowSeconds: natural(v.evaluation_window_sec, 1),
    aggregateKeyType: text(v.aggregate_key_type),
    countryCodes: codes.length ? codes : undefined,
    actionOverrides: actionOverrides.length ? actionOverrides : undefined,
    children: children.length ? children : undefined,
    scopeDown: scopeDown.length ? scopeDown : undefined,
  };
}

function statements(value: unknown, depth = 0): WafStatement[] {
  if (depth > 10) return [];
  return blocks(value).flatMap((entry) => Object.entries(entry).flatMap(([key, field]) =>
    key.endsWith('_statement') ? blocks(field).map((v) => statementDetails(key.slice(0, -10), v, depth)) : []));
}

function visibility(value: unknown): WafDetails['visibility'] {
  const v = block(value);
  return present({
    metricName: text(v.metric_name),
    cloudWatchMetricsEnabled: boolean(v.cloudwatch_metrics_enabled),
    sampledRequestsEnabled: boolean(v.sampled_requests_enabled),
  });
}

function rule(v: Record<string, unknown>, group = false): WafRuleDetails | undefined {
  const name = text(group ? v.rule_name : v.name);
  const priority = natural(v.priority);
  if (!name || priority === undefined) return undefined;
  const conditions = group ? statements([{
    managed_rule_group_statement: v.managed_rule_group,
    rule_group_reference_statement: v.rule_group_reference,
  }]) : statements(v.statement);
  return {
    name, priority, action: action(v.action, ACTIONS), overrideAction: action(v.override_action, OVERRIDES),
    statements: conditions.length ? conditions : undefined, visibility: visibility(v.visibility_config),
  };
}

function knownIpSets(resources: readonly TerraformResource[]): Map<string, WafIpSetDetails> {
  const sets = new Map<string, WafIpSetDetails>();
  for (const r of resources) {
    if (r.type !== 'aws_wafv2_ip_set') continue;
    const v = r.values ?? {};
    const reference = r.sensitive_values?.arn ? undefined : text(v.arn);
    if (!reference) continue;
    sets.set(reference, {
      reference,
      name: text(v.name),
      scope: text(v.scope),
      ipAddressVersion: WAF_IP_VERSIONS.find((version) => version === v.ip_address_version),
      addresses: !r.sensitive_values?.addresses && Array.isArray(v.addresses) ? texts(v.addresses) : undefined,
    });
  }
  return sets;
}

function referencedIpSets(rules: readonly WafRuleDetails[], known: ReadonlyMap<string, WafIpSetDetails>): WafIpSetDetails[] {
  const references = new Set<string>();
  const visit = (items: readonly WafStatement[] | undefined) => {
    for (const item of items ?? []) {
      if (item.kind === 'ip_set_reference' && item.reference) references.add(item.reference);
      visit(item.children);
      visit(item.scopeDown);
    }
  };
  for (const rule of rules) visit(rule.statements);
  return [...references].flatMap((reference) => known.get(reference) ?? []);
}

export function wafIndex(resources: readonly TerraformResource[]) {
  const known = knownIpSets(resources);
  const external = new Map<string, WafRuleDetails[]>();
  for (const r of resources) {
    const group = r.type === 'aws_wafv2_web_acl_rule_group_association';
    if (!group && r.type !== 'aws_wafv2_web_acl_rule') continue;
    const arn = r.sensitive_values?.web_acl_arn ? undefined : text(r.values?.web_acl_arn);
    const parsed = rule(r.values ?? {}, group);
    if (!arn || !parsed) continue;
    const items = external.get(arn) ?? [];
    items.push(parsed);
    external.set(arn, items);
  }
  return (r: TerraformResource): WafDetails | undefined => {
    if (r.type !== 'aws_wafv2_web_acl') return undefined;
    const v = r.values ?? {};
    const arn = text(v.arn);
    const indexed = new Map<string, WafRuleDetails>();
    for (const item of r.sensitive_values?.rule === true ? [] : blocks(v.rule)) {
      const parsed = rule(item);
      if (parsed) indexed.set(parsed.name, parsed);
    }
    for (const item of external.get(arn ?? '') ?? []) indexed.set(item.name, item);
    const rules = [...indexed.values()].sort((a, b) => a.priority - b.priority);
    const ipSets = referencedIpSets(rules, known);
    return present({
      id: arn ?? text(v.id), name: text(v.name), scope: text(v.scope), defaultAction: action(v.default_action, DEFAULT_ACTIONS),
      visibility: visibility(v.visibility_config),
      rules: rules.length ? rules : undefined,
      ipSets: ipSets.length ? ipSets : undefined,
    });
  };
}
