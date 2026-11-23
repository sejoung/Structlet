import type { Point, Rect } from '../domain';
import { AREA_STROKE, type Glyph } from './appearance';
import { inflate } from './geometry';
import {
  ANNOTATION_TEXT,
  BOX_NODE,
  CONTAINER_HEADER,
  EDGE_LABEL,
  LEGEND_MARKER_WIDTH,
  legendMarker,
  NODE_LABEL,
  STEP_SIZE,
  type Scene,
  type SceneAnnotation,
  type SceneEdge,
  type SceneNode,
} from './scene';
import { FONT_FAMILY } from './text';


export interface DiagramTheme {
  readonly name: 'light' | 'dark';
  readonly edge: string;
  readonly edgeLabel: string;
  readonly nodeLabel: string;
  readonly annotation: string;
  readonly background: string;
  readonly boxFill: string;
  readonly legendFill: string;
  readonly legendBorder: string;
  readonly stepFill: string;
  readonly stepText: string;
  readonly areaFillOpacity: number;
}

export const LIGHT_THEME: DiagramTheme = {
  name: 'light',
  edge: '#4b5563',
  edgeLabel: '#1f2937',
  nodeLabel: '#111827',
  annotation: '#1f2937',
  background: '#ffffff',
  boxFill: '#ffffff',
  legendFill: '#ffffff',
  legendBorder: '#9ca3af',
  stepFill: '#1f2937',
  stepText: '#ffffff',
  areaFillOpacity: 0.07,
};

export const DARK_THEME: DiagramTheme = {
  name: 'dark',
  edge: '#9aa4b2',
  edgeLabel: '#e5e7eb',
  nodeLabel: '#e5e7eb',
  annotation: '#e5e7eb',
  background: '#14171d',
  boxFill: '#1f242d',
  legendFill: '#1b1f27',
  legendBorder: '#4b5563',
  stepFill: '#e5e7eb',
  stepText: '#14171d',
  areaFillOpacity: 0.12,
};


export function onSurface(theme: DiagramTheme, background: string): DiagramTheme {
  return background === theme.background ? theme : { ...theme, background };
}

export function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

