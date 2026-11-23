import type { PlacementSelector, WorkloadPlacement } from '../../domain';

import { array, record } from './infrastructure-values';

function selectors(value: unknown): PlacementSelector[] {
  const term = record(value);
  const requirements = (items: unknown, source: 'label' | 'field') => array(items).flatMap((item): PlacementSelector[] => {
    const { key, operator, values } = record(item);
    if (typeof key !== 'string' || !key || typeof operator !== 'string' || !operator) return [];
    return [{ key, operator, source, ...(Array.isArray(values) ? { values: values.filter((v) => typeof v === 'string' && v) } : {}) }];
  });
  return [...requirements(term.matchExpressions, 'label'), ...requirements(term.matchFields, 'field')];
}

function namedTargets(key: string, nodeSelector: readonly PlacementSelector[], required: readonly PlacementSelector[][]): string[] {
  const limits = (term: readonly PlacementSelector[]): string[] | undefined => {
    const sets = term.filter((s) => s.key === key && s.source !== 'field' && s.operator === 'In').map((s) => s.values ?? []);
    return sets[0]?.filter((name) => sets.every((set) => set.includes(name))
      && !term.some((s) => s.key === key && s.source !== 'field'
        && (s.operator === 'DoesNotExist' || (s.operator === 'NotIn' && s.values?.includes(name)))));
  };
  const candidates = required.length ? required.map((term) => term.length ? limits([...nodeSelector, ...term]) : []) : [limits(nodeSelector)];
  return candidates.every((names) => names !== undefined) ? [...new Set(candidates.flat())].filter((name): name is string => !!name) : [];
}

export function workloadPlacement(value: unknown): WorkloadPlacement | undefined {
  const spec = record(value);
  const nodeSelector = Object.entries(record(spec.nodeSelector)).flatMap(([key, value]): PlacementSelector[] =>
    typeof value === 'string' && value ? [{ key, operator: 'In', values: [value] }] : []);
  const affinity = record(record(spec.affinity).nodeAffinity);
  const required = array(record(affinity.requiredDuringSchedulingIgnoredDuringExecution).nodeSelectorTerms).map(selectors);
  const preferred = array(affinity.preferredDuringSchedulingIgnoredDuringExecution).flatMap((item) => {
    const { weight, preference } = record(item);
    return typeof weight === 'number' && Number.isSafeInteger(weight) ? [{ weight, selectors: selectors(preference) }] : [];
  });
  if (!nodeSelector.length && !required.length && !preferred.length) return undefined;
  const nodePools = namedTargets('karpenter.sh/nodepool', nodeSelector, required);
  const nodeGroups = namedTargets('eks.amazonaws.com/nodegroup', nodeSelector, required);
  return {
    ...(nodeSelector.length ? { nodeSelector } : {}),
    ...(required.length ? { required } : {}),
    ...(preferred.length ? { preferred } : {}),
    ...(nodePools.length ? { nodePools } : {}),
    ...(nodeGroups.length ? { nodeGroups } : {}),
  };
}
