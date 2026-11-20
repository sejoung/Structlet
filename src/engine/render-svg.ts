import type { Point, Rect } from '../domain';
import { AREA_STROKE, type Glyph } from './appearance';
import { inflate } from './geometry';
import { ANNOTATION_TEXT, CONTAINER_HEADER, EDGE_LABEL, NODE_LABEL, STEP_SIZE, type Scene, type SceneEdge } from './scene';
import { FONT_FAMILY } from './text';

/**
 * Renders a scene to SVG markup. The canvas shows this exact markup and the
 * SVG/PNG exports wrap it, so screen and files use the same icons, labels and
 * paths.
 */

export const DIAGRAM_COLORS = {
  edge: '#4b5563',
  edgeLabel: '#1f2937',
  nodeLabel: '#111827',
  annotation: '#1f2937',
  background: '#ffffff',
} as const;

export function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

function glyphMarkup(glyph: Glyph, x: number, y: number, size: number, color: string, strokeWidth: number): string {
  const scale = size / 24;
  const parts = glyph
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k, v]) => k !== 'key' && v !== undefined)
        .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})" fill="none" stroke="${color}" stroke-width="${n(strokeWidth / scale)}" stroke-linecap="round" stroke-linejoin="round">${parts}</g>`;
}

function textLines(lines: readonly string[], x: number, y: number, lineHeight: number, attrs: string): string {
  const spans = lines.map((l, i) => `<tspan x="${n(x)}" y="${n(y + i * lineHeight)}">${escapeXml(l)}</tspan>`).join('');
  return `<text ${attrs}>${spans}</text>`;
}

export function pathData(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x)} ${n(p.y)}`).join(' ');
}

function edgeMarkup(e: SceneEdge): string {
  const start = e.style.arrow === 'start' || e.style.arrow === 'both' ? ' marker-start="url(#sl-arrow-start)"' : '';
  const end = e.style.arrow === 'end' || e.style.arrow === 'both' ? ' marker-end="url(#sl-arrow-end)"' : '';
  const dash = e.style.dashed ? ' stroke-dasharray="6 4"' : '';
  return `<path data-edge="${escapeXml(e.id)}" d="${pathData(e.points)}" fill="none" stroke="${DIAGRAM_COLORS.edge}" stroke-width="1.5" stroke-linejoin="round"${dash}${start}${end}/>`;
}

function edgeLabelMarkup(e: SceneEdge): string {
  if (!e.labelBox) return '';
  const b = e.labelBox;
  return (
    `<g data-edge-label="${escapeXml(e.id)}"><rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.width)}" height="${n(b.height)}" rx="3" fill="#ffffff" fill-opacity="0.94"/>` +
    textLines(e.label, b.x + b.width / 2, b.y + EDGE_LABEL.padY + EDGE_LABEL.fontSize - 1, EDGE_LABEL.lineHeight, `font-size="${EDGE_LABEL.fontSize}" fill="${DIAGRAM_COLORS.edgeLabel}" text-anchor="middle"`) +
    '</g>'
  );
}

export const MARKER_DEFS =
  '<defs>' +
  `<marker id="sl-arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 z" fill="${DIAGRAM_COLORS.edge}"/></marker>` +
  `<marker id="sl-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M10 0 L0 5 L10 10 z" fill="${DIAGRAM_COLORS.edge}"/></marker>` +
  '</defs>';