export function glyphMarkup(glyph: Glyph, x: number, y: number, size: number, color: string, strokeWidth: number): string {
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

function edgeMarkup(e: SceneEdge, t: DiagramTheme): string {
  const start = e.style.arrow === 'start' || e.style.arrow === 'both' ? ' marker-start="url(#sl-arrow-start)"' : '';
  const end = e.style.arrow === 'end' || e.style.arrow === 'both' ? ' marker-end="url(#sl-arrow-end)"' : '';
  const dash = e.style.dashed ? ' stroke-dasharray="6 4"' : '';
  return `<path data-edge="${escapeXml(e.id)}" d="${pathData(e.points)}" fill="none" stroke="${t.edge}" stroke-width="1.5" stroke-linejoin="round"${dash}${start}${end}/>`;
}

function channel(hex: string, shift: number): number {
  return (Number.parseInt(hex.slice(1, 7), 16) >> shift) & 255;
}

export function mixColor(base: string, over: string, alpha: number): string {
  const c = (shift: number) => Math.round(channel(base, shift) * (1 - alpha) + channel(over, shift) * alpha).toString(16).padStart(2, '0');
  return `#${c(16)}${c(8)}${c(0)}`;
}

export function labelSurface(e: SceneEdge, t: DiagramTheme): string {
  return e.labelTints.reduce((color, tint) => mixColor(color, tint, t.areaFillOpacity), t.background);
}

function edgeLabelMarkup(e: SceneEdge, t: DiagramTheme): string {
  if (!e.labelBox) return '';
  const b = e.labelBox;
  return (
    `<g data-edge-label="${escapeXml(e.id)}">${e.labelAnchor ? labelLeader(e.labelAnchor, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, t) : ''}<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.width)}" height="${n(b.height)}" rx="3" fill="${labelSurface(e, t)}"/>` +
    textLines(e.label, b.x + b.width / 2, b.y + EDGE_LABEL.padY + EDGE_LABEL.fontSize - 1, EDGE_LABEL.lineHeight, `font-size="${EDGE_LABEL.fontSize}" fill="${t.edgeLabel}" text-anchor="middle"`) +
    '</g>'
  );
}

export function labelLeader(from: Point, to: Point, theme: DiagramTheme): string {
  return `<line x1="${n(from.x)}" y1="${n(from.y)}" x2="${n(to.x)}" y2="${n(to.y)}" stroke="${theme.edge}" stroke-width="0.8"/>`;
}

export function markerDefs(t: DiagramTheme): string {
  return (
    '<defs>' +
    `<marker id="sl-arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M0 0 L10 5 L0 10 z" fill="${t.edge}"/></marker>` +
    `<marker id="sl-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M10 0 L0 5 L10 10 z" fill="${t.edge}"/></marker>` +
    '</defs>'
  );
}


export class ImageSymbols {
  private ids = new Map<string, string>();
  constructor(private readonly prefix = 'sl-img') {}

  use(uri: string, x: number, y: number, size: number): string {
    let id = this.ids.get(uri);
    if (!id) {
      id = `${this.prefix}-${this.ids.size}`;
      this.ids.set(uri, id);
    }
    return `<use href="#${id}" xlink:href="#${id}" x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}"/>`;
  }

  defs(): string {
    if (this.ids.size === 0) return '';
    const symbols = [...this.ids].map(([uri, id]) => `<symbol id="${id}" viewBox="0 0 1 1"><image width="1" height="1" preserveAspectRatio="xMidYMid meet" href="${escapeXml(uri)}" xlink:href="${escapeXml(uri)}"/></symbol>`);
    return `<defs>${symbols.join('')}</defs>`;
  }
}

function nodeMarkup(node: SceneNode, t: DiagramTheme, images: ImageSymbols): string {
  const r = node.rect;
  if (node.variant === 'box') {
    const icon = BOX_NODE.icon;
    const ix = r.x + BOX_NODE.pad;
    const iy = r.y + (r.height - icon) / 2;
    const tx = ix + icon + BOX_NODE.gap;
    const ty = r.y + r.height / 2 - ((node.label.length - 1) * BOX_NODE.lineHeight) / 2 + BOX_NODE.fontSize / 2 - 1.5;
    return (
      `<g data-node="${escapeXml(node.id)}">` +
      `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" rx="6" fill="${t.boxFill}" stroke="${node.color}" stroke-width="1.5"/>` +
      (node.image ? images.use(node.image, ix, iy, icon) : `<rect x="${n(ix)}" y="${n(iy)}" width="${icon}" height="${icon}" rx="5" fill="${node.color}"/>` + glyphMarkup(node.glyph, ix + 6, iy + 6, icon - 12, '#ffffff', 1.7)) +
      textLines(node.label, tx, ty, BOX_NODE.lineHeight, `font-size="${BOX_NODE.fontSize}" fill="${t.nodeLabel}"`) +
      '</g>'
    );
  }
  const size = Math.min(r.width, r.height) * 0.62;
  const side = Math.min(r.width, r.height);
  const icon = node.image
    ? images.use(node.image, r.x + (r.width - side) / 2, r.y + (r.height - side) / 2, side)
    : `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" rx="${n(side * 0.14)}" fill="${node.color}"/>` + glyphMarkup(node.glyph, r.x + (r.width - size) / 2, r.y + (r.height - size) / 2, size, '#ffffff', 1.8);
  return (
    `<g data-node="${escapeXml(node.id)}">` +
    icon +
    (node.labelBox ? textLines(node.label, r.x + r.width / 2, node.labelBox.y + NODE_LABEL.fontSize - 1, NODE_LABEL.lineHeight, `font-size="${NODE_LABEL.fontSize}" fill="${t.nodeLabel}" text-anchor="middle"`) : '') +
    '</g>'
  );
}

function annotationMarkup(a: SceneAnnotation, t: DiagramTheme): string {
  const r = a.rect;
  const id = escapeXml(a.id);
  if (a.kind === 'step') {
    const c = STEP_SIZE / 2;
    return `<g data-annotation="${id}"><circle cx="${n(r.x + c)}" cy="${n(r.y + c)}" r="${c}" fill="${t.stepFill}"/><text x="${n(r.x + c)}" y="${n(r.y + c + 4.5)}" font-size="13" font-weight="700" fill="${t.stepText}" text-anchor="middle">${escapeXml(a.lines[0] ?? '')}</text></g>`;
  }
  const attrs = `font-size="${ANNOTATION_TEXT.fontSize}" fill="${t.annotation}"`;
  if (a.kind === 'text') return `<g data-annotation="${id}">${textLines(a.lines, r.x, r.y + ANNOTATION_TEXT.fontSize, ANNOTATION_TEXT.lineHeight, attrs)}</g>`;
  const pad = 12;
  const out = [`<g data-annotation="${id}"><rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" rx="4" fill="${t.legendFill}" stroke="${t.legendBorder}"/>`];
  a.lines.forEach((line, i) => {
    const { marker, text } = legendMarker(line);
    const baseline = r.y + pad + ANNOTATION_TEXT.fontSize + i * ANNOTATION_TEXT.lineHeight;
    const mid = baseline - 4.5;
    let x = r.x + pad;
    if (marker?.kind === 'swatch') out.push(`<rect x="${n(x)}" y="${n(mid - 6)}" width="12" height="12" rx="3" fill="${marker.color}"/>`);
    if (marker?.kind === 'line') out.push(`<line x1="${n(x)}" y1="${n(mid)}" x2="${n(x + 22)}" y2="${n(mid)}" stroke="${t.edge}" stroke-width="1.5"${marker.dashed ? ' stroke-dasharray="5 3"' : ''}/>`);
    if (marker) x += LEGEND_MARKER_WIDTH;
    out.push(`<text x="${n(x)}" y="${n(baseline)}" ${attrs}${i === 0 && !marker ? ' font-weight="700"' : ''}>${escapeXml(text)}</text>`);
  });
  out.push('</g>');
  return out.join('');
}

export function renderSceneBody(scene: Scene, theme: DiagramTheme = LIGHT_THEME): string {
  const images = new ImageSymbols();
  const out: string[] = [markerDefs(theme)];
  for (const c of scene.containers) {
    const stroke = AREA_STROKE[c.style.color] ?? AREA_STROKE.gray!;
    const r = c.rect;
    const dash = c.style.dashed ? ' stroke-dasharray="6 4"' : '';
    const fill = c.style.filled ? `fill="${stroke}" fill-opacity="${theme.areaFillOpacity}"` : 'fill="none"';
    out.push(`<g data-container="${escapeXml(c.id)}">`);
    out.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" ${fill} stroke="${stroke}" stroke-width="1.5"${dash}/>`);
    let labelX = r.x + 10;
    if (c.image) {
      out.push(images.use(c.image, r.x, r.y, CONTAINER_HEADER.glyph));
      labelX = r.x + CONTAINER_HEADER.glyph + 8;
    } else if (c.glyph) {
      const g = CONTAINER_HEADER.glyph;
      out.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${g}" height="${g}" fill="${stroke}"/>`);
      out.push(glyphMarkup(c.glyph, r.x + 3, r.y + 3, g - 6, '#ffffff', 1.6));
      labelX = r.x + g + 8;
    }
    if (c.label) out.push(`<text x="${n(labelX)}" y="${n(r.y + 15.5)}" font-size="${CONTAINER_HEADER.fontSize}" font-weight="600" fill="${stroke}">${escapeXml(c.label)}</text>`);
    out.push('</g>');
  }
  for (const e of scene.edges) out.push(edgeMarkup(e, theme));
  for (const node of scene.nodes) out.push(nodeMarkup(node, theme, images));
  for (const e of scene.edges) out.push(edgeLabelMarkup(e, theme));
  for (const a of scene.annotations) out.push(annotationMarkup(a, theme));
  out.push(images.defs());
  return out.join('');
}

export interface StandaloneOptions {
  readonly padding?: number;
  readonly background?: string | null;
  readonly title?: string;
  readonly theme?: DiagramTheme;
}

export function renderStandaloneSvg(scene: Scene, options: StandaloneOptions = {}): { svg: string; box: Rect } {
  const theme = options.theme ?? LIGHT_THEME;
  const padding = options.padding ?? 32;
  const box = inflate(scene.bounds ?? { x: 0, y: 0, width: 200, height: 120 }, padding);
  const bg = options.background === undefined ? theme.background : options.background;
  const title = options.title ? `<title>${escapeXml(options.title)}</title>` : '';
  const background = bg ? `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" fill="${bg}"/>` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(box.width)}" height="${n(box.height)}" viewBox="${n(box.x)} ${n(box.y)} ${n(box.width)} ${n(box.height)}" font-family="${escapeXml(FONT_FAMILY)}">` +
    title +
    background +
    renderSceneBody(scene, theme) +
    '</svg>';
  return { svg, box };
}
