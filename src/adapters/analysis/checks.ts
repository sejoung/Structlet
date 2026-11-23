import { ancestors, indexDocument, type Document, type Id } from '../../domain';
import { findService, ROLE_COLORS } from '../catalog/services';


export type CheckSeverity = 'warning' | 'info';
export type CheckCode =
  | 'data-in-public-subnet'
  | 'client-to-data'
  | 'unknown-service'
  | 'unconnected'
  | 'unnamed'
  | 'empty-area';

export interface Finding {
  readonly code: CheckCode;
  readonly severity: CheckSeverity;
  readonly ids: readonly Id[];
}

const DATA = new Set<string>([ROLE_COLORS.data, ROLE_COLORS.storage]);
const CLIENT = new Set<string>([ROLE_COLORS.client, ROLE_COLORS.external]);
const PUBLIC = /public|퍼블릭|공개|dmz/i;

export function runChecks(doc: Document, known: (serviceId: string) => boolean = () => false): Finding[] {
  const index = indexDocument(doc);
  const findings: Finding[] = [];
  const color = (id: Id) => findService(index.nodes.get(id)?.serviceId ?? '')?.color ?? '';
  for (const n of doc.nodes) {
    const def = findService(n.serviceId);
    if (!def && !known(n.serviceId)) findings.push({ code: 'unknown-service', severity: 'info', ids: [n.id] });
    if (!n.label.trim()) findings.push({ code: 'unnamed', severity: 'info', ids: [n.id] });
    if (def && DATA.has(def.color)) {
      const publicArea = ancestors(doc, n.id).find((a) => {
        const c = index.containers.get(a)!;
        return c.kind === 'subnet' && PUBLIC.test(c.label);
      });
      if (publicArea) findings.push({ code: 'data-in-public-subnet', severity: 'warning', ids: [n.id, publicArea] });
    }
  }
  const touched = new Set<Id>();
  for (const e of doc.edges) {
    for (const end of [e.source, e.target]) if (end.kind === 'attached') touched.add(end.objectId);
    if (e.source.kind !== 'attached' || e.target.kind !== 'attached') continue;
    const [a, b] = [e.source.objectId, e.target.objectId];
    if ((CLIENT.has(color(a)) && DATA.has(color(b))) || (CLIENT.has(color(b)) && DATA.has(color(a)))) findings.push({ code: 'client-to-data', severity: 'warning', ids: [e.id, a, b] });
  }
  for (const n of doc.nodes) if (!touched.has(n.id) && doc.nodes.length > 1) findings.push({ code: 'unconnected', severity: 'info', ids: [n.id] });
  for (const c of doc.containers) if ((index.children.get(c.id) ?? []).length === 0) findings.push({ code: 'empty-area', severity: 'info', ids: [c.id] });
  const order: Record<CheckSeverity, number> = { warning: 0, info: 1 };
  return findings.sort((x, y) => order[x.severity] - order[y.severity]);
}
