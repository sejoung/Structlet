import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '../../application';
import { readInfrastructure, type InfrastructureDetails as Details, type Node, type PlacementSelector } from '../../domain';
import type { Translate } from '../../i18n/messages';
import { Section } from '../ui/controls';

function List({ title, children }: { title: string; children: ReactNode[] | undefined }) {
  if (!children?.length) return null;
  return <section><h3>{title}</h3><ul>{children.map((item, index) => <li key={index}>{item}</li>)}</ul></section>;
}

function Entry({ name, values }: { name: string; values?: readonly string[] }) {
  return values?.length ? <div><strong>{name}</strong><span>{values.join(', ')}</span></div> : null;
}

function displaySelectors(selectors: readonly PlacementSelector[]): string[] {
  return selectors.map(({ key, operator, source, values }) =>
    [source === 'field' ? `matchFields.${key}` : key, operator, values?.join(', ')].filter(Boolean).join(' '));
}

export function InfrastructureDetails({ details, t }: { details: Details; t: Translate }) {
  const { securityGroupRules, iamStatements, iamPolicyRefs, remoteStates, placement } = details;
  return (
    <div className="infra-details">
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

export function NodeInfrastructureSection({ node, editor, t }: { node: Node; editor: Editor; t: Translate }) {
  const [input, setInput] = useState<string | null>(null);
  const [error, setError] = useState('');
  const apply = () => {
    if (input === null) return;
    try {
      const value: unknown = JSON.parse(input.trim() || '{}');
      const details = readInfrastructure(value);
      editor.update('nodes', node.id, { infrastructure: Object.keys(details).length ? details : undefined });
      setInput(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <Section title={t('infra.title')} defaultOpen={node.infrastructure !== undefined} testId="infrastructure-details">
      {node.infrastructure && <InfrastructureDetails t={t} details={node.infrastructure} />}
      {input === null ? (
        <button type="button" className="chip-button" onClick={() => {
          setError('');
          setInput(JSON.stringify(node.infrastructure ?? {}, null, 2));
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

export function InfrastructureDialog({ node, t, onClose }: { node: Node; t: Translate; onClose(): void }) {
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
      <p>{node.label.replaceAll('\n', ' · ')}</p>
      {node.infrastructure && <InfrastructureDetails t={t} details={node.infrastructure} />}
      <div className="button-row end"><button type="button" onClick={() => ref.current?.close()}>{t('infra.close')}</button></div>
    </dialog>
  );
}
