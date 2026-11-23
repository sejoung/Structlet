import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createAppearance, packServices, SERVICES } from '../../../src/adapters/catalog/services';
import { exportSvg } from '../../../src/adapters/export/image-export';
import { buildIconPack, filesFromZip, type PackFile } from '../../../src/adapters/icon-packs/build';
import { createMatcher, normalize } from '../../../src/adapters/icon-packs/matching';
import { computeScene, renderIsometricSvg } from '../../../src/engine';
import { sampleDocument } from '../fixtures';

const svg = (label: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><title>${label}</title><rect width="48" height="48"/></svg>`);
const file = (path: string): PackFile => ({ path, data: svg(path) });

const AWS_FILES = [
  'Architecture-Service-Icons/Arch_Compute/48/Arch_Amazon-EC2_48.svg',
  'Architecture-Service-Icons/Arch_Compute/64/Arch_Amazon-EC2_64.svg',
  'Architecture-Service-Icons/Arch_Compute/48/Arch_AWS-Lambda_48.svg',
  'Architecture-Service-Icons/Arch_Containers/48/Arch_Amazon-Elastic-Container-Service_48.svg',
  'Architecture-Service-Icons/Arch_Storage/48/Arch_Amazon-Simple-Storage-Service_48.svg',
  'Architecture-Service-Icons/Arch_Database/48/Arch_Amazon-Aurora_48.svg',
  'Architecture-Service-Icons/Arch_Database/48/Arch_Amazon-ElastiCache_48.svg',
  'Architecture-Service-Icons/Arch_App-Integration/48/Arch_Amazon-Simple-Queue-Service_48.svg',
  'Architecture-Service-Icons/Arch_Networking-Content-Delivery/48/Arch_Amazon-Route-53_48.svg',
  'Architecture-Service-Icons/Arch_Networking-Content-Delivery/48/Arch_Elastic-Load-Balancing_48.svg',
  'Architecture-Service-Icons/Arch_Business-Applications/48/Arch_Amazon-Simple-Email-Service_48.svg',
  'Architecture-Service-Icons/Arch_Business-Applications/48/Arch_Amazon-Chime_48.svg',
  'Resource-Icons/Res_Networking-Content-Delivery/Res_Amazon-VPC_NAT-Gateway_48.svg',
  'Architecture-Group-Icons/AWS-Cloud-logo_32.svg',
  'Architecture-Group-Icons/Region_32.svg',
  'Architecture-Group-Icons/Virtual-private-cloud-VPC_32.svg',
  'Architecture-Group-Icons/Private-subnet_32.svg',
  '__MACOSX/._Arch_Amazon-EC2_48.svg',
];

describe('icon file matching', () => {
  it('normalizes provider file names', () => {
    expect(normalize('Arch_Amazon-EC2_48.svg')).toBe('amazon-ec2');
    expect(normalize('10021-icon-service-Virtual-Machine.svg')).toBe('virtual-machine');
    expect(normalize('icons/svg/resources/unlabeled/deploy.svg')).toBe('deploy');
  });

  it('maps names of every provider to catalog services and areas', () => {
    const aws = createMatcher('aws', SERVICES);
    expect(aws.service('Arch_Amazon-Simple-Storage-Service_48.svg')).toBe('aws.s3');
    expect(aws.service('Arch_Amazon-DynamoDB_48.svg')).toBe('aws.dynamodb');
    expect(aws.area('Virtual-private-cloud-VPC_32.svg')).toBe('vpc');
    const azure = createMatcher('azure', SERVICES);
    expect(azure.service('10021-icon-service-Virtual-Machine.svg')).toBe('azure.vm');
    expect(azure.service('10023-icon-service-Kubernetes-Services.svg')).toBe('azure.aks');
    expect(azure.service('10137-icon-service-Cache-Redis.svg')).toBe('azure.cache-redis');
    expect(azure.service('10245-icon-service-Key-Vaults.svg')).toBe('azure.key-vault');
    expect(azure.service('10029-icon-service-Function-Apps.svg')).toBe('azure.functions');
    const gcp = createMatcher('gcp', SERVICES);
    expect(gcp.service('Cloud-Run.svg')).toBe('gcp.cloud-run');
    expect(gcp.service('BigQuery.svg')).toBe('gcp.bigquery');
    expect(gcp.service('pubsub.svg')).toBe('gcp.pubsub');
    const k8s = createMatcher('k8s', SERVICES);
    expect(k8s.service('resources/unlabeled/deploy.svg')).toBe('k8s.deployment');
    expect(k8s.area('resources/unlabeled/ns.svg')).toBe('namespace');
  });
});

describe('building a pack', () => {
  it('detects the provider, prefers 48px SVG, keeps unknown icons as extra services', () => {
    const result = buildIconPack(AWS_FILES.map(file), 'auto', 'AWS icons', 'pack-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.pack;
    expect(p.provider).toBe('aws');
    expect(Object.keys(p.icons)).toEqual(expect.arrayContaining(['aws.ec2', 'aws.lambda', 'aws.ecs', 'aws.s3', 'aws.aurora', 'aws.sqs', 'aws.route53', 'aws.elb', 'aws.ses', 'aws.natgateway']));
    expect(atob(p.icons['aws.ec2']!.data)).toContain('_48.svg');
    expect(Object.keys(p.areas).sort()).toEqual(['cloud', 'region', 'subnet', 'vpc']);
    expect(p.extras).toEqual([{ id: 'aws.pack.chime', name: 'Chime' }]);
    expect(packServices([p]).map((s) => s.id)).toEqual(['aws.pack.chime']);
  });

  it('attaches user-loaded AWS service and endpoint icons to the built-in service IDs', () => {
    const names = {
      'aws.ecr': 'Arch_Amazon-Elastic-Container-Registry_48.svg',
      'aws.documentdb': 'Arch_Amazon-DocumentDB_48.svg',
      'aws.msk': 'Arch_Amazon-Managed-Streaming-for-Apache-Kafka_48.svg',
      'aws.systems-manager': 'Arch_AWS-Systems-Manager_48.svg',
      'aws.acm': 'Arch_AWS-Certificate-Manager_48.svg',
      'aws.vpc-endpoint': 'Res_Amazon-VPC_Endpoints_48.svg',
    };
    const result = buildIconPack(Object.values(names).map(file), 'auto', 'AWS icons', 'pack-aws-services');
    if (!result.ok) throw new Error(result.error);
    expect(result.pack.provider).toBe('aws');
    expect(result.pack.extras).toEqual([]);
    const withPack = createAppearance('ko', [result.pack]);
    const withoutPack = createAppearance('ko');
    for (const [id, name] of Object.entries(names)) {
      expect(atob(result.pack.icons[id]!.data)).toContain(name);
      expect(withPack.service(id)?.image).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(withoutPack.service(id)?.glyph).toBeDefined();
      expect(withoutPack.service(id)?.image).toBeUndefined();
    }
  });

  it('links new AWS nodes to previously loaded packs and old nodes to re-imported packs', () => {
    const service = 'aws.ecr';
    const legacy = 'aws.pack.elastic-container-registry';
    const result = buildIconPack([file('Arch_Amazon-Elastic-Container-Registry_48.svg')], 'aws', 'AWS', 'p');
    if (!result.ok) throw new Error(result.error);
    const current = createAppearance('en', [result.pack]);
    const stored = createAppearance('en', [{
      ...result.pack,
      icons: { [legacy]: result.pack.icons[service]! },
      extras: [{ id: legacy, name: 'Elastic Container Registry' }],
    }]);
    for (const appearance of [current, stored]) {
      expect(appearance.service(legacy)?.image).toBe(current.service(service)?.image);
      expect(appearance.service(service)?.image).toBe(current.service(service)?.image);
    }
  });

  it('reads zips, including a nested zip', () => {
    const inner = zipSync({ 'Arch_AWS-Lambda_48.svg': svg('lambda') });
    const outer = zipSync({ 'Asset-Package/Arch_Amazon-EC2_48.svg': svg('ec2'), 'Asset-Package/readme.txt': new Uint8Array([1]), 'Asset-Package/more.zip': inner });
    const files = filesFromZip(outer);
    expect(files.map((f) => f.path).sort()).toEqual(['Asset-Package/Arch_Amazon-EC2_48.svg', 'Asset-Package/more.zip/Arch_AWS-Lambda_48.svg']);
  });

  it('rejects folders without usable icons and oversized icons', () => {
    expect(buildIconPack([{ path: 'a.txt', data: new Uint8Array(3) }], 'auto', 'x', 'x').ok).toBe(false);
    const big = buildIconPack([{ path: 'Arch_Amazon-EC2_48.svg', data: new Uint8Array(600 * 1024) }, file('Arch_AWS-Lambda_48.svg')], 'aws', 'x', 'x');
    expect(big.ok && big.skipped).toBe(1);
  });
});

describe('rendering with a pack', () => {
  it('uses pack images on canvas, exports and isometric view; one symbol per icon', () => {
    const result = buildIconPack(AWS_FILES.map(file), 'aws', 'AWS', 'p');
    if (!result.ok) throw new Error(result.error);
    const look = createAppearance('en', [result.pack]);
    const doc = sampleDocument();
    const scene = computeScene(doc, look);
    expect(scene.nodes.find((n) => n.id === 'queue')!.image).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(scene.nodes.find((n) => n.id === 'user')!.image).toBeNull();
    expect(scene.containers.find((c) => c.id === 'vpc')!.image).not.toBeNull();
    const out = exportSvg(doc, look);
    expect(out).toContain('xmlns:xlink');
    expect(out.match(/<symbol /g)!.length).toBe(new Set(scene.nodes.map((n) => n.image).concat(scene.containers.map((c) => c.image)).filter(Boolean)).size);
    expect(renderIsometricSvg(scene).svg).toContain('<use href="#sl-iso-img-');
    expect(computeScene(doc, createAppearance('en', [{ ...result.pack, enabled: false }])).nodes.every((n) => n.image === null)).toBe(true);
  });
});
