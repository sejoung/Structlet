import {
  Activity, AppWindow, Archive, ArrowLeftRight, Boxes, Box, Brain, BrickWall, Building2, CalendarClock, ChartLine, Cloud, Cog,
  Container, CreditCard, Database, Earth, Flag, FolderOpen, Globe, HardDrive, Inbox, Key, KeyRound, Lambda, Laptop, Layers, Lock,
  Mail, MapPin, MemoryStick, Network, Radio, ScrollText, Search, Server, ShieldCheck, Signpost, Smartphone, Sparkles, Split,
  SquareFunction, Table2, User, UserCheck, Users, Warehouse, Waves, Waypoints, Webhook, Workflow, Router, Cpu,
} from 'lucide';
import type { ContainerKind } from '../../domain';
import type { Appearance, Glyph, ServiceAppearance } from '../../engine';

/**
 * Service definitions, separate from the nodes that use them. Glyphs come
 * from Lucide (ISC, see THIRD_PARTY_NOTICES.md). These are generic symbols,
 * not official AWS icons; AWS service names are written as text only.
 */

export type ServiceCategory = 'general' | 'aws';

export interface ServiceDefinition {
  readonly id: string;
  readonly category: ServiceCategory;
  readonly name: { readonly en: string; readonly ko: string };
  readonly keywords: readonly string[];
  readonly glyph: Glyph;
  readonly color: string;
}

export const ROLE_COLORS = {
  client: '#232f3e',
  compute: '#ed7100',
  data: '#3b48cc',
  storage: '#3f8624',
  network: '#8c4fff',
  integration: '#e7157b',
  security: '#dd344c',
  operations: '#c925d1',
  analytics: '#01a88d',
  external: '#5f6b7a',
} as const;

type Row = [id: string, en: string, ko: string, glyph: Glyph, color: keyof typeof ROLE_COLORS, keywords?: string];

const GENERAL: Row[] = [
  ['user', 'User', '사용자', User, 'client', 'person customer 고객 사람'],
  ['users', 'Users', '사용자 그룹', Users, 'client', 'people team 팀'],
  ['browser', 'Web client', '웹 클라이언트', AppWindow, 'client', 'browser frontend spa 브라우저 프론트엔드'],
  ['mobile', 'Mobile app', '모바일 앱', Smartphone, 'client', 'ios android phone 앱'],
  ['desktop', 'Desktop', '데스크톱', Laptop, 'client', 'pc laptop'],
  ['internet', 'Internet', '인터넷', Earth, 'external', 'web public 외부'],
  ['server', 'Server', '서버', Server, 'compute', 'vm host instance 인스턴스 애플리케이션 app'],
  ['vm', 'Virtual machine', '가상 머신', Cpu, 'compute', 'instance compute'],
  ['container', 'Container', '컨테이너', Container, 'compute', 'docker pod 도커'],
  ['cluster', 'Cluster', '클러스터', Boxes, 'compute', 'kubernetes k8s 쿠버네티스'],
  ['function', 'Function', '함수', SquareFunction, 'compute', 'serverless lambda 서버리스'],
  ['worker', 'Worker', '워커', Cog, 'compute', 'job background batch 배치 작업'],
  ['scheduler', 'Scheduler', '스케줄러', CalendarClock, 'compute', 'cron timer 크론'],
  ['database', 'Database', '데이터베이스', Database, 'data', 'db sql postgres mysql rdbms 디비'],
  ['table', 'Key-value store', '키-값 저장소', Table2, 'data', 'nosql dynamo document'],
  ['cache', 'Cache', '캐시', MemoryStick, 'data', 'redis memcached 레디스'],
  ['object-storage', 'Object storage', '객체 스토리지', Archive, 'storage', 'bucket blob s3 버킷'],
  ['file-storage', 'File storage', '파일 스토리지', FolderOpen, 'storage', 'nfs share 공유'],
  ['disk', 'Block storage', '블록 스토리지', HardDrive, 'storage', 'volume disk 볼륨 디스크'],
  ['queue', 'Queue', '큐', Inbox, 'integration', 'mq rabbitmq message 메시지 대기열'],
  ['topic', 'Topic', '토픽', Radio, 'integration', 'pubsub publish notification 알림 발행'],
  ['stream', 'Stream', '스트림', Waves, 'integration', 'kafka event log 이벤트'],
  ['event-bus', 'Event bus', '이벤트 버스', Waypoints, 'integration', 'events routing 이벤트'],
  ['workflow', 'Workflow', '워크플로', Workflow, 'integration', 'orchestration state machine'],
  ['load-balancer', 'Load balancer', '로드밸런서', Split, 'network', 'lb alb nlb proxy 부하분산 로드 밸런서'],
  ['dns', 'DNS', 'DNS', Signpost, 'network', 'domain name 도메인'],
  ['cdn', 'CDN', 'CDN', Globe, 'network', 'edge cache static 정적'],
  ['api-gateway', 'API gateway', 'API 게이트웨이', Webhook, 'network', 'gateway rest graphql 게이트웨이'],
  ['router', 'Router', '라우터', Router, 'network', 'nat gateway 게이트웨이'],
  ['firewall', 'Firewall', '방화벽', BrickWall, 'security', 'waf security group 보안'],
  ['auth', 'Identity', '인증', KeyRound, 'security', 'login sso oauth iam 로그인 권한'],
  ['secrets', 'Secrets', '시크릿', Lock, 'security', 'vault keys 비밀'],
  ['certificate', 'Certificate', '인증서', ShieldCheck, 'security', 'tls ssl'],
  ['monitoring', 'Monitoring', '모니터링', Activity, 'operations', 'metrics alarm 메트릭 경보'],
  ['logs', 'Logs', '로그', ScrollText, 'operations', 'logging audit 감사'],
  ['email', 'Email', '이메일', Mail, 'integration', 'smtp mail 메일'],
  ['search', 'Search', '검색', Search, 'analytics', 'elasticsearch opensearch index 인덱스'],
  ['analytics', 'Analytics', '분석', ChartLine, 'analytics', 'bi dashboard report 대시보드'],
  ['ml', 'Machine learning', '머신러닝', Brain, 'analytics', 'ai model 인공지능 모델'],
  ['external', 'External system', '외부 시스템', Building2, 'external', 'third party saas partner 파트너'],
  ['payment', 'Payment provider', '결제 서비스', CreditCard, 'external', 'pg stripe billing 결제'],
  ['generic', 'Component', '구성 요소', Box, 'external', 'generic other 기타'],
];

