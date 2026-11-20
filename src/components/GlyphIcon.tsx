import { createElement } from 'react';
import type { Glyph } from '../engine';

/** Small inline icon for the panels, drawn from the same glyph data as the diagram. */
export function GlyphIcon({ glyph, size = 18, color = 'currentColor', strokeWidth = 1.8 }: { glyph: Glyph; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {glyph.map(([tag, attrs], i) => {
        const props: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(attrs)) if (v !== undefined && k !== 'key') props[k] = v;
        return createElement(tag, { key: i, ...props });
      })}
    </svg>
  );
}

export function ServiceTile({ glyph, color, size = 28 }: { glyph: Glyph; color: string; size?: number }) {
  return (
    <span className="service-tile" style={{ background: color, width: size, height: size }}>
      <GlyphIcon glyph={glyph} size={size * 0.64} color="#fff" />
    </span>
  );
}
