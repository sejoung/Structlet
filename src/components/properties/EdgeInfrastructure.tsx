import type { CachePolicyDetails, CloudFrontDetails, WafDetails, WafStatement } from '../../domain';
import type { Translate } from '../../i18n/messages';
import { Entry, Fields, List } from './InfrastructureFields';

function keyValues(key: CachePolicyDetails['headers']) {
  return key ? [key.behavior, ...(key.items ?? [])] : undefined;
}

function CachePolicy({ policy, t }: { policy: CachePolicyDetails; t: Translate }) {
  return <>
    <Fields t={t} fields={[
      ['infra.cachePolicyName', policy.name], ['infra.cachePolicyId', policy.id],
      ['infra.minTtl', policy.minTtl], ['infra.defaultTtl', policy.defaultTtl], ['infra.maxTtl', policy.maxTtl],
      ['infra.gzip', policy.gzip], ['infra.brotli', policy.brotli],
    ]} />
    <Entry name={t('infra.cacheHeaders')} values={keyValues(policy.headers)} />
    <Entry name={t('infra.cacheCookies')} values={keyValues(policy.cookies)} />
    <Entry name={t('infra.cacheQueryStrings')} values={keyValues(policy.queryStrings)} />
  </>;
}

export function CloudFront({ details, t }: { details: CloudFrontDetails; t: Translate }) {
  return <section>
    <h3>{t('infra.cloudFront')}</h3>
    <Fields t={t} fields={[['infra.webAclReference', details.webAclId]]} />
    <List title={t('infra.cacheBehaviors')}>{details.cacheBehaviors?.map((behavior) => (
      <>
        <strong>{behavior.pathPattern ?? t('infra.defaultBehavior')}</strong>
        <Fields t={t} fields={[
          ['infra.cacheOrigin', behavior.originId], ['infra.originRequestPolicy', behavior.originRequestPolicyId],
        ]} />
        {behavior.cachePolicy && <CachePolicy policy={behavior.cachePolicy} t={t} />}
      </>
    ))}</List>
  </section>;
}

function Statements({ items, t }: { items: readonly WafStatement[] | undefined; t: Translate }) {
  return <List title={t('infra.wafConditions')}>{items?.map((statement) => (
    <>
      <strong>{statement.kind.replaceAll('_', ' ')}</strong>
      <Fields t={t} fields={[
        ['infra.wafReference', statement.reference], ['infra.wafGroupName', statement.name], ['infra.wafVendor', statement.vendor],
        ['infra.wafVersion', statement.version], ['infra.wafLimit', statement.limit], ['infra.wafWindow', statement.windowSeconds],
        ['infra.wafAggregateKey', statement.aggregateKeyType],
      ]} />
      <Entry name={t('infra.wafCountries')} values={statement.countryCodes} />
      <Entry name={t('infra.wafActionOverrides')} values={statement.actionOverrides?.map(({ name, action }) => `${name} · ${action}`)} />
      <Statements items={statement.children} t={t} />
      {!!statement.scopeDown?.length && <section><h3>{t('infra.wafScopeDown')}</h3><Statements items={statement.scopeDown} t={t} /></section>}
    </>
  ))}</List>;
}

export function Waf({ details, t }: { details: WafDetails; t: Translate }) {
  return <section>
    <h3>{t('infra.waf')}</h3>
    <Fields t={t} fields={[
      ['infra.webAclReference', details.id], ['infra.wafScope', details.scope], ['infra.wafDefault', details.defaultAction],
    ]} />
    <List title={t('infra.wafRules')}>{details.rules?.map((rule) => (
      <>
        <strong>{rule.name}</strong>
        <Fields t={t} fields={[
          ['infra.wafPriority', rule.priority], ['infra.wafAction', rule.action], ['infra.wafOverrideAction', rule.overrideAction],
        ]} />
        <Statements items={rule.statements} t={t} />
      </>
    ))}</List>
  </section>;
}