const AWS: Row[] = [
  ['aws.ec2', 'Amazon EC2', 'Amazon EC2', Server, 'compute', 'instance vm 인스턴스'],
  ['aws.ecs', 'Amazon ECS', 'Amazon ECS', Container, 'compute', 'container docker'],
  ['aws.eks', 'Amazon EKS', 'Amazon EKS', Boxes, 'compute', 'kubernetes k8s'],
  ['aws.fargate', 'AWS Fargate', 'AWS Fargate', Layers, 'compute', 'container serverless'],
  ['aws.lambda', 'AWS Lambda', 'AWS Lambda', Lambda, 'compute', 'function serverless 함수'],
  ['aws.s3', 'Amazon S3', 'Amazon S3', Archive, 'storage', 'bucket object 버킷'],
  ['aws.ebs', 'Amazon EBS', 'Amazon EBS', HardDrive, 'storage', 'volume block'],
  ['aws.efs', 'Amazon EFS', 'Amazon EFS', FolderOpen, 'storage', 'file nfs'],
  ['aws.rds', 'Amazon RDS', 'Amazon RDS', Database, 'data', 'database mysql postgres'],
  ['aws.aurora', 'Amazon Aurora', 'Amazon Aurora', Database, 'data', 'database'],
  ['aws.dynamodb', 'Amazon DynamoDB', 'Amazon DynamoDB', Table2, 'data', 'nosql key value'],
  ['aws.elasticache', 'Amazon ElastiCache', 'Amazon ElastiCache', MemoryStick, 'data', 'redis cache'],
  ['aws.sqs', 'Amazon SQS', 'Amazon SQS', Inbox, 'integration', 'queue 큐'],
  ['aws.sns', 'Amazon SNS', 'Amazon SNS', Radio, 'integration', 'topic notification'],
  ['aws.eventbridge', 'Amazon EventBridge', 'Amazon EventBridge', Waypoints, 'integration', 'event bus'],
  ['aws.kinesis', 'Amazon Kinesis', 'Amazon Kinesis', Waves, 'analytics', 'stream'],
  ['aws.stepfunctions', 'AWS Step Functions', 'AWS Step Functions', Workflow, 'integration', 'workflow state machine'],
  ['aws.apigateway', 'Amazon API Gateway', 'Amazon API Gateway', Webhook, 'network', 'api rest'],
  ['aws.cloudfront', 'Amazon CloudFront', 'Amazon CloudFront', Globe, 'network', 'cdn'],
  ['aws.route53', 'Amazon Route 53', 'Amazon Route 53', Signpost, 'network', 'dns'],
  ['aws.elb', 'Elastic Load Balancing', 'Elastic Load Balancing', Split, 'network', 'alb nlb load balancer 로드밸런서'],
  ['aws.natgateway', 'NAT gateway', 'NAT 게이트웨이', ArrowLeftRight, 'network', 'nat'],
  ['aws.igw', 'Internet gateway', '인터넷 게이트웨이', Earth, 'network', 'igw internet'],
  ['aws.iam', 'AWS IAM', 'AWS IAM', KeyRound, 'security', 'identity role policy'],
  ['aws.cognito', 'Amazon Cognito', 'Amazon Cognito', UserCheck, 'security', 'auth user pool'],
  ['aws.secretsmanager', 'AWS Secrets Manager', 'AWS Secrets Manager', Lock, 'security', 'secrets'],
  ['aws.kms', 'AWS KMS', 'AWS KMS', Key, 'security', 'key encryption'],
  ['aws.waf', 'AWS WAF', 'AWS WAF', BrickWall, 'security', 'firewall'],
  ['aws.cloudwatch', 'Amazon CloudWatch', 'Amazon CloudWatch', Activity, 'operations', 'monitoring logs metrics'],
  ['aws.cloudtrail', 'AWS CloudTrail', 'AWS CloudTrail', ScrollText, 'operations', 'audit'],
  ['aws.ses', 'Amazon SES', 'Amazon SES', Mail, 'integration', 'email'],
  ['aws.opensearch', 'Amazon OpenSearch Service', 'Amazon OpenSearch Service', Search, 'analytics', 'search elasticsearch'],
  ['aws.redshift', 'Amazon Redshift', 'Amazon Redshift', Warehouse, 'analytics', 'warehouse'],
  ['aws.sagemaker', 'Amazon SageMaker', 'Amazon SageMaker', Brain, 'analytics', 'ml'],
  ['aws.bedrock', 'Amazon Bedrock', 'Amazon Bedrock', Sparkles, 'analytics', 'ai genai llm'],
];

