import { parseAllDocuments } from 'yaml';
import type { InfrastructureDetails } from '../../domain';
import { argoCdDetails } from './argo-cd-details';
import { integer, present, record, text } from './infrastructure-values';
import { karpenterBlockDevices, karpenterNodeClass, karpenterProvisioning } from './node-provisioning';
import { workloadPlacement } from './kubernetes-placement';
import type { Draft, DraftContainer, DraftEdge, DraftNode } from './draft-format';


type Obj = { apiVersion?: string; kind?: string; metadata?: { name?: string; namespace?: string; labels?: Record<string, string>; ownerReferences?: unknown[] }; spec?: any; type?: string };

const SERVICE: Record<string, string> = {
  Deployment: 'k8s.deployment', StatefulSet: 'k8s.statefulset', DaemonSet: 'k8s.daemonset', Job: 'k8s.job', CronJob: 'k8s.cronjob', Pod: 'k8s.pod',
  Service: 'k8s.service', Ingress: 'k8s.ingress', Gateway: 'k8s.ingress', HTTPRoute: 'k8s.ingress', ConfigMap: 'k8s.configmap', Secret: 'k8s.secret',
  PersistentVolumeClaim: 'k8s.pvc', HorizontalPodAutoscaler: 'k8s.hpa',
};
const ADD_ONS: Record<string, string> = {
  'argoproj.io/Application': 'k8s.argocd-application',
  'argoproj.io/ApplicationSet': 'k8s.argocd-applicationset',
  'karpenter.sh/NodePool': 'k8s.karpenter-nodepool',
  'karpenter.k8s.aws/EC2NodeClass': 'k8s.karpenter-ec2nodeclass',
};
const CLUSTER_KINDS = new Set(['NodePool', 'EC2NodeClass']);
const apiGroup = (o: Obj) => o.apiVersion?.split('/')[0];
const serviceFor = (o: Obj) => ADD_ONS[`${apiGroup(o)}/${o.kind}`] ?? SERVICE[o.kind!];
const WORKLOADS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob', 'Pod']);

const safe = (s: string) => s.replace(/[^A-Za-z0-9_.:-]+/g, '-').slice(0, 90);

function objects(text: string): Obj[] {
  const out: Obj[] = [];
  const add = (o: unknown) => {
    if (!o || typeof o !== 'object') return;
    const obj = o as Obj & { items?: unknown[] };
    if (Array.isArray(obj.items) && (obj.kind === 'List' || obj.kind?.endsWith('List'))) obj.items.forEach(add);
    else if (obj.kind && obj.metadata?.name) out.push(obj);
  };
  for (const doc of parseAllDocuments(text)) {
    if ('errors' in doc && doc.errors.length) throw new Error(doc.errors[0]!.message);
    add(doc.toJS({ maxAliasCount: 100 }));
  }
  return out;
}

function podOf(o: Obj): { spec: any; labels: Record<string, string> } | null {
  if (o.kind === 'Pod') return { spec: o.spec ?? {}, labels: o.metadata?.labels ?? {} };
  const tpl = o.kind === 'CronJob' ? o.spec?.jobTemplate?.spec?.template : o.spec?.template;
  return tpl ? { spec: tpl.spec ?? {}, labels: tpl.metadata?.labels ?? {} } : null;
}

function second(o: Obj): string {
  if (o.kind === 'Deployment' || o.kind === 'StatefulSet') return `${o.spec?.replicas ?? 1} replicas`;
  if (o.kind === 'DaemonSet') return 'every node';
  if (o.kind === 'CronJob') return String(o.spec?.schedule ?? 'cron');
  if (o.kind === 'Service') return String(o.spec?.type ?? 'ClusterIP');
  if (o.kind === 'HorizontalPodAutoscaler') return `${o.spec?.minReplicas ?? 1}–${o.spec?.maxReplicas ?? '?'}`;
  if (o.kind === 'PersistentVolumeClaim') return String(o.spec?.resources?.requests?.storage ?? 'volume');
  if (o.kind === 'Application' && typeof o.spec?.destination?.namespace === 'string') return `Application · ${o.spec.destination.namespace}`;
  return o.kind ?? '';
}

function workloadDetails(o: Obj): InfrastructureDetails['workload'] {
  const spec = record(o.spec);
  if (o.kind === 'Deployment' || o.kind === 'StatefulSet') {
    const replicas = integer(spec.replicas);
    return replicas !== undefined && replicas >= 0 ? { replicas } : undefined;
  }
  if (o.kind === 'CronJob') return present({ schedule: text(spec.schedule), timeZone: text(spec.timeZone) });
  return undefined;
}

