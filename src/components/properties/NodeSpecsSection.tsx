import { useEffect, useId, useState } from 'react';
import type { Editor } from '../../application';
import { isSpecQuantity, NODE_SPEC_TEXT_LIMIT, type Node, type NodeSpecs } from '../../domain';
import type { Translate } from '../../i18n/messages';
import { Row, Section, Switch } from '../ui/controls';

const FIELDS = [
  ['instanceType', 'text'], ['vcpus', 'number'], ['memoryGiB', 'number'], ['gpu', 'text'], ['diskGiB', 'number'],
] as const;

function SpecInput({ label, value, type, onCommit }: {
  label: string;
  value: number | string | undefined;
  type: 'text' | 'number';
  onCommit(value: string): void;
}) {
  const id = useId();
  const initial = value === undefined ? '' : String(value);
  const [draft, setDraft] = useState(initial);
  useEffect(() => setDraft(initial), [initial]);
  const commit = () => {
    const text = draft.trim();
    if (type === 'number' && text && !isSpecQuantity(Number(text))) {
      setDraft(initial);
      return;
    }
    setDraft(text);
    if (text !== initial) onCommit(text);
  };
  return (
    <Row label={label} htmlFor={id}>
      <input id={id} type={type} value={draft} maxLength={type === 'text' ? NODE_SPEC_TEXT_LIMIT : undefined}
        step={type === 'number' ? 'any' : undefined} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
    </Row>
  );
}

export function NodeSpecsSection({ node, editor, t }: { node: Node; editor: Editor; t: Translate }) {
  const specs = node.specs ?? {};
  const update = (fields: Partial<NodeSpecs>) => {
    const next = { ...specs, ...fields };
    editor.update('nodes', node.id, { specs: Object.values(next).some((value) => value !== undefined) ? next : undefined });
  };
  return (
    <Section title={t('field.specs')} defaultOpen={node.specs !== undefined} testId="equipment-specs">
      {FIELDS.map(([field, type]) => (
        <SpecInput key={field} type={type} label={t(`specs.${field}`)} value={specs[field]}
          onCommit={(value) => update({ [field]: value === '' ? undefined : type === 'number' ? Number(value) : value })} />
      ))}
      <Row label="">
        <Switch label={t('specs.showDetails')} checked={specs.showDetails === true} onChange={(showDetails) => update({ showDetails: showDetails || undefined })} />
      </Row>
    </Section>
  );
}
