import type { IamStatement, InfrastructureDetails, RemoteStateReference, SecurityGroupRule } from '../../domain';
import { array, integer, present, record, text, texts } from './infrastructure-values';
import { nodeTaints } from './node-provisioning';
import { cloudFrontIndex } from './terraform-cloudfront';
import { wafIndex } from './terraform-waf';

import type { TerraformResource } from './terraform-resource';

function distinct<T>(values: Iterable<T>): T[] {
  return [...new Set(values)].slice(0, 1024);
}

function rules(value: unknown, direction: SecurityGroupRule['direction'], group: string): SecurityGroupRule[] {
  return array(value).flatMap((value): SecurityGroupRule[] => {
    const v = record(value);
    const protocol = text(v.protocol) ?? text(v.ip_protocol);
    const peers = distinct([
      ...texts(v.cidr_blocks), ...texts(v.ipv6_cidr_blocks), ...texts(v.security_groups), ...texts(v.prefix_list_ids),
      ...texts(v.cidr_ipv4), ...texts(v.cidr_ipv6), ...texts(v.referenced_security_group_id), ...texts(v.prefix_list_id),
      ...texts(v.source_security_group_id), ...(v.self === true ? ['self'] : []),
    ]);
    if (!protocol || !peers.length) return [];
    const fromPort = protocol === '-1' ? undefined : integer(v.from_port);
    const toPort = protocol === '-1' ? undefined : integer(v.to_port);
    return [{ direction, protocol, peers, group, fromPort, toPort, description: text(v.description) }];
  });
}

function securityGroups(resources: readonly TerraformResource[]): Map<string, SecurityGroupRule[]> {
  const map = new Map<string, SecurityGroupRule[]>();
  const groups = new Map<string, TerraformResource>();
  for (const r of resources) {
    if (r.type !== 'aws_security_group' && r.type !== 'aws_default_security_group') continue;
    const group = text(r.values?.id);
    if (group) groups.set(group, r);
    const v = r.values ?? {};
    const items = [...rules(v.ingress, 'ingress', r.address), ...rules(v.egress, 'egress', r.address)];
    map.set(r.address, items);
  }
  for (const r of resources) {
    const direction = r.type === 'aws_vpc_security_group_ingress_rule' ? 'ingress'
      : r.type === 'aws_vpc_security_group_egress_rule' ? 'egress'
        : r.type === 'aws_security_group_rule' ? r.values?.type : undefined;
    const group = text(r.values?.security_group_id);
    if (!group || (direction !== 'ingress' && direction !== 'egress')) continue;
    const key = groups.get(group)?.address ?? group;
    const list = map.get(key) ?? [];
    list.push(...rules([r.values], direction, key));
    map.set(key, list);
  }
  for (const [group, r] of groups) map.set(group, map.get(r.address)!);
  return map;
}

function principals(value: unknown): IamStatement['principals'] {
  if (value === '*') return [{ type: '*', values: ['*'] }];
  return Object.entries(record(value)).map(([type, value]) => ({ type, values: texts(value) }));
}

function iamStatements(value: unknown, policy: string): IamStatement[] {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  const statements = record(value).Statement;
  return (Array.isArray(statements) ? statements : [statements]).flatMap((entry): IamStatement[] => {
    const s = record(entry);
    if (s.Effect !== 'Allow' && s.Effect !== 'Deny') return [];
    const conditions = Object.entries(record(s.Condition)).flatMap(([operator, conditions]) =>
      Object.entries(record(conditions)).map(([key, value]) => ({
        operator, key, values: (Array.isArray(value) ? value : [value]).flatMap((v) =>
          typeof v === 'boolean' || typeof v === 'number' ? [String(v)] : texts(v)),
      })));
    return [{
      effect: s.Effect, policy, sid: text(s.Sid),
      ...(s.Action === undefined ? {} : { actions: texts(s.Action) }),
      ...(s.NotAction === undefined ? {} : { notActions: texts(s.NotAction) }),
      ...(s.Resource === undefined ? {} : { resources: texts(s.Resource) }),
      ...(s.NotResource === undefined ? {} : { notResources: texts(s.NotResource) }),
      ...(s.Principal === undefined ? {} : { principals: principals(s.Principal) }),
      ...(s.NotPrincipal === undefined ? {} : { notPrincipals: principals(s.NotPrincipal) }),
      ...(conditions.length ? { conditions } : {}),
    }];
  });
}

function policyOn(r: TerraformResource, field = 'policy'): IamStatement[] {
  return r.sensitive_values?.[field] ? [] : iamStatements(r.values?.[field], r.address);
}

