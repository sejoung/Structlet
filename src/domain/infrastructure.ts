type Reader<T> = (value: unknown, path: string) => T;
type Read<R> = R extends Reader<infer T> ? T : never;
type Fields = Record<string, Reader<unknown>>;
type Shape<F extends Fields, O extends Fields> =
  { readonly [K in keyof F]: Read<F[K]> } & { readonly [K in keyof O]?: Read<O[K]> };

export class InfrastructureError extends Error {}

function invalid(path: string, expected: string): never {
  throw new InfrastructureError(`${path}: ${expected}`);
}

function stringOfLength(minimum: number): Reader<string> {
  return (value, path) => typeof value === 'string' && value.length >= minimum && value.length <= 2048
    ? value : invalid(path, `expected a string of ${minimum}–2048 characters`);
}

const text = stringOfLength(1);
const labelValue = stringOfLength(0);

const integer: Reader<number> = (value, path) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : invalid(path, 'expected an integer');

function count(minimum: number): Reader<number> {
  return (value, path) => {
    const n = integer(value, path);
    return n >= minimum ? n : invalid(path, `expected an integer of at least ${minimum}`);
  };
}

const boolean: Reader<boolean> = (value, path) =>
  typeof value === 'boolean' ? value : invalid(path, 'expected true or false');

function choice<const T extends string[]>(...options: T): Reader<T[number]> {
  return (value, path) => options.includes(value as T[number]) ? value as T[number] : invalid(path, `expected ${options.join(' or ')}`);
}

function list<T>(item: Reader<T>, maximum = 1024): Reader<readonly T[]> {
  return (value, path) => Array.isArray(value) && value.length <= maximum
    ? value.map((entry, index) => item(entry, `${path}[${index}]`))
    : invalid(path, `expected an array of at most ${maximum} items`);
}

function shape<F extends Fields, O extends Fields>(required: F, optional: O): Reader<Shape<F, O>> {
  return (value, path) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'expected an object');
    const source = value as Record<string, unknown>;
    const result = Object.entries(required).map(([key, read]) => [key, read(source[key], `${path}.${key}`)]);
    for (const [key, read] of Object.entries(optional)) {
      if (source[key] !== undefined) result.push([key, read(source[key], `${path}.${key}`)]);
    }
    return Object.fromEntries(result) as Shape<F, O>;
  };
}

const strings = list(text);
const securityRule = shape({ direction: choice('ingress', 'egress'), protocol: text, peers: strings },
  { group: text, fromPort: integer, toPort: integer, description: text });
const principal = shape({ type: text, values: strings }, {});
const condition = shape({ operator: text, key: text, values: strings }, {});
const iamStatement = shape({ effect: choice('Allow', 'Deny') }, {
  policy: text, sid: text, actions: strings, notActions: strings, resources: strings, notResources: strings,
  principals: list(principal), notPrincipals: list(principal), conditions: list(condition),
});
const remoteState = shape({ address: text }, { backend: text, outputs: strings });
const selectorFields = { key: text, operator: text };
const selector = shape(selectorFields, { values: strings, source: choice('label', 'field') });
const placement = shape({}, {
  nodePools: strings, nodeGroups: strings, nodeSelector: list(selector), required: list(list(selector)),
  preferred: list(shape({ weight: integer, selectors: list(selector) }, {})),
});
const helm = shape({}, { releaseName: text, valueFiles: strings, ignoreMissingValueFiles: boolean });
const argoSource = shape({ repoURL: text }, { targetRevision: text, path: text, chart: text, ref: text, helm, directory: shape({}, { recurse: boolean }) });
const argoCd = shape({}, {
  template: boolean,
  project: text,
  sources: list(argoSource),
  destination: shape({}, { namespace: text, server: text, name: text }),
  automated: shape({ enabled: boolean }, { prune: boolean, selfHeal: boolean, allowEmpty: boolean }),
  syncOptions: strings,
});
const nodeTaint = shape({ key: text, effect: choice('NoSchedule', 'PreferNoSchedule', 'NoExecute') }, { value: text });
const disruptionBudget = shape({ nodes: text }, { schedule: text, duration: text, reasons: strings });
const workload = shape({}, { replicas: count(0), schedule: text, timeZone: text });
const nodeProvisioning = shape({}, {
  taints: list(nodeTaint),
  startupTaints: list(nodeTaint),
  limits: list(shape({ resource: text, quantity: text }, {})),
  requirements: list(shape(selectorFields, { values: list(labelValue), minValues: count(1) })),
  disruption: shape({}, {
    consolidationPolicy: text, consolidateAfter: text, expireAfter: text, terminationGracePeriod: text,
    budgets: list(disruptionBudget),
  }),
});
const blockDevice = shape({ deviceName: text }, {
  rootVolume: boolean, volumeType: text, volumeSize: text, encrypted: boolean, deleteOnTermination: boolean,
  iops: integer, throughput: integer, snapshotId: text, kmsKeyId: text, volumeInitializationRate: integer,
});
const tags = list(shape({ key: text, value: labelValue }, {}));
const amiTerm = shape({}, { alias: text, id: text, name: text, owner: text, ssmParameter: text, tags });
const subnetTerm = shape({}, { id: text, tags });
const securityGroupTerm = shape({}, { id: text, name: text, tags });
const nodeClass = shape({}, {
  amiFamily: text, amiSelectorTerms: list(amiTerm), role: text, instanceProfile: text,
  subnetSelectorTerms: list(subnetTerm), securityGroupSelectorTerms: list(securityGroupTerm),
});
const cacheKey = shape({ behavior: text }, { items: strings });
const cachePolicy = shape({}, {
  id: text, name: text, minTtl: count(0), defaultTtl: count(0), maxTtl: count(0),
  headers: cacheKey, cookies: cacheKey, queryStrings: cacheKey, gzip: boolean, brotli: boolean,
});
export const CLOUDFRONT_VIEWER_PROTOCOL_POLICIES = ['allow-all', 'https-only', 'redirect-to-https'] as const;

