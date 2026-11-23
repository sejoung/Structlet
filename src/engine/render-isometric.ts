import type { Point, Rect } from '../domain';
import { AREA_STROKE } from './appearance';
import { glyphMarkup, escapeXml, ImageSymbols, labelLeader, labelSurface, LIGHT_THEME, markerDefs, pathData, type DiagramTheme } from './render-svg';
import { CONTAINER_HEADER, EDGE_LABEL, NODE_LABEL, type Scene } from './scene';
import { FONT_FAMILY } from './text';


const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const BLOCK = 18;
const PLANE = `matrix(${COS} ${SIN} ${-COS} ${SIN} 0 0)`;

export function iso(p: Point): Point {
  return { x: (p.x - p.y) * COS, y: (p.x + p.y) * SIN };
}

const n = (v: number) => (Math.round(v * 100) / 100).toString();

function shade(hex: string, amount: number): string {
  const v = Number.parseInt(hex.slice(1), 16);
  const c = (shift: number) => Math.round(((v >> shift) & 255) * (1 - amount));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function polygon(points: Point[], fill: string, extra = ''): string {
  return `<polygon points="${points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="${fill}"${extra}/>`;
}

function upright(lines: readonly string[], at: Point, size: number, lineHeight: number, fill: string, anchor = 'middle'): string {
  const spans = lines.map((l, i) => `<tspan x="${n(at.x)}" y="${n(at.y + i * lineHeight)}">${escapeXml(l)}</tspan>`).join('');
  return `<text font-size="${size}" fill="${fill}" text-anchor="${anchor}">${spans}</text>`;
}

export function isometricBounds(scene: Scene): Rect {
  const b = scene.bounds ?? { x: 0, y: 0, width: 200, height: 120 };
  const corners = [iso({ x: b.x, y: b.y }), iso({ x: b.x + b.width, y: b.y }), iso({ x: b.x, y: b.y + b.height }), iso({ x: b.x + b.width, y: b.y + b.height })];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys) - BLOCK - 20, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) + BLOCK + 60 };
}

