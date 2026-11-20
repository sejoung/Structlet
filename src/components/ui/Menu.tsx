import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export interface MenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: IconName;
  readonly shortcut?: string;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  /** Draws a divider above the item. */
  readonly separated?: boolean;
  readonly heading?: string;
  onSelect(): void;
}

interface MenuProps {
  readonly label: ReactNode;
  readonly ariaLabel?: string;
  readonly items: readonly MenuItem[];
  readonly testId: string;
  readonly className?: string;
  readonly align?: 'start' | 'end';
  /** Called when the menu opens, e.g. to load what its items need. */
  readonly onOpen?: () => void;
}

/** A button that opens a list of actions. Arrow keys move, Escape closes, clicking outside closes. */
export function Menu({ label, ariaLabel, items, testId, className = '', align = 'start', onOpen }: MenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    list.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const move = (delta: number) => {
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(at + delta + buttons.length) % buttons.length]?.focus();
  };
  return (
    <div className={`menu ${className}`} ref={root}>
      <button type="button" className="menu-button" aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={ariaLabel} data-testid={testId} onClick={() => {
          if (!open) onOpen?.();
          setOpen((o) => !o);
        }}>
        {label}
      </button>
      {open && (
        <div
          className={`menu-list ${align}`}
          role="menu"
          id={id}
          ref={list}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              root.current?.querySelector<HTMLButtonElement>('.menu-button')?.focus();
            }
            if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
            if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
          }}
        >
          {items.map((item) => (
            <div key={item.id} className={item.separated ? 'menu-group separated' : 'menu-group'}>
              {item.heading && <div className="menu-heading">{item.heading}</div>}
              <button
                type="button"
                role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                aria-checked={item.checked}
                disabled={item.disabled}
                data-testid={item.id}
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <span className="menu-icon">{item.icon ? <Icon name={item.icon} /> : item.checked ? <Icon name="check" /> : null}</span>
                <span className="menu-label">{item.label}</span>
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
