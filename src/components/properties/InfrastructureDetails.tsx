import { useEffect, useId, useRef, useState } from 'react';
import type { Editor } from '../../application';
import { readInfrastructure, type ArgoCdDetails, type BlockDeviceDetails, type Container, type InfrastructureDetails as Details, type Node, type NodeClassDetails, type NodeProvisioningDetails, type PlacementSelector, type WorkloadDetails } from '../../domain';
import type { Translate } from '../../i18n/messages';
import { Section } from '../ui/controls';
import { CloudFront, Waf } from './EdgeInfrastructure';
import { Entry, Fields, List } from './InfrastructureFields';
import { ResourceSettingsView } from './ResourceSettingsView';

function displaySelectors(selectors: readonly PlacementSelector[]): string[] {
  return selectors.map(({ key, operator, source, values }) =>
    [source === 'field' ? `matchFields.${key}` : key, operator, values?.join(', ')].filter(Boolean).join(' '));
}

function ArgoCd({ details, t }: { details: ArgoCdDetails; t: Translate }) {
  const { automated, destination } = details;
  return (
    <section>
      <h3>{t(details.template ? 'infra.argoTemplate' : 'infra.argoCd')}</h3>
      <Fields t={t} fields={[['infra.argoProject', details.project]]} />
      {destination && <Entry name={t('infra.destination')} values={[destination.name ?? destination.server ?? '', destination.namespace ?? ''].filter(Boolean)} />}
      <List title={t('infra.sources')}>{details.sources?.map((source) => (
        <>
          <strong>{source.repoURL}</strong>
          <Fields t={t} fields={[
            ['infra.revision', source.targetRevision], ['infra.path', source.path], ['infra.chart', source.chart],
            ['infra.sourceRef', source.ref], ['infra.releaseName', source.helm?.releaseName],
            ['infra.ignoreMissingValueFiles', source.helm?.ignoreMissingValueFiles],
            ['infra.argoDirectoryRecurse', source.directory?.recurse],
          ]} />
          <Entry name={t('infra.valueFiles')} values={source.helm?.valueFiles} />
        </>
      ))}</List>
      {automated && <section>
        <h3>{t('infra.autoSync')}</h3>
        <Fields t={t} fields={[
          ['infra.autoSyncStatus', automated.enabled], ['infra.prune', automated.prune],
          ['infra.selfHeal', automated.selfHeal], ['infra.allowEmpty', automated.allowEmpty],
        ]} />
      </section>}
      <Entry name={t('infra.syncOptions')} values={details.syncOptions} />
    </section>
  );
}

function Workload({ details, t }: { details: WorkloadDetails; t: Translate }) {
  return <section>
    <h3>{t('infra.workload')}</h3>
    <Fields t={t} fields={[
      ['infra.replicas', details.replicas], ['infra.cronSchedule', details.schedule], ['infra.timeZone', details.timeZone],
    ]} />
  </section>;
}

function NodeProvisioning({ details, t }: { details: NodeProvisioningDetails; t: Translate }) {
  const { disruption } = details;
  const taintLabel = ({ key, value, effect }: NonNullable<NodeProvisioningDetails['taints']>[number]) =>
    <><strong>{value === undefined ? key : `${key}=${value}`}</strong><span>{effect}</span></>;
  return (
    <section>
      <h3>{t('infra.provisioning')}</h3>
      <List title={t('infra.taints')}>{details.taints?.map(taintLabel)}</List>
      <List title={t('infra.startupTaints')}>{details.startupTaints?.map(taintLabel)}</List>
      <List title={t('infra.limits')}>{details.limits?.map(({ resource, quantity }) => <Entry name={resource} values={[quantity]} />)}</List>
      <List title={t('infra.instanceRequirements')}>{details.requirements?.map(({ key, operator, values, minValues }) => (
        <>
          <Entry name={key} values={[[operator, values?.map((value) => value === '' ? '""' : value).join(', ')].filter(Boolean).join(' ')]} />
          <Fields t={t} fields={[['infra.minValues', minValues]]} />
        </>
      ))}</List>
      {disruption && <section>
        <h3>{t('infra.disruption')}</h3>
        <Fields t={t} fields={[
          ['infra.consolidationPolicy', disruption.consolidationPolicy], ['infra.consolidateAfter', disruption.consolidateAfter],
          ['infra.expireAfter', disruption.expireAfter], ['infra.terminationGracePeriod', disruption.terminationGracePeriod],
        ]} />
        <List title={t('infra.budgets')}>{disruption.budgets?.map((budget) => (
          <>
            <Fields t={t} fields={[
              ['infra.budgetNodes', budget.nodes], ['infra.schedule', budget.schedule], ['infra.duration', budget.duration],
            ]} />
            <Entry name={t('infra.reasons')} values={budget.reasons} />
          </>
        ))}</List>
      </section>}
    </section>
  );
}