export function renderIsometricBody(scene: Scene, theme: DiagramTheme = LIGHT_THEME): string {
  const images = new ImageSymbols('sl-iso-img');
  const out: string[] = [markerDefs(theme), `<g transform="${PLANE}">`];
  for (const c of scene.containers) {
    const stroke = AREA_STROKE[c.style.color] ?? AREA_STROKE.gray!;
    const r = c.rect;
    const fill = c.style.filled ? `fill="${stroke}" fill-opacity="${theme.areaFillOpacity + 0.04}"` : `fill="${stroke}" fill-opacity="0.025"`;
    out.push(`<rect data-container="${escapeXml(c.id)}" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" ${fill} stroke="${stroke}" stroke-width="1.5" vector-effect="non-scaling-stroke"${c.style.dashed ? ' stroke-dasharray="6 4"' : ''}/>`);
  }
  for (const e of scene.edges) {
    const marker = e.style.arrow === 'end' || e.style.arrow === 'both' ? ' marker-end="url(#sl-arrow-end)"' : '';
    const start = e.style.arrow === 'start' || e.style.arrow === 'both' ? ' marker-start="url(#sl-arrow-start)"' : '';
    out.push(`<path data-edge="${escapeXml(e.id)}" d="${pathData(e.points)}" fill="none" stroke="${theme.edge}" stroke-width="1.6" vector-effect="non-scaling-stroke"${e.style.dashed ? ' stroke-dasharray="6 4"' : ''}${marker}${start}/>`);
  }
  out.push('</g>');
  for (const c of scene.containers) {
    if (!c.label) continue;
    const p = iso({ x: c.rect.x + 8, y: c.rect.y + CONTAINER_HEADER.height / 2 });
    out.push(`<text x="${n(p.x)}" y="${n(p.y)}" font-size="${CONTAINER_HEADER.fontSize}" font-weight="600" fill="${AREA_STROKE[c.style.color] ?? AREA_STROKE.gray}">${escapeXml(c.label)}</text>`);
  }
  const nodes = [...scene.nodes].sort((a, b) => a.rect.x + a.rect.y + a.rect.width + a.rect.height - (b.rect.x + b.rect.y + b.rect.width + b.rect.height));
  for (const node of nodes) {
    const r = node.rect;
    const h = node.variant === 'box' ? 12 : BLOCK;
    const up = (p: Point) => ({ x: p.x, y: p.y - h });
    const a = iso({ x: r.x, y: r.y });
    const b = iso({ x: r.x + r.width, y: r.y });
    const c = iso({ x: r.x + r.width, y: r.y + r.height });
    const d = iso({ x: r.x, y: r.y + r.height });
    out.push(`<g data-node="${escapeXml(node.id)}">`);
    out.push(polygon([up(d), up(c), c, d], shade(node.color, 0.35)));
    out.push(polygon([up(b), up(c), c, b], shade(node.color, 0.2)));
    out.push(polygon([up(a), up(b), up(c), up(d)], node.color));
    const size = Math.min(r.width, r.height) * 0.6;
    const face = node.image ? images.use(node.image, r.x + (r.width - size) / 2, r.y + (r.height - size) / 2, size) : glyphMarkup(node.glyph, r.x + (r.width - size) / 2, r.y + (r.height - size) / 2, size, '#ffffff', 1.8);
    out.push(`<g transform="translate(0 ${-h}) ${PLANE}">${face}</g>`);
    const labelAt = { x: (c.x + d.x) / 2 + 6, y: Math.max(c.y, d.y) + 14 };
    out.push(upright(node.label, labelAt, NODE_LABEL.fontSize, NODE_LABEL.lineHeight, theme.nodeLabel));
    out.push('</g>');
  }
  for (const e of scene.edges) {
    if (!e.labelBox) continue;
    const p = iso({ x: e.labelBox.x + e.labelBox.width / 2, y: e.labelBox.y + e.labelBox.height / 2 });
    if (e.labelAnchor) out.push(labelLeader(iso(e.labelAnchor), p, theme));
    const w = e.labelBox.width;
    const h = e.labelBox.height;
    out.push(`<rect x="${n(p.x - w / 2)}" y="${n(p.y - h / 2)}" width="${n(w)}" height="${n(h)}" rx="3" fill="${labelSurface(e, { ...theme, areaFillOpacity: theme.areaFillOpacity + 0.04 })}"/>`);
    out.push(upright(e.label, { x: p.x, y: p.y - h / 2 + EDGE_LABEL.padY + EDGE_LABEL.fontSize - 1 }, EDGE_LABEL.fontSize, EDGE_LABEL.lineHeight, theme.edgeLabel));
  }
  for (const a of scene.annotations) {
    if (a.kind === 'legend') continue;
    const p = iso({ x: a.rect.x, y: a.rect.y });
    out.push(upright(a.lines, { x: p.x, y: p.y }, 13, 18, theme.annotation, 'start'));
  }
  out.push(images.defs());
  return out.join('');
}

export function renderIsometricSvg(scene: Scene, options: { theme?: DiagramTheme; title?: string } = {}): { svg: string; box: Rect } {
  const theme = options.theme ?? LIGHT_THEME;
  const b = isometricBounds(scene);
  const box = { x: b.x - 32, y: b.y - 32, width: b.width + 64, height: b.height + 64 };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(box.width)}" height="${n(box.height)}" viewBox="${n(box.x)} ${n(box.y)} ${n(box.width)} ${n(box.height)}" font-family="${escapeXml(FONT_FAMILY)}">` +
    (options.title ? `<title>${escapeXml(options.title)}</title>` : '') +
    `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" fill="${theme.background}"/>` +
    renderIsometricBody(scene, theme) +
    '</svg>';
  return { svg, box };
}
