import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { compileDraft } from '../../../src/adapters/draft/compile';
import { importInto } from '../../../src/adapters/draft/import';
import { parseStructlet, serializeStructlet } from '../../../src/adapters/format/structlet-format';
import { emptyDocument } from '../../../src/domain';

const base = emptyDocument('edge', 'Edge infrastructure');

it('imports CloudFront cache policies and scoped WAF rules from Terraform plan values', async () => {
  const input = readFileSync(new URL('./fixtures/terraform-edge-policies.json', import.meta.url), 'utf8');
  const result = await importInto(base, input);
  expect(result).toMatchObject({ ok: true, source: 'terraform' });
  if (!result.ok) return;
  const { document } = result;
  const details = (service: string) => document.nodes.find((node) => node.serviceId === service)?.infrastructure;
  const webAcl = 'arn:aws:wafv2:us-east-1:000000000000:global/webacl/example/acl';
  const cloudFront = details('aws.cloudfront')?.cloudFront;
  expect(cloudFront?.webAclId).toBe(webAcl);
  expect(cloudFront?.cacheBehaviors).toEqual([
    {
      originId: 'website', cachePolicy: {
        id: 'policy-custom', name: 'website-policy', minTtl: 0, defaultTtl: 600, maxTtl: 1800,
        headers: { behavior: 'whitelist', items: ['Accept-Language'] }, cookies: { behavior: 'none' },
        queryStrings: { behavior: 'allExcept', items: ['v'] }, gzip: true, brotli: false,
      },
    },
    { pathPattern: '/static/*', originId: 'assets', cachePolicy: { id: 'policy-unavailable' }, originRequestPolicyId: 'requests-assets' },
    { pathPattern: '/legacy/*', originId: 'compatibility', cachePolicy: { minTtl: 0, defaultTtl: 30, maxTtl: 300 } },
    { pathPattern: '/images/*', originId: 'assets', cachePolicy: { id: 'policy-data', name: 'images-policy', minTtl: 10 } },
  ]);
  const waf = details('aws.waf')?.waf;
  expect(waf).toMatchObject({
    id: webAcl, scope: 'CLOUDFRONT', defaultAction: 'allow',
    rules: [
      { name: 'managed-baseline', priority: 1, overrideAction: 'none', statements: [{
        kind: 'managed_rule_group', name: 'AWSManagedRulesCommonRuleSet', vendor: 'AWS',
        actionOverrides: [{ name: 'ExampleRule', action: 'count' }],
      }] },
      { name: 'test-rule-group', priority: 5, overrideAction: 'count', statements: [{
        kind: 'rule_group_reference', reference: 'arn:aws:wafv2:us-east-1:000000000000:global/rulegroup/sample/group',
      }] },
      { name: 'header-check', priority: 10, action: 'count', statements: [{ kind: 'byte_match' }] },
      { name: 'request-rate', priority: 20, action: 'block', statements: [{
        kind: 'rate_based', limit: 1500, windowSeconds: 120, aggregateKeyType: 'IP',
        scopeDown: [{ kind: 'or', children: [
          { kind: 'ip_set_reference', reference: expect.stringContaining('ipset/example/test') },
          { kind: 'geo_match', countryCodes: ['KR', 'JP'] },
        ] }],
      }] },
    ],
  });
  expect(document.annotations).toHaveLength(0);
  const file = serializeStructlet(document);
  expect(file).not.toContain('SYNTHETIC_PRIVATE_MATCH_VALUE');
  expect(parseStructlet(file)).toEqual({ ok: true, document });
});

it.each([
  [{ nodeClass: { subnetSelectorTerms: [{ id: 32 }] } }, 'nodeClass.subnetSelectorTerms[0].id'],
  [{ cloudFront: { cacheBehaviors: [{ cachePolicy: { defaultTtl: -1 } }] } }, 'cloudFront.cacheBehaviors[0].cachePolicy.defaultTtl'],
  [{ waf: { rules: [{ name: 'test', priority: 0, action: 'bad' }] } }, 'waf.rules[0].action'],
])('rejects malformed edge infrastructure', (infrastructure, path) => {
  const result = compileDraft(JSON.stringify({ nodes: [{ id: 'edge', infrastructure }] }), base);
  expect(result).toMatchObject({ ok: false, errors: [expect.stringContaining(path)] });
});
