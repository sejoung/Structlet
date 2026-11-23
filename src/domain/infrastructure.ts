type Reader<T> = (value: unknown, path: string) => T;
type Read<R> = R extends Reader<infer T> ? T : never;
type Fields = Record<string, Reader<unknown>>;
type Shape<F extends Fields, O extends Fields> =
  { readonly [K in keyof F]: Read<F[K]> } & { readonly [K in keyof O]?: Read<O[K]> };

export class InfrastructureError extends Error {}

function invalid(path: string, expected: string): never {
  throw new InfrastructureError(`${path}: ${expected}`);
}

const text: Reader<string> = (value, path) =>
  typeof value === 'string' && value.length > 0 && value.length <= 2048 ? value : invalid(path, 'expected a string of 1–2048 characters');

const integer: Reader<number> = (value, path) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : invalid(path, 'expected an integer');

function choice<const T extends string[]>(...options: T): Reader<T[number]> {
  return (value, path) => options.includes(value as T[number]) ? value as T[number] : invalid(path, `expected ${options.join(' or ')}`);
}

function list<T>(item: Reader<T>): Reader<readonly T[]> {
  return (value, path) => Array.isArray(value) && value.length <= 1024
    ? value.map((entry, index) => item(entry, `${path}[${index}]`))
    : invalid(path, 'expected an array of at most 1024 items');
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
const selector = shape({ key: text, operator: text }, { values: strings, source: choice('label', 'field') });
const placement = shape({}, {
  nodePools: strings, nodeGroups: strings, nodeSelector: list(selector), required: list(list(selector)),
  preferred: list(shape({ weight: integer, selectors: list(selector) }, {})),
});
const infrastructure = shape({}, {
  securityGroupRules: list(securityRule), iamStatements: list(iamStatement), iamPolicyRefs: strings,
  remoteStates: list(remoteState), placement,
});

export type InfrastructureDetails = Read<typeof infrastructure>;
export type SecurityGroupRule = Read<typeof securityRule>;
export type IamStatement = Read<typeof iamStatement>;
export type RemoteStateReference = Read<typeof remoteState>;
export type PlacementSelector = Read<typeof selector>;
export type WorkloadPlacement = Read<typeof placement>;

export function readInfrastructure(value: unknown, path = 'infrastructure'): InfrastructureDetails {
  return infrastructure(value, path);
}
