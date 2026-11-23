import type { ArgoCdDetails } from '../../domain';
import { array, boolean, present, record, text, texts } from './infrastructure-values';

const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;

function repository(value: unknown): string | undefined {
  const address = text(value);
  return address && URL_SCHEME.test(address)
    ? address.replace(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/?#]*@/, '$1').split(/[?#]/, 1)[0]
    : address;
}

export function argoCdDetails(value: unknown, template: boolean): ArgoCdDetails | undefined {
  const spec = record(value);
  if (!Object.keys(spec).length && template) return undefined;
  const sources = (array(spec.sources).length ? array(spec.sources) : [spec.source]).flatMap((input) => {
    const source = record(input);
    const repoURL = repository(source.repoURL);
    if (!repoURL) return [];
    const helm = record(source.helm);
    return [{
      directory: present({ recurse: boolean(record(source.directory).recurse) }),
      repoURL, targetRevision: text(source.targetRevision), path: text(source.path), chart: text(source.chart), ref: text(source.ref),
      ...(source.helm && typeof source.helm === 'object' && !Array.isArray(source.helm) ? { helm: {
        releaseName: text(helm.releaseName), valueFiles: Array.isArray(helm.valueFiles) ? texts(helm.valueFiles).flatMap((file) => repository(file) || []) : undefined,
        ignoreMissingValueFiles: boolean(helm.ignoreMissingValueFiles),
      } } : {}),
    }];
  });
  const sync = record(spec.syncPolicy);
  const declared = sync.automated;
  const auto = record(declared);
  const enabled = declared == null ? false
    : typeof declared === 'object' && !Array.isArray(declared) ? auto.enabled == null ? true : boolean(auto.enabled) : undefined;
  const automated = enabled === undefined ? undefined : {
    enabled, prune: boolean(auto.prune), selfHeal: boolean(auto.selfHeal), allowEmpty: boolean(auto.allowEmpty),
  };
  const destination = record(spec.destination);
  return {
    ...(template ? { template: true } : {}),
    project: text(spec.project),
    sources: sources.length ? sources : undefined,
    destination: present({ namespace: text(destination.namespace), name: text(destination.name), server: repository(destination.server) }),
    automated,
    syncOptions: Array.isArray(sync.syncOptions) ? texts(sync.syncOptions) : undefined,
  };
}