function infrastructureOf(o: Obj): InfrastructureDetails | undefined {
  const service = serviceFor(o);
  if (service === 'k8s.argocd-application') return present({ argoCd: argoCdDetails(o.spec, false) });
  if (service === 'k8s.argocd-applicationset') return present({ argoCd: argoCdDetails(o.spec?.template?.spec, true) });
  if (service === 'k8s.karpenter-nodepool') return present({ nodeProvisioning: karpenterProvisioning(o.spec) });
  if (service === 'k8s.karpenter-ec2nodeclass') return present({
    nodeClass: karpenterNodeClass(o.spec),
    blockDevices: karpenterBlockDevices(o.spec),
  });
  return WORKLOADS.has(o.kind!) ? present({
    workload: workloadDetails(o),
    placement: workloadPlacement(podOf(o)?.spec),
  }) : undefined;
}

export function kubernetesToDraft(text: string, title = 'Kubernetes'): Draft {
  const manifests = objects(text);
  const all = manifests.filter((o) => serviceFor(o) && !(o.kind === 'Pod' && o.metadata?.ownerReferences?.length) && !(o.kind === 'Secret' && /service-account-token|helm\.sh\/release/.test(o.type ?? '')));
  if (all.length === 0) throw new Error('No supported Kubernetes resources found');
  const ns = (o: Obj) => CLUSTER_KINDS.has(o.kind!) ? 'cluster' : o.metadata?.namespace ?? 'default';
  const id = (kind: string, namespace: string, name: string) => safe(`k8s-${namespace}-${kind.toLowerCase()}-${name}`);
  const idOf = (o: Obj) => id(o.kind!, ns(o), o.metadata!.name!);
  const cluster = 'k8s-cluster';
  const namespaces = [...new Set([
    ...all.filter((o) => !CLUSTER_KINDS.has(o.kind!)).map(ns),
    ...manifests.filter((o) => o.kind === 'Namespace').map((o) => o.metadata!.name!),
  ])];
  const containers: DraftContainer[] = [
    { id: cluster, kind: 'cluster', label: title, layout: namespaces.length > 2 ? 'grid' : 'flow' },
    ...namespaces.map((n): DraftContainer => ({ id: safe(`k8s-ns-${n}`), kind: 'namespace', label: n, parent: cluster, layout: 'flow' })),
  ];
  const nodes: DraftNode[] = all.map((o) => {
    const infrastructure = infrastructureOf(o);
    return {
      id: idOf(o), service: serviceFor(o)!, label: `${o.metadata!.name}\n${second(o)}`,
      parent: CLUSTER_KINDS.has(o.kind!) ? cluster : safe(`k8s-ns-${ns(o)}`),
      ...(infrastructure ? { infrastructure } : {}),
    };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const have = new Set([...byId.keys(), ...containers.map((c) => c.id)]);
  const edges: DraftEdge[] = [];
  const link = (from: string, to: string, extra: Partial<DraftEdge> = {}) => {
    if (from !== to && have.has(from) && have.has(to) && !edges.some((e) => e.from === from && e.to === to)) edges.push({ from, to, ...extra });
  };
  const entry: string[] = [];
  for (const o of all) {
    const n = ns(o);
    const me = idOf(o);
    if (o.kind === 'NodePool') {
      const ref = o.spec?.template?.spec?.nodeClassRef;
      if (ref?.kind === 'EC2NodeClass' && ref.group === 'karpenter.k8s.aws' && typeof ref.name === 'string') {
        link(me, id(ref.kind, 'cluster', ref.name), { dashed: true, relationship: true, label: 'nodeClassRef' });
      }
    }
    if (o.kind === 'Application') {
      const target = o.spec?.destination;
      if (typeof target?.namespace === 'string' && (target.server === 'https://kubernetes.default.svc' || (!target.server && target.name === 'in-cluster'))) {
        link(me, safe(`k8s-ns-${target.namespace}`), { dashed: true, relationship: true, label: 'destination' });
      }
    }
    for (const pool of byId.get(me)?.infrastructure?.placement?.nodePools ?? []) {
      link(me, id('NodePool', 'cluster', pool), { dashed: true, relationship: true, label: 'node placement' });
    }
    if (o.kind === 'Ingress') {
      entry.push(me);
      const backend = (b: any) => b?.service?.name ?? b?.serviceName;
      if (backend(o.spec?.defaultBackend)) link(me, id('Service', n, backend(o.spec.defaultBackend)));
      for (const rule of o.spec?.rules ?? [])
        for (const path of rule.http?.paths ?? []) {
          const target = backend(path.backend);
          if (target) link(me, id('Service', n, target), { label: `${rule.host ?? ''}${path.path ?? ''}`.trim() || undefined });
        }
    }
    if (o.kind === 'Gateway') entry.push(me);
    if (o.kind === 'HTTPRoute') {
      for (const p of o.spec?.parentRefs ?? []) link(id('Gateway', p.namespace ?? n, p.name), me);
      for (const rule of o.spec?.rules ?? []) for (const b of rule.backendRefs ?? []) link(me, id('Service', b.namespace ?? n, b.name));
    }
    if (o.kind === 'Service') {
      if (o.spec?.type === 'LoadBalancer' || o.spec?.type === 'NodePort') entry.push(me);
      const selector = o.spec?.selector as Record<string, string> | undefined;
      if (selector && Object.keys(selector).length) {
        const port = (o.spec?.ports ?? []).map((p: any) => p.port).filter(Boolean).join(', ');
        for (const w of all) {
          if (!WORKLOADS.has(w.kind!) || ns(w) !== n) continue;
          const labels = podOf(w)?.labels ?? {};
          if (Object.entries(selector).every(([k, v]) => labels[k] === v)) link(me, idOf(w), port ? { label: `:${port}` } : {});
        }
      }
    }
    if (o.kind === 'HorizontalPodAutoscaler') {
      const t = o.spec?.scaleTargetRef;
      if (t?.kind && t?.name) link(me, id(t.kind, n, t.name), { dashed: true, label: 'scales' });
    }
    const pod = WORKLOADS.has(o.kind!) ? podOf(o) : null;
    if (!pod) continue;
    for (const v of pod.spec.volumes ?? []) {
      if (v.configMap?.name) link(me, id('ConfigMap', n, v.configMap.name), { dashed: true });
      if (v.secret?.secretName) link(me, id('Secret', n, v.secret.secretName), { dashed: true });
      if (v.persistentVolumeClaim?.claimName) link(me, id('PersistentVolumeClaim', n, v.persistentVolumeClaim.claimName));
      for (const src of v.projected?.sources ?? []) {
        if (src.configMap?.name) link(me, id('ConfigMap', n, src.configMap.name), { dashed: true });
        if (src.secret?.name) link(me, id('Secret', n, src.secret.name), { dashed: true });
      }
    }
    for (const c of [...(pod.spec.containers ?? []), ...(pod.spec.initContainers ?? [])]) {
      for (const f of c.envFrom ?? []) {
        if (f.configMapRef?.name) link(me, id('ConfigMap', n, f.configMapRef.name), { dashed: true });
        if (f.secretRef?.name) link(me, id('Secret', n, f.secretRef.name), { dashed: true });
      }
      for (const e of c.env ?? []) {
        if (e.valueFrom?.configMapKeyRef?.name) link(me, id('ConfigMap', n, e.valueFrom.configMapKeyRef.name), { dashed: true });
        if (e.valueFrom?.secretKeyRef?.name) link(me, id('Secret', n, e.valueFrom.secretKeyRef.name), { dashed: true });
      }
    }
    if (o.kind === 'StatefulSet') {
      for (const tpl of o.spec?.volumeClaimTemplates ?? []) {
        const pvc = id('PersistentVolumeClaim', n, `${tpl.metadata?.name ?? 'data'}-${o.metadata!.name}`);
        if (!have.has(pvc)) {
          nodes.push({ id: pvc, service: 'k8s.pvc', label: `${tpl.metadata?.name ?? 'data'}\n${tpl.spec?.resources?.requests?.storage ?? 'per replica'}`, parent: safe(`k8s-ns-${n}`) });
          have.add(pvc);
        }
        link(me, pvc);
      }
    }
  }
  if (entry.length) {
    nodes.unshift({ id: 'k8s-clients', service: 'users', label: 'Clients' });
    have.add('k8s-clients');
    for (const e of entry) link('k8s-clients', e);
  }
  return { title, layout: 'flow', containers, nodes, edges, annotations: [], remove: [] };
}
