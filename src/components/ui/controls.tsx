import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function Segmented<T extends string>({ value, options, onChange, label, testId }: { value: T; options: readonly { value: T; label: string; icon?: IconName }[]; onChange(v: T): void; label: string; testId?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={value === o.value} data-value={o.value} title={o.icon ? o.label : undefined} onClick={() => onChange(o.value)}>
          {o.icon ? <Icon name={o.icon} /> : o.label}
          {o.icon && <span className="sr-only">{o.label}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, testId }: { checked: boolean; onChange(v: boolean): void; label: string; testId?: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} />
      <span className="switch-track" aria-hidden="true" />
      <span>{label}</span>
    </label>
  );
}

export function IconButton({ icon, label, onClick, disabled, testId, pressed, tone }: { icon: IconName; label: string; onClick(): void; disabled?: boolean; testId?: string; pressed?: boolean; tone?: 'danger' }) {
  return (
    <button type="button" className={`icon-button${tone ? ` ${tone}` : ''}`} aria-label={label} title={label} onClick={onClick} disabled={disabled} data-testid={testId} aria-pressed={pressed}>
      <Icon name={icon} />
    </button>
  );
}

export function Section({ title, children, defaultOpen = true, actions, testId }: { title: string; children: ReactNode; defaultOpen?: boolean; actions?: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="section" data-testid={testId}>
      <div className="section-head">
        <button type="button" className="section-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
          {title}
        </button>
        {actions}
      </div>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function Row({ label, children, htmlFor, stacked }: { label: string; children: ReactNode; htmlFor?: string; stacked?: boolean }) {
  return (
    <div className={stacked ? 'row stacked' : 'row'}>
      <label className="row-label" htmlFor={htmlFor}>{label}</label>
      <div className="row-control">{children}</div>
    </div>
  );
}