/** Diagram content without the outer `<svg>`, in world coordinates. */
export function renderSceneBody(scene: Scene): string {
  const out: string[] = [MARKER_DEFS];
  for (const c of scene.containers) {
    const stroke = AREA_STROKE[c.style.color] ?? AREA_STROKE.gray!;
    const r = c.rect;
    const dash = c.style.dashed ? ' stroke-dasharray="6 4"' : '';
    const fill = c.style.filled ? `fill="${stroke}" fill-opacity="0.07"` : 'fill="none"';
    out.push(`<g data-container="${escapeXml(c.id)}">`);
    out.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" ${fill} stroke="${stroke}" stroke-width="1.5"${dash}/>`);
    let labelX = r.x + 10;
    if (c.glyph) {
      const g = CONTAINER_HEADER.glyph;
      out.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${g}" height="${g}" fill="${stroke}"/>`);
      out.push(glyphMarkup(c.glyph, r.x + 3, r.y + 3, g - 6, '#ffffff', 1.6));
      labelX = r.x + g + 8;
    }
    if (c.label) {
      out.push(`<text x="${n(labelX)}" y="${n(r.y + 15.5)}" font-size="${CONTAINER_HEADER.fontSize}" font-weight="600" fill="${stroke}">${escapeXml(c.label)}</text>`);
    }
    out.push('</g>');
  }
  for (const e of scene.edges) out.push(edgeMarkup(e));
  for (const node of scene.nodes) {
    const r = node.rect;
    out.push(`<g data-node="${escapeXml(node.id)}">`);
    out.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" rx="${n(Math.min(r.width, r.height) * 0.14)}" fill="${node.color}"/>`);
    const size = Math.min(r.width, r.height) * 0.62;
    out.push(glyphMarkup(node.glyph, r.x + (r.width - size) / 2, r.y + (r.height - size) / 2, size, '#ffffff', 1.8));
    if (node.labelBox) {
      out.push(textLines(node.label, r.x + r.width / 2, node.labelBox.y + NODE_LABEL.fontSize - 1, NODE_LABEL.lineHeight, `font-size="${NODE_LABEL.fontSize}" fill="${DIAGRAM_COLORS.nodeLabel}" text-anchor="middle"`));
    }
    out.push('</g>');
  }
  for (const e of scene.edges) out.push(edgeLabelMarkup(e));
  for (const a of scene.annotations) {
    const r = a.rect;
    if (a.kind === 'step') {
      const c = STEP_SIZE / 2;
      out.push(`<g data-annotation="${escapeXml(a.id)}"><circle cx="${n(r.x + c)}" cy="${n(r.y + c)}" r="${c}" fill="#1f2937"/><text x="${n(r.x + c)}" y="${n(r.y + c + 4.5)}" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle">${escapeXml(a.lines[0] ?? '')}</text></g>`);
      continue;
    }
    const pad = a.kind === 'legend' ? 12 : 0;
    const frame = a.kind === 'legend' ? `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" rx="4" fill="#ffffff" stroke="#9ca3af"/>` : '';
    out.push(`<g data-annotation="${escapeXml(a.id)}">${frame}${textLines(a.lines, r.x + pad, r.y + pad + ANNOTATION_TEXT.fontSize, ANNOTATION_TEXT.lineHeight, `font-size="${ANNOTATION_TEXT.fontSize}" fill="${DIAGRAM_COLORS.annotation}"`)}</g>`);
  }
  return out.join('');
}

export interface StandaloneOptions {
  readonly padding?: number;
  readonly background?: string | null;
  readonly title?: string;
}

/** A complete SVG file for the scene, cropped to its bounds. */
export function renderStandaloneSvg(scene: Scene, options: StandaloneOptions = {}): { svg: string; box: Rect } {
  const padding = options.padding ?? 32;
  const box = inflate(scene.bounds ?? { x: 0, y: 0, width: 200, height: 120 }, padding);
  const bg = options.background === undefined ? DIAGRAM_COLORS.background : options.background;
  const title = options.title ? `<title>${escapeXml(options.title)}</title>` : '';
  const background = bg ? `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" fill="${bg}"/>` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(box.width)}" height="${n(box.height)}" viewBox="${n(box.x)} ${n(box.y)} ${n(box.width)} ${n(box.height)}" font-family="${escapeXml(FONT_FAMILY)}">` +
    title +
    background +
    renderSceneBody(scene) +
    '</svg>';
  return { svg, box };
}
