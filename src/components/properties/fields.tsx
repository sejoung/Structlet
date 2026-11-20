import { useEffect, useState, type ReactNode } from 'react';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function TextArea({ label, value, onChange, testId }: { label: string; value: string; onChange(v: string): void; testId?: string }) {
  return (
    <Field label={label}>
      <textarea value={value} rows={Math.min(6, Math.max(2, value.split('\n').length))} onChange={(e) => onChange(e.target.value)} data-testid={testId} spellCheck={false} />
    </Field>
  );
}

export function Select<T extends string>({ label, value, options, onChange, testId }: { label: string; value: T; options: readonly { value: T; label: string }[]; onChange(v: T): void; testId?: string }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} data-testid={testId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function Check({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange(v: boolean): void; testId?: string }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      {label}
    </label>
  );
}

/** Number input that commits on blur or Enter. */
function NumberInput({ value, onCommit, label }: { value: number; onCommit(v: number): void; label: string }) {
  const [text, setText] = useState(String(Math.round(value)));
  useEffect(() => setText(String(Math.round(value))), [value]);
  const commit = () => {
    const v = Number(text);
    if (Number.isFinite(v) && v !== Math.round(value)) onCommit(v);
    else setText(String(Math.round(value)));
  };
  return (
    <input
      type="number"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

export function Pair({ label, a, b, names, onA, onB }: { label: string; a: number; b: number; names: [string, string]; onA(v: number): void; onB(v: number): void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="pair">
        <span>{names[0]}</span>
        <NumberInput value={a} onCommit={onA} label={`${label} ${names[0]}`} />
        <span>{names[1]}</span>
        <NumberInput value={b} onCommit={onB} label={`${label} ${names[1]}`} />
      </div>
    </div>
  );
}

export function Buttons({ children }: { children: ReactNode }) {
  return <div className="button-row">{children}</div>;
}