function iamIndex(resources: readonly TerraformResource[]) {
  const roles = new Map<string, TerraformResource>();
  const policies = new Map<string, TerraformResource>();
  const rolePolicies = new Map<string, TerraformResource[]>();
  const profiles = new Map<string, string>();
  for (const r of resources) {
    const v = r.values ?? {};
    if (r.type === 'aws_iam_role') {
      for (const key of [r.address, v.id, v.name, v.arn].flatMap(texts)) roles.set(key, r);
    }
    if (r.type === 'aws_iam_policy') for (const key of [r.address, v.arn].flatMap(texts)) policies.set(key, r);
    if (r.type === 'aws_iam_instance_profile' && typeof v.role === 'string') {
      for (const key of [r.address, v.id, v.name, v.arn].flatMap(texts)) profiles.set(key, v.role);
    }
    const names = r.type === 'aws_iam_policy_attachment' ? texts(v.roles)
      : ['aws_iam_role_policy', 'aws_iam_role_policy_attachment'].includes(r.type) ? texts(v.role) : [];
    for (const name of names) {
      const list = rolePolicies.get(name) ?? [];
      list.push(r);
      rolePolicies.set(name, list);
    }
  }
  return (r: TerraformResource, refs: readonly string[]) => {
    const v = r.values ?? {};
    const attached = new Set<TerraformResource>();
    const trustRoles = new Set<TerraformResource>();
    const roleKeys = [v.role, v.role_arn, v.iam_role_arn, v.node_role_arn, v.execution_role_arn, v.task_role_arn, v.iam_instance_profile, ...refs].flatMap(texts);
    for (const linked of roleKeys) {
      const key = profiles.get(linked) ?? linked;
      const role = roles.get(key);
      if (role) trustRoles.add(role);
      for (const name of [key, role?.values?.name, role?.values?.id, role?.values?.arn].flatMap(texts)) {
        for (const policy of rolePolicies.get(name) ?? []) attached.add(policy);
      }
    }
    for (const ref of refs) {
      const policy = policies.get(ref);
      if (policy) attached.add(policy);
    }
    const bindings = distinct([...attached].flatMap((policy) => texts(policy.values?.policy_arn)));
    const documents = new Set([r, ...attached, ...bindings.flatMap((key) => policies.get(key) ?? [])]);
    return {
      iamStatements: [
        ...[...documents].flatMap((policy) => policyOn(policy)),
        ...[...trustRoles].flatMap((role) => policyOn(role, 'assume_role_policy').map((s) => ({ ...s, policy: `${role.address}.assume_role_policy` }))),
      ].slice(0, 1024),
      iamPolicyRefs: bindings,
    };
  };
}

const REMOTE_REFERENCE = /^(?<address>(?:module\.[A-Za-z0-9_-]+(?:\[(?:\d+|"[^"]+")\])?\.)*data\.terraform_remote_state\.[A-Za-z0-9_-]+(?:\[(?:\d+|"[^"]+")\])?)(?:\.outputs(?:\.(?<output>[A-Za-z0-9_-]+)|\["(?<index>[A-Za-z0-9_-]+)"\]))?(?:\.|\[|$)/;

function remoteStates(r: TerraformResource, refs: readonly string[], datasets: Map<string, TerraformResource>): RemoteStateReference[] {
  const captured = new Map<string, { backend?: string; outputs: Set<string> }>();
  for (const ref of [...refs, ...(r.depends_on ?? [])]) {
    const match = REMOTE_REFERENCE.exec(ref)?.groups;
    const address = match?.address;
    if (!address) continue;
    const path = address.startsWith('data.') && r.address.startsWith('module.')
      ? r.address.slice(0, r.address.lastIndexOf(`.${r.type}.`) + 1) + address : address;
    const dataset = datasets.get(path) ?? datasets.get(address);
    const details = captured.get(path) ?? { backend: dataset?.sensitive_values?.backend ? undefined : text(dataset?.values?.backend), outputs: new Set<string>() };
    const output = match.output ?? match.index;
    if (output) details.outputs.add(output);
    captured.set(path, details);
  }
  return [...captured.entries()].slice(0, 1024).map(([address, { backend, outputs }]) => ({
    address, ...(backend ? { backend } : {}), ...(outputs.size ? { outputs: distinct(outputs) } : {}),
  }));
}

export function terraformInfrastructure(resources: readonly TerraformResource[], all: readonly TerraformResource[]) {
  const groups = securityGroups(resources);
  const iam = iamIndex(resources);
  const cloudFrontFor = cloudFrontIndex(all);
  const wafFor = wafIndex(resources);
  const datasets = new Map(all.filter((r) => r.mode === 'data' && r.type === 'terraform_remote_state').map((r) => [r.address, r]));
  return (r: TerraformResource, refs: readonly string[], expressions: readonly string[]): InfrastructureDetails | undefined => {
    const v = r.values ?? {};
    const nested = [v.vpc_config, v.network_configuration, v.network_interface, v.access_config].flat(2);
    const keys = [v.security_group_ids, v.vpc_security_group_ids, v.security_groups, ...refs,
      ...nested.flatMap((value) => [record(value).security_group_ids, record(value).security_groups])].flatMap(texts);
    const securityGroupRules = distinct(keys.flatMap((key) => groups.get(key) ?? []));
    const { iamStatements, iamPolicyRefs } = iam(r, refs);
    const remote = remoteStates(r, expressions, datasets);
    const taints = r.type === 'aws_eks_node_group' && !r.sensitive_values?.taint ? nodeTaints(v.taint) : undefined;
    return present({
      ...(securityGroupRules.length ? { securityGroupRules } : {}),
      ...(iamStatements.length ? { iamStatements } : {}),
      ...(iamPolicyRefs.length ? { iamPolicyRefs } : {}),
      ...(remote.length ? { remoteStates: remote } : {}),
      ...(taints ? { nodeProvisioning: { taints } } : {}),
      cloudFront: cloudFrontFor(r),
      waf: wafFor(r),
    });
  };
}
