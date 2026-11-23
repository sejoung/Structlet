import { useEffect, useId, useState } from 'react';
import { Row } from '../ui/controls';

export function TextArea({ label, value, onChange, testId }: { label: string; value: string; onChange(v: string): void; testId?: string }) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id}>
      <textarea id={id} value={value} rows={Math.min(5, Math.max(1, value.split('\n').length))} onChange={(e) => onChange(e.target.value)} data-testid={testId} spellCheck={false} />
    </Row>
  );
}

export function Select<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange(v: T): void; testId?: string }) {
  const id = useId();
  return (
    <Row label={label} htmlFor={id}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} data-testid={testId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Row>
  );
}

function NumberInput({ value, onCommit, label, prefix }: { value: number; onCommit(v: number): void; label: string; prefix: string }) {
  const [text, setText] = useState(String(Math.round(value)));
  useEffect(() => setText(String(Math.round(value))), [value]);
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v) && v !== Math.round(value)) onCommit(v);
    else setText(String(Math.round(value)));
  };
  return (
    <label className="number-field">
      <span aria-hidden="true">{prefix}</span>
      <input type="number" aria-label={label} value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </label>
  );
}

export function Pair({ label, a, b, names, onA, onB }: { label: string; a: number; b: number; names: [string, string]; onA(v: number): void; onB(v: number): void }) {
  return (
    <Row label={label}>
      <div className="pair">
        <NumberInput value={a} onCommit={onA} label={`${label} ${names[0]}`} prefix={names[0]} />
        <NumberInput value={b} onCommit={onB} label={`${label} ${names[1]}`} prefix={names[1]} />
      </div>
    </Row>
  );
}
