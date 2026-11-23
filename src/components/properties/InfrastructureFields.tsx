import type { ReactNode } from 'react';
import type { Translate } from '../../i18n/messages';

export function List({ title, children }: { title: string; children: ReactNode[] | undefined }) {
  if (!children?.length) return null;
  return <section><h3>{title}</h3><ul>{children.map((item, index) => <li key={index}>{item}</li>)}</ul></section>;
}

export function Entry({ name, values }: { name: string; values?: readonly string[] }) {
  return values?.length ? <div><strong>{name}</strong><span>{values.join(', ')}</span></div> : null;
}

type Value = string | number | boolean | undefined;

export function Fields({ t, fields }: { t: Translate; fields: readonly (readonly [Parameters<Translate>[0], Value])[] }) {
  return fields.map(([key, value]) => <Entry key={key} name={t(key)} values={value === undefined ? undefined : [
    typeof value === 'boolean' ? t(value ? 'infra.enabled' : 'infra.disabled') : String(value),
  ]} />);
}
