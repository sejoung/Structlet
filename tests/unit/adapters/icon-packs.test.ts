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

// File names as they appear in the providers' official downloads.
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
    // A disabled pack changes nothing.
    expect(computeScene(doc, createAppearance('en', [{ ...result.pack, enabled: false }])).nodes.every((n) => n.image === null)).toBe(true);
  });
});
