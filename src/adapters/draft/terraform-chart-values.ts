import { parse } from 'yaml';
import type { SettingValues } from '../../domain';
import { array, record } from './infrastructure-values';
import { settingFields } from './resource-settings';

const COMPONENTS = [
  'controller', 'repoServer', 'server', 'applicationSet', 'redis', 'redis-ha', 'dex', 'notifications',
  'webhook', 'metrics', 'serviceAccount',
];

const COMMON = 'enabled replicas replicaCount autoscaling.enabled autoscaling.minReplicas autoscaling.maxReplicas resources.requests resources.limits service.type service.port serviceAccount.name serviceAccount.create ingress.enabled ingress.hostname ingress.hosts ingress.ingressClassName ingress.tls';
const HELM_FIELDS = `${COMMON}
  settings.clusterName settings.interruptionQueue settings.defaultInstanceProfile settings.featureGates
  enableSpotInterruptionDraining enableScheduledEventDraining enableRebalanceMonitoring enableRebalanceDraining queueURL
  configs.cm.url configs.params.server.insecure
  ${COMPONENTS.flatMap((component) => COMMON.split(' ').map((field) => `${component}.${field}`)).join(' ')}`;

export function chartValues(value: unknown): readonly SettingValues[] {
  return array(value).flatMap((entry) => {
    if (typeof entry !== 'string' || entry.length > 262_144) return [];
    try {
      const settings = settingFields(record(parse(entry, { maxAliasCount: 50 })), HELM_FIELDS);
      return settings ? [settings] : [];
    } catch {
      return [];
    }
  });
}