function define(category: ServiceCategory, rows: Row[]): ServiceDefinition[] {
  return rows.map(([id, en, ko, glyph, color, keywords]) => ({
    id,
    category,
    name: { en, ko },
    keywords: (keywords ?? '').split(' ').filter(Boolean),
    glyph,
    color: ROLE_COLORS[color],
  }));
}

export const SERVICES: readonly ServiceDefinition[] = [...define('general', GENERAL), ...define('aws', AWS)];
const BY_ID = new Map(SERVICES.map((s) => [s.id, s]));

export function findService(id: string): ServiceDefinition | undefined {
  return BY_ID.get(id);
}

/** Case-insensitive search over names (both languages), ids and keywords. */
export function searchServices(query: string): ServiceDefinition[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...SERVICES];
  const scored: { s: ServiceDefinition; score: number }[] = [];
  for (const s of SERVICES) {
    const names = [s.name.en, s.name.ko].map((n) => n.toLowerCase());
    const hay = [...names, s.id, ...s.keywords].join(' ').toLowerCase();
    if (!terms.every((t) => hay.includes(t))) continue;
    const first = terms[0]!;
    const words = names.flatMap((n) => n.split(/[\s()·-]+/));
    let score = 5;
    if (s.id === first || s.keywords.includes(first)) score = 0;
    else if (names.some((n) => n.startsWith(first))) score = 1;
    else if (words.some((w) => w.startsWith(first))) score = 2;
    else if (names.some((n) => n.includes(first))) score = 3;
    else if (s.keywords.some((k) => k.startsWith(first))) score = 4;
    scored.push({ s, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((x) => x.s);
}

const CONTAINER_GLYPHS: Record<ContainerKind, Glyph | null> = {
  cloud: Cloud,
  account: Building2,
  region: Flag,
  'availability-zone': MapPin,
  vpc: Network,
  subnet: Lock,
  custom: null,
};

export function createAppearance(language: 'en' | 'ko'): Appearance {
  const fallback: ServiceAppearance = { name: language === 'ko' ? '알 수 없는 서비스' : 'Unknown service', glyph: Box, color: '#8a94a3' };
  const cache = new Map<string, ServiceAppearance>();
  return {
    service(serviceId) {
      const hit = cache.get(serviceId);
      if (hit) return hit;
      const def = BY_ID.get(serviceId);
      if (!def) return undefined;
      const look = { name: def.name[language], glyph: def.glyph, color: def.color };
      cache.set(serviceId, look);
      return look;
    },
    fallback,
    containerGlyph: (kind) => CONTAINER_GLYPHS[kind],
  };
}