const cacheBehavior = shape({}, {
  pathPattern: text, originId: text, cachePolicy, originRequestPolicyId: text,
  functionAssociations: list(shape({ functionArn: text, eventType: text }, {})),
  viewerProtocolPolicy: choice(...CLOUDFRONT_VIEWER_PROTOCOL_POLICIES), allowedMethods: strings, cachedMethods: strings, compress: boolean,
});
const cloudFront = shape({}, {
  webAclId: text, defaultRootObject: text, cacheBehaviors: list(cacheBehavior),
  viewerCertificate: shape({}, { minimumProtocolVersion: text, sslSupportMethod: text }),
});
const action = choice('allow', 'block', 'count', 'captcha', 'challenge');
const actionOverride = shape({ name: text, action }, {});
const wafStatementFields = {
  reference: text, name: text, vendor: text, version: text, limit: count(1), windowSeconds: count(1),
  aggregateKeyType: text, countryCodes: strings, actionOverrides: list(actionOverride),
};

export interface WafStatement extends Shape<{ kind: typeof text }, typeof wafStatementFields> {
  readonly children?: readonly WafStatement[];
  readonly scopeDown?: readonly WafStatement[];
}

function readWafStatement(value: unknown, path: string, depth = 0): WafStatement {
  if (depth > 10) invalid(path, 'WAF statement nesting exceeds 10 levels');
  const nested = list((entry, entryPath) => readWafStatement(entry, entryPath, depth + 1));
  return shape({ kind: text }, { ...wafStatementFields, children: nested, scopeDown: nested })(value, path);
}

const wafVisibility = shape({}, { metricName: text, cloudWatchMetricsEnabled: boolean, sampledRequestsEnabled: boolean });
export const WAF_IP_VERSIONS = ['IPV4', 'IPV6'] as const;
const wafIpSet = shape({ reference: text }, {
  name: text, scope: text, ipAddressVersion: choice(...WAF_IP_VERSIONS), addresses: list(text, 10_000),
});
const wafRule = shape({ name: text, priority: count(0) }, {
  action, overrideAction: choice('none', 'count'), statements: list(readWafStatement), visibility: wafVisibility,
});
const waf = shape({}, {
  id: text, name: text, scope: text, defaultAction: choice('allow', 'block'), rules: list(wafRule), visibility: wafVisibility, ipSets: list(wafIpSet),
});
export type SettingValue = string | number | boolean | null | readonly SettingValue[] | SettingValues;
export interface SettingValues { readonly [field: string]: SettingValue }

function readSettingValue(value: unknown, path: string, depth: number): SettingValue {
  if (depth > 12) invalid(path, 'setting depth exceeds 12 levels');
  if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (typeof value === 'string') return labelValue(value, path);
  if (Array.isArray(value)) return list((entry, entryPath) => readSettingValue(entry, entryPath, depth + 1))(value, path);
  return readSettings(value, path, depth);
}

function readSettings(value: unknown, path: string, depth = 0): SettingValues {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(path, 'expected an object of settings');
  const entries = Object.entries(value);
  if (entries.length > 1024) invalid(path, 'expected at most 1024 settings');
  return Object.fromEntries(entries.map(([key, entry]) => [
    text(key, path), readSettingValue(entry, `${path}.${key}`, depth + 1),
  ]));
}

const resourceSettings = shape({ kind: text, values: readSettings }, { source: text });

const infrastructure = shape({}, {
  securityGroupRules: list(securityRule), iamStatements: list(iamStatement), iamPolicyRefs: strings,
  remoteStates: list(remoteState), placement, argoCd, workload, nodeProvisioning, nodeClass, blockDevices: list(blockDevice),
  cloudFront, waf, resourceSettings: list(resourceSettings),
});

export type InfrastructureDetails = Read<typeof infrastructure>;
export type SecurityGroupRule = Read<typeof securityRule>;
export type IamStatement = Read<typeof iamStatement>;
export type RemoteStateReference = Read<typeof remoteState>;
export type PlacementSelector = Read<typeof selector>;
export type WorkloadPlacement = Read<typeof placement>;
export type ArgoCdDetails = Read<typeof argoCd>;
export type WorkloadDetails = Read<typeof workload>;
export type NodeProvisioningDetails = Read<typeof nodeProvisioning>;
export type NodeClassDetails = Read<typeof nodeClass>;
export type NodeTaint = Read<typeof nodeTaint>;
export type BlockDeviceDetails = Read<typeof blockDevice>;
export type CloudFrontDetails = Read<typeof cloudFront>;
export type CachePolicyDetails = Read<typeof cachePolicy>;
export type WafDetails = Read<typeof waf>;
export type WafRuleDetails = Read<typeof wafRule>;
export type WafIpSetDetails = Read<typeof wafIpSet>;
export type ResourceSettings = Read<typeof resourceSettings>;

export function readInfrastructure(value: unknown, path = 'infrastructure'): InfrastructureDetails {
  return infrastructure(value, path);
}