function tagsText(tags: readonly { key: string; value: string }[] | undefined) {
  return tags?.map(({ key, value }) => `${key}=${value === '' ? '""' : value}`);
}

function NodeClass({ details, t }: { details: NodeClassDetails; t: Translate }) {
  return <section>
    <h3>{t('infra.nodeClass')}</h3>
    <Fields t={t} fields={[
      ['infra.amiFamily', details.amiFamily], ['infra.nodeRole', details.role], ['infra.instanceProfile', details.instanceProfile],
    ]} />
    <List title={t('infra.amiTerms')}>{details.amiSelectorTerms?.map((term) => (
      <>
        <Fields t={t} fields={[
          ['infra.amiAlias', term.alias], ['infra.amiId', term.id], ['infra.amiName', term.name],
          ['infra.amiOwner', term.owner], ['infra.amiParameter', term.ssmParameter],
        ]} />
        <Entry name={t('infra.amiTags')} values={tagsText(term.tags)} />
      </>
    ))}</List>
    <List title={t('infra.subnetTerms')}>{details.subnetSelectorTerms?.map((term) => (
      <>
        <Fields t={t} fields={[['infra.subnetId', term.id]]} />
        <Entry name={t('infra.tags')} values={tagsText(term.tags)} />
      </>
    ))}</List>
    <List title={t('infra.securityGroupTerms')}>{details.securityGroupSelectorTerms?.map((term) => (
      <>
        <Fields t={t} fields={[['infra.securityGroupId', term.id], ['infra.securityGroupName', term.name]]} />
        <Entry name={t('infra.tags')} values={tagsText(term.tags)} />
      </>
    ))}</List>
  </section>;
}

function BlockDevices({ devices, t }: { devices: readonly BlockDeviceDetails[]; t: Translate }) {
  return <List title={t('infra.blockDevices')}>{devices.map((device) => (
    <>
      <strong>{[device.deviceName, device.volumeType, device.volumeSize].filter(Boolean).join(' · ')}</strong>
      <Fields t={t} fields={[
        ['infra.rootVolume', device.rootVolume], ['infra.encrypted', device.encrypted],
        ['infra.deleteOnTermination', device.deleteOnTermination], ['infra.iops', device.iops],
        ['infra.throughput', device.throughput], ['infra.snapshot', device.snapshotId],
        ['infra.kmsKey', device.kmsKeyId], ['infra.volumeInitializationRate', device.volumeInitializationRate],
      ]} />
    </>
  ))}</List>;
}

