import type { BlockDeviceDetails, NodeProvisioningDetails, NodeTaint } from '../../domain';
import { array, boolean, integer, present, record, text, texts } from './infrastructure-values';

function quantity(value: unknown): string | undefined {
  return text(value) ?? (typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined);
}

const EFFECTS: Record<string, NodeTaint['effect']> = {
  NoSchedule: 'NoSchedule', NO_SCHEDULE: 'NoSchedule',
  PreferNoSchedule: 'PreferNoSchedule', PREFER_NO_SCHEDULE: 'PreferNoSchedule',
  NoExecute: 'NoExecute', NO_EXECUTE: 'NoExecute',
};

export function nodeTaints(value: unknown): NodeTaint[] | undefined {
  const taints = array(value).flatMap((input) => {
    const taint = record(input);
    const key = text(taint.key);
    const effect = typeof taint.effect === 'string' && Object.hasOwn(EFFECTS, taint.effect) ? EFFECTS[taint.effect] : undefined;
    return key && effect ? [{ key, effect, value: text(taint.value) }] : [];
  });
  return taints.length ? taints : undefined;
}

export function karpenterProvisioning(value: unknown): NodeProvisioningDetails | undefined {
  const spec = record(value);
  const template = record(record(spec.template).spec);
  const disruption = record(spec.disruption);
  const limits = Object.entries(record(spec.limits)).flatMap(([resource, value]) => {
    const amount = quantity(value);
    return resource && amount !== undefined ? [{ resource, quantity: amount }] : [];
  });
  const budgets = array(disruption.budgets).flatMap((input) => {
    const { nodes, schedule, duration, reasons } = record(input);
    const amount = quantity(nodes);
    return amount === undefined ? [] : [{
      nodes: amount, schedule: text(schedule), duration: text(duration), reasons: Array.isArray(reasons) ? texts(reasons) : undefined,
    }];
  });
  return present({
    taints: nodeTaints(template.taints),
    startupTaints: nodeTaints(template.startupTaints),
    limits: limits.length ? limits : undefined,
    disruption: present({
      consolidationPolicy: text(disruption.consolidationPolicy),
      consolidateAfter: text(disruption.consolidateAfter),
      expireAfter: text(template.expireAfter) ?? text(disruption.expireAfter),
      terminationGracePeriod: text(template.terminationGracePeriod),
      budgets: Array.isArray(disruption.budgets) ? budgets : undefined,
    }),
  });
}

export function karpenterBlockDevices(value: unknown): BlockDeviceDetails[] | undefined {
  const devices = array(record(value).blockDeviceMappings).flatMap((input): BlockDeviceDetails[] => {
    const device = record(input);
    const deviceName = text(device.deviceName);
    if (!deviceName) return [];
    const ebs = record(device.ebs);
    return [{
      deviceName, rootVolume: boolean(device.rootVolume), volumeType: text(ebs.volumeType), volumeSize: quantity(ebs.volumeSize),
      encrypted: boolean(ebs.encrypted), deleteOnTermination: boolean(ebs.deleteOnTermination), iops: integer(ebs.iops),
      throughput: integer(ebs.throughput), snapshotId: text(ebs.snapshotID), kmsKeyId: text(ebs.kmsKeyID),
      volumeInitializationRate: integer(ebs.volumeInitializationRate),
    }];
  });
  return devices.length ? devices : undefined;
}
