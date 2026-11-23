import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { compileDraft } from '../../../src/adapters/draft/compile';
import { importInto } from '../../../src/adapters/draft/import';
import { parseStructlet, serializeStructlet } from '../../../src/adapters/format/structlet-format';
import { emptyDocument } from '../../../src/domain';

const base = emptyDocument('edge', 'Edge infrastructure');

it('imports CloudFront behavior settings, WAF visibility and scoped IP sets from Terraform values', async () => {
  const input = readFileSync(new URL('./fixtures/terraform-edge-policies.json', import.meta.url), 'utf8');
  const result = await importInto(base, input);
  expect(result).toMatchObject({ ok: true, source: 'terraform' });
  if (!result.ok) return;
  const { document } = result;
  const details = (service: string) => document.nodes.find((node) => node.serviceId === service)?.infrastructure;
  const webAcl = 'arn:aws:wafv2:us-east-1:000000000000:global/webacl/example/acl';
  const cloudFront = details('aws.cloudfront')?.cloudFront;
  expect(cloudFront?.webAclId).toBe(webAcl);
  expect(cloudFront?.viewerCertificate).toEqual({ minimumProtocolVersion: 'TLSv1.2_2021' });
  expect(cloudFront?.cacheBehaviors).toEqual([
    {
      originId: 'website', viewerProtocolPolicy: 'redirect-to-https',
      allowedMethods: ['GET', 'HEAD', 'OPTIONS'], cachedMethods: ['GET', 'HEAD'], compress: true,
      cachePolicy: {
        id: 'policy-custom', name: 'website-policy', minTtl: 0, defaultTtl: 600, maxTtl: 1800,
        headers: { behavior: 'whitelist', items: ['Accept-Language'] }, cookies: { behavior: 'none' },
        queryStrings: { behavior: 'allExcept', items: ['v'] }, gzip: true, brotli: false,
      },
    },
    {
      pathPattern: '/static/*', originId: 'assets', cachePolicy: { id: 'policy-unavailable' }, originRequestPolicyId: 'requests-assets',
      viewerProtocolPolicy: 'https-only',
      allowedMethods: ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'],
      cachedMethods: ['GET', 'HEAD', 'OPTIONS'], compress: false,
    },
    { pathPattern: '/legacy/*', originId: 'compatibility', cachePolicy: { minTtl: 0, defaultTtl: 30, maxTtl: 300 } },
    { pathPattern: '/images/*', originId: 'assets', cachePolicy: { id: 'policy-data', name: 'images-policy', minTtl: 10 } },
  ]);
  const waf = details('aws.waf')?.waf;
  expect(waf).toMatchObject({
    id: webAcl, scope: 'CLOUDFRONT', defaultAction: 'allow',
    visibility: { metricName: 'website-acl-metrics', cloudWatchMetricsEnabled: true, sampledRequestsEnabled: false },
    ipSets: [{
      reference: 'arn:aws:wafv2:us-east-1:000000000000:global/ipset/example/test',
      name: 'address-allowlist', ipAddressVersion: 'IPV4', addresses: ['192.0.2.0/24', '198.51.100.4/32'],
    }],
    rules: [
      { name: 'managed-baseline', priority: 1, overrideAction: 'none', statements: [{
        kind: 'managed_rule_group', name: 'AWSManagedRulesCommonRuleSet', vendor: 'AWS',
        actionOverrides: [{ name: 'ExampleRule', action: 'count' }],
      }] },
      { name: 'test-rule-group', priority: 5, overrideAction: 'count', statements: [{
        kind: 'rule_group_reference', reference: 'arn:aws:wafv2:us-east-1:000000000000:global/rulegroup/sample/group',
      }] },
      {
        name: 'header-check', priority: 10, action: 'count', statements: [{ kind: 'byte_match' }],
        visibility: { metricName: 'header-metrics', cloudWatchMetricsEnabled: false, sampledRequestsEnabled: false },
      },
      {
        name: 'request-rate', priority: 20, action: 'block',
        visibility: { metricName: 'rate-metrics', cloudWatchMetricsEnabled: false, sampledRequestsEnabled: true },
        statements: [{
          kind: 'rate_based', limit: 1500, windowSeconds: 120, aggregateKeyType: 'IP',
          scopeDown: [{ kind: 'or', children: [
            { kind: 'ip_set_reference', reference: expect.stringContaining('ipset/example/test') },
            { kind: 'ip_set_reference', reference: expect.stringContaining('ipset/external/unknown') },
            { kind: 'geo_match', countryCodes: ['KR', 'JP'] },
          ] }],
        }],
      },
    ],
  });
  expect(document.annotations).toHaveLength(0);
  const file = serializeStructlet(document);
  expect(file).not.toContain('SYNTHETIC_PRIVATE_MATCH_VALUE');
  expect(file).not.toContain('2001:db8::/32');
  expect(parseStructlet(file)).toEqual({ ok: true, document });
});

it('retains a WAF IP set at the AWS address quota', () => {
  const addresses = Array.from({ length: 10_000 }, (_, index) => `2001:db8::${index.toString(16)}/128`);
  const result = compileDraft(JSON.stringify({ nodes: [{ id: 'waf', infrastructure: {
    waf: { ipSets: [{ reference: 'ipv6', ipAddressVersion: 'IPV6', addresses }] },
  } }] }), base);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(parseStructlet(result.text)).toMatchObject({
    ok: true, document: { nodes: [{ infrastructure: { waf: { ipSets: [{ addresses }] } } }] },
  });
});

it.each([
  [{ nodeClass: { subnetSelectorTerms: [{ id: 32 }] } }, 'nodeClass.subnetSelectorTerms[0].id'],
  [{ cloudFront: { cacheBehaviors: [{ cachePolicy: { defaultTtl: -1 } }] } }, 'cloudFront.cacheBehaviors[0].cachePolicy.defaultTtl'],
  [{ cloudFront: { cacheBehaviors: [{ viewerProtocolPolicy: 'http-only' }] } }, 'cloudFront.cacheBehaviors[0].viewerProtocolPolicy'],
  [{ cloudFront: { cacheBehaviors: [{ cachedMethods: 'GET' }] } }, 'cloudFront.cacheBehaviors[0].cachedMethods'],
  [{ cloudFront: { viewerCertificate: { minimumProtocolVersion: 1.2 } } }, 'cloudFront.viewerCertificate.minimumProtocolVersion'],
  [{ waf: { visibility: { sampledRequestsEnabled: 'false' } } }, 'waf.visibility.sampledRequestsEnabled'],
  [{ waf: { rules: [{ name: 'test', priority: 0, action: 'bad' }] } }, 'waf.rules[0].action'],
])('rejects malformed edge infrastructure', (infrastructure, path) => {
  const result = compileDraft(JSON.stringify({ nodes: [{ id: 'edge', infrastructure }] }), base);
  expect(result).toMatchObject({ ok: false, errors: [expect.stringContaining(path)] });
});