export function InfrastructureDetails({ details, t }: { details: Details; t: Translate }) {
  const { securityGroupRules, iamStatements, iamPolicyRefs, remoteStates, placement, argoCd, workload, nodeProvisioning, nodeClass, blockDevices, cloudFront, waf, resourceSettings } = details;
  return (
    <div className="infra-details">
      {argoCd && <ArgoCd details={argoCd} t={t} />}
      {workload && <Workload details={workload} t={t} />}
      {nodeProvisioning && <NodeProvisioning details={nodeProvisioning} t={t} />}
      {nodeClass && <NodeClass details={nodeClass} t={t} />}
      {blockDevices && <BlockDevices devices={blockDevices} t={t} />}
      {cloudFront && <CloudFront details={cloudFront} t={t} />}
      {waf && <Waf details={waf} t={t} />}
      {resourceSettings && <ResourceSettingsView settings={resourceSettings} t={t} />}
      <List title={t('infra.security')}>{securityGroupRules?.map(({ direction, protocol, fromPort, toPort, peers, group, description }) => (
        <>
          <strong>{t(`infra.${direction}`)} · {protocol === '-1' ? t('infra.protocols') : protocol}
            {fromPort === undefined ? '' : fromPort === toPort || toPort === undefined ? ` ${fromPort}` : ` ${fromPort}–${toPort}`}
          </strong>
          <span>{peers.join(', ')}</span>
          {group && <span>{group}</span>}
          {description && <span>{description}</span>}
        </>
      ))}</List>
      <List title={t('infra.iam')}>{iamStatements?.map((s) => (
        <>
          <strong>{[s.effect, s.sid, s.policy].filter(Boolean).join(' · ')}</strong>
          <Entry name="Action" values={s.actions} /><Entry name="NotAction" values={s.notActions} />
          <Entry name="Resource" values={s.resources} /><Entry name="NotResource" values={s.notResources} />
          <Entry name="Principal" values={s.principals?.map((p) => `${p.type} ${p.values.join(', ')}`)} />
          <Entry name="NotPrincipal" values={s.notPrincipals?.map((p) => `${p.type} ${p.values.join(', ')}`)} />
          <Entry name="Condition" values={s.conditions?.map((c) => `${c.operator} ${c.key} ${c.values.join(', ')}`)} />
        </>
      ))}</List>
      <List title={t('infra.policies')}>{iamPolicyRefs?.map((ref) => <span>{ref}</span>)}</List>
      <List title={t('infra.remote')}>{remoteStates?.map(({ address, backend, outputs }) => (
        <><strong>{[address, backend].filter(Boolean).join(' · ')}</strong><Entry name={t('infra.outputs')} values={outputs} /></>
      ))}</List>
      {placement && <section>
        <h3>{t('infra.placement')}</h3>
        <Entry name={t('infra.nodePools')} values={placement.nodePools} />
        <Entry name={t('infra.nodeGroups')} values={placement.nodeGroups} />
        <Entry name={t('infra.nodeSelector')} values={displaySelectors(placement.nodeSelector ?? [])} />
        <List title={t('infra.required')}>{placement.required?.map((term) => displaySelectors(term).join(' · ') || '∅')}</List>
        <List title={t('infra.preferred')}>{placement.preferred?.map(({ weight, selectors }) => (
          <Entry name={t('infra.weight', { weight })} values={[displaySelectors(selectors).join(' · ') || '∅']} />
        ))}</List>
      </section>}
    </div>
  );
}

export function InfrastructureSection({ target, editor, t }: { target: Node | Container; editor: Editor; t: Translate }) {
  const [input, setInput] = useState<string | null>(null);
  const [error, setError] = useState('');
  const apply = () => {
    if (input === null) return;
    try {
      const value: unknown = JSON.parse(input.trim() || '{}');
      const details = readInfrastructure(value);
      editor.update('serviceId' in target ? 'nodes' : 'containers', target.id, { infrastructure: Object.keys(details).length ? details : undefined });
      setInput(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Section title={t('infra.title')} defaultOpen={target.infrastructure !== undefined} testId="infrastructure-details">
      {target.infrastructure && <InfrastructureDetails t={t} details={target.infrastructure} />}
      {input === null ? (
        <button type="button" className="chip-button" onClick={() => {
          setError('');
          setInput(JSON.stringify(target.infrastructure ?? {}, null, 2));
        }}>{t('infra.edit')}</button>
      ) : (
        <div className="infra-edit">
          <textarea aria-label={t('infra.title')} rows={7} value={input} onChange={(e) => setInput(e.target.value)} />
          {error && <p role="alert">{t('infra.invalid', { message: error })}</p>}
          <div className="button-row">
            <button type="button" className="chip-button" onClick={apply}>{t('infra.apply')}</button>
            <button type="button" className="chip-button" onClick={() => setInput(null)}>{t('infra.cancel')}</button>
          </div>
        </div>
      )}
    </Section>
  );
}

export function InfrastructureDialog({ target, t, onClose }: { target: Node | Container; t: Translate; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="dialog infra-dialog" aria-labelledby={heading} onClose={onClose}>
      <h2 id={heading}>{t('infra.title')}</h2>
      <p>{target.label.replaceAll('\n', ' ')}</p>
      {target.infrastructure && <InfrastructureDetails t={t} details={target.infrastructure} />}
      <div className="button-row end"><button type="button" onClick={() => ref.current?.close()}>{t('infra.close')}</button></div>
    </dialog>
  );
}
