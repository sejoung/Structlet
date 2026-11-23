import type { CachePolicyDetails, CloudFrontDetails } from '../../domain';
import { block, blocks, boolean, natural, present, text, texts } from './infrastructure-values';
import type { TerraformResource } from './terraform-resource';

function cacheKey(value: unknown, name: string, parameter: string) {
  const config = block(value);
  const behavior = text(config[name]);
  if (!behavior) return undefined;
  const items = texts(block(config[parameter]).items);
  return { behavior, items: items.length ? items : undefined };
}

function ttl(values: Record<string, unknown>) {
  return { minTtl: natural(values.min_ttl), defaultTtl: natural(values.default_ttl), maxTtl: natural(values.max_ttl) };
}

function cachePolicy(values: Record<string, unknown>): CachePolicyDetails {
  const key = block(values.parameters_in_cache_key_and_forwarded_to_origin);
  return {
    id: text(values.id), name: text(values.name), ...ttl(values),
    headers: cacheKey(key.headers_config, 'header_behavior', 'headers'),
    cookies: cacheKey(key.cookies_config, 'cookie_behavior', 'cookies'),
    queryStrings: cacheKey(key.query_strings_config, 'query_string_behavior', 'query_strings'),
    gzip: boolean(key.enable_accept_encoding_gzip),
    brotli: boolean(key.enable_accept_encoding_brotli),
  };
}

export function cloudFrontIndex(resources: readonly TerraformResource[]) {
  const policies = new Map(resources.flatMap((r) => {
    if (r.type !== 'aws_cloudfront_cache_policy' || r.sensitive_values?.id) return [];
    const id = text(r.values?.id);
    return id ? [[id, cachePolicy(r.values ?? {})] as const] : [];
  }));
  return (r: TerraformResource): CloudFrontDetails | undefined => {
    if (r.type !== 'aws_cloudfront_distribution') return undefined;
    const v = r.values ?? {};
    const behavior = (config: Record<string, unknown>, ordered: boolean) => {
      const id = text(config.cache_policy_id);
      return present({
        pathPattern: ordered ? text(config.path_pattern) : undefined,
        originId: text(config.target_origin_id),
        cachePolicy: id ? policies.get(id) ?? { id } : present(ttl(config)),
        originRequestPolicyId: text(config.origin_request_policy_id),
      });
    };
    const cacheBehaviors = [
      ...blocks(v.default_cache_behavior).flatMap((entry) => behavior(entry, false) ?? []),
      ...blocks(v.ordered_cache_behavior).flatMap((entry) => behavior(entry, true) ?? []),
    ];
    return present({ webAclId: text(v.web_acl_id), cacheBehaviors: cacheBehaviors.length ? cacheBehaviors : undefined });
  };
}
