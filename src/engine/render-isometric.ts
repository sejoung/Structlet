import type { Point, Rect } from '../domain';
import { AREA_STROKE } from './appearance';
import { center } from './geometry';
import { computeIsometricLayout, isoBlockHeight, ISOMETRIC_PLANE, isometricLabelPadding, projectIsoRect, rotateIsoPoint, type IsometricLabel, type IsometricLayout, type IsometricOptions } from './isometric-layout';
import { glyphMarkup, escapeXml, ImageSymbols, labelLeader, LIGHT_THEME, markerDefs, pathData, type DiagramTheme } from './render-svg';
import { LEGEND_MARKER_WIDTH, type Scene } from './scene';
import { FONT_FAMILY } from './text';

const n = (v: number) => (Math.round(v * 100) / 100).toString();

function shade(hex: string, amount: number): string {
  const v = Number.parseInt(hex.slice(1, 7), 16);
  const c = (shift: number) => Math.round(((v >> shift) & 255) * (1 - amount));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

function polygon(points: Point[], fill: string): string {
  return `<polygon points="${points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="${fill}"/>`;
}

function renderLabel(label: IsometricLabel, theme: DiagramTheme): string {
  const { box: r, kind, id } = label;
  const textX = r.x + isometricLabelPadding.x;
  const color = label.color ? AREA_STROKE[label.color] : undefined;
  const border = color ?? (kind === 'node' || kind === 'edge' ? theme.boxFill : theme.legendBorder);
  const fill = kind === 'step' ? theme.stepFill : theme.legendFill;
  const ink = kind === 'step' ? theme.stepText : theme.annotation;
  const out = [`<g data-iso-label="${kind}" data-iso-object="${escapeXml(id)}">`];
  const center = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  out.push(`<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" rx="${kind === 'step' ? n(r.height / 2) : 5}" fill="${fill}" stroke="${border}"/>`);
  if (color) out.push(`<path d="M${n(r.x + 4)} ${n(r.y + 7)}V${n(r.y + r.height - 7)}" stroke="${color}" stroke-width="2"/>`);
  for (const [index, { text, marker, detailSize }] of label.lines.entries()) {
    const y = r.y + isometricLabelPadding.y + (index + 0.79) * label.lineHeight;
    if (marker?.kind === 'swatch') out.push(`<rect x="${n(textX)}" y="${n(y - 11)}" width="12" height="12" rx="3" fill="${marker.color}"/>`);
    if (marker?.kind === 'line') out.push(`<line x1="${n(textX)}" y1="${n(y - 5)}" x2="${n(textX + 22)}" y2="${n(y - 5)}" stroke="${theme.edge}" stroke-width="1.5"${marker.dashed ? ' stroke-dasharray="5 3"' : ''}/>`);
    const x = kind === 'step' ? center.x : textX + (marker ? LEGEND_MARKER_WIDTH : 0);
    out.push(`<text x="${n(x)}" y="${n(y)}" font-size="${detailSize ?? label.size}" font-weight="${detailSize ? 400 : label.weight}" fill="${ink}"${detailSize ? ' data-spec-detail="true"' : ''}${kind === 'step' ? ' text-anchor="middle"' : ''}>${escapeXml(text)}</text>`);
  }
  return out.join('') + '</g>';
}

export function isometricBounds(scene: Scene, options: IsometricOptions = {}): Rect {
  return computeIsometricLayout(scene, options).bounds;
}

export function renderIsometricBody(scene: Scene, theme: DiagramTheme = LIGHT_THEME, layout: IsometricLayout = computeIsometricLayout(scene)): string {
  const { floor, blocks, labels } = renderIsometricLayers(scene, theme, layout);
  return floor + blocks + labels;
}

export function renderIsometricLayers(scene: Scene, theme: DiagramTheme, layout: IsometricLayout) {
  const images = new ImageSymbols('sl-iso-img');
  const { rotation } = layout;
  const floor = [markerDefs(theme), `<g transform="${ISOMETRIC_PLANE} rotate(${rotation})">`];
  for (const c of scene.containers) {
    const stroke = AREA_STROKE[c.style.color] ?? AREA_STROKE.gray!;
    const r = c.rect;
    const fill = c.style.filled ? `fill="${stroke}" fill-opacity="${theme.areaFillOpacity + 0.04}"` : `fill="${stroke}" fill-opacity="0.025"`;
    floor.push(`<rect data-container="${escapeXml(c.id)}" data-iso-object="${escapeXml(c.id)}" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" ${fill} stroke="${stroke}" stroke-width="1.5" vector-effect="non-scaling-stroke"${c.style.dashed ? ' stroke-dasharray="6 4"' : ''}/>`);
  }
  for (const e of scene.edges) {
    const marker = e.style.arrow === 'end' || e.style.arrow === 'both' ? ' marker-end="url(#sl-arrow-end)"' : '';
    const start = e.style.arrow === 'start' || e.style.arrow === 'both' ? ' marker-start="url(#sl-arrow-start)"' : '';
    floor.push(`<path data-edge="${escapeXml(e.id)}" d="${pathData(e.points)}" fill="none" stroke="${theme.edge}" stroke-width="1.6" vector-effect="non-scaling-stroke"${e.style.dashed ? ' stroke-dasharray="6 4"' : ''}${marker}${start}/>`);
  }
  floor.push('</g>');
  const blocks: string[] = [];
  const nodes = scene.nodes.map((node) => {
    const base = projectIsoRect(node.rect, rotation);
    return { node, base, depth: Math.max(...base.map(({ y }) => y)) };
  });
  nodes.sort((a, b) => a.depth - b.depth);
  for (const { node, base } of nodes) {
    const h = isoBlockHeight(node);
    const up = (p: Point) => ({ x: p.x, y: p.y - h });
    blocks.push(`<g data-node="${escapeXml(node.id)}" data-iso-object="${escapeXml(node.id)}">`);
    for (const [index, a] of base.entries()) {
      const b = base[(index + 1) % base.length]!;
      if (a.x - b.x < 0.001) continue;
      const slope = (b.y - a.y) / Math.hypot(b.x - a.x, b.y - a.y);
      blocks.push(polygon([up(a), up(b), b, a], shade(node.color, 0.28 - 0.15 * slope)));
    }
    blocks.push(polygon(base.map(up), node.color));
    const r = node.rect;
    const size = Math.min(r.width, r.height) * 0.6;
    const faceCenter = rotateIsoPoint(center(r), rotation);
    const x = faceCenter.x - size / 2;
    const y = faceCenter.y - size / 2;
    const face = node.image ? images.use(node.image, x, y, size) : glyphMarkup(node.glyph, x, y, size, '#ffffff', 1.8);
    blocks.push(`<g transform="translate(0 ${-h}) ${ISOMETRIC_PLANE}">${face}</g></g>`);
  }
  blocks.push(images.defs());
  const labels: string[] = [];
  for (const { leader, box } of layout.labels) {
    if (leader) labels.push(labelLeader(leader, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, theme));
  }
  for (const label of layout.labels) labels.push(renderLabel(label, theme));
  return { floor: floor.join(''), blocks: blocks.join(''), labels: labels.join('') };
}

export function renderIsometricSvg(scene: Scene, options: IsometricOptions & { theme?: DiagramTheme; title?: string } = {}): { svg: string; box: Rect } {
  const theme = options.theme ?? LIGHT_THEME;
  const layout = computeIsometricLayout(scene, options);
  const b = layout.bounds;
  const box = { x: b.x - 32, y: b.y - 32, width: b.width + 64, height: b.height + 64 };
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${n(box.width)}" height="${n(box.height)}" viewBox="${n(box.x)} ${n(box.y)} ${n(box.width)} ${n(box.height)}" font-family="${escapeXml(FONT_FAMILY)}">` +
    (options.title ? `<title>${escapeXml(options.title)}</title>` : '') +
    `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}" fill="${theme.background}"/>` +
    renderIsometricBody(scene, theme, layout) +
    '</svg>';
  return { svg, box };
}
