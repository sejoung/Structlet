import type { Document } from '../../domain';
import { findService, ROLE_COLORS } from './services';

type Role = keyof typeof ROLE_COLORS;

const ROLE_NAMES: Record<Role, { en: string; ko: string }> = {
  client: { en: 'Users and clients', ko: '사용자·클라이언트' },
  compute: { en: 'Compute', ko: '컴퓨팅' },
  data: { en: 'Databases and caches', ko: '데이터베이스·캐시' },
  storage: { en: 'Storage', ko: '스토리지' },
  network: { en: 'Networking', ko: '네트워크' },
  integration: { en: 'Messaging and integration', ko: '메시징·통합' },
  security: { en: 'Security and identity', ko: '보안·인증' },
  operations: { en: 'Monitoring and operations', ko: '모니터링·운영' },
  analytics: { en: 'Analytics and ML', ko: '분석·ML' },
  external: { en: 'External systems', ko: '외부 시스템' },
};

const COLOR_ROLE = new Map(Object.entries(ROLE_COLORS).map(([role, color]) => [color as string, role as Role]));

export function buildLegend(doc: Document, language: 'en' | 'ko'): string {
  const roles = new Set<Role>();
  for (const n of doc.nodes) roles.add(COLOR_ROLE.get(findService(n.serviceId)?.color ?? '') ?? 'external');
  const lines = [language === 'ko' ? '범례' : 'Legend'];
  for (const role of Object.keys(ROLE_COLORS) as Role[]) if (roles.has(role)) lines.push(`${ROLE_COLORS[role]} ${ROLE_NAMES[role][language]}`);
  if (doc.edges.some((e) => !e.style.dashed)) lines.push(`--- ${language === 'ko' ? '동기 호출' : 'Synchronous call'}`);
  if (doc.edges.some((e) => e.style.dashed)) lines.push(`- - ${language === 'ko' ? '비동기 메시지' : 'Asynchronous message'}`);
  return lines.join('\n');
}
