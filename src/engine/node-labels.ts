import type { Node, NodeSpecs, Rect } from '../domain';
import { measureText, wrapText } from './text';

export const NODE_LABEL = { fontSize: 12, lineHeight: 15, gap: 6, maxWidth: 136 } as const;
export const BOX_NODE = { icon: 32, pad: 12, gap: 10, fontSize: 12, lineHeight: 15 } as const;
export const SPEC_CAPTION = { fontSize: 11, lineHeight: 14, gap: 5, padX: 6, padY: 3, maxWidth: 208 } as const;

export interface NodeLabels {
  readonly label: readonly string[];
  readonly labelBox: Rect | null;
  readonly specCaption: { readonly box: Rect; readonly lines: readonly string[] } | null;
  readonly specDetails: readonly string[];
}

function specLines(specs: NodeSpecs): string[] {
  const lines = specs.instanceType?.trim() ? [specs.instanceType.trim()] : [];
  const cpu = specs.vcpus === undefined ? '' : `${specs.vcpus} vCPU`;
  const memory = specs.memoryGiB === undefined ? '' : `${specs.memoryGiB} GiB RAM`;
  if (cpu || memory) lines.push([cpu, memory].filter(Boolean).join(' · '));
  if (specs.gpu?.trim()) lines.push(`GPU · ${specs.gpu.trim()}`);
  if (specs.diskGiB !== undefined) lines.push(`Disk · ${specs.diskGiB} GiB`);
  return lines;
}

export function layoutNodeLabels(node: Node, rect: Rect): NodeLabels {
  const middle = rect.x + rect.width / 2;
  const bottom = rect.y + rect.height;
  const box = node.variant === 'box';
  const width = box ? Math.max(24, rect.width - BOX_NODE.pad * 2 - BOX_NODE.icon - BOX_NODE.gap) : NODE_LABEL.maxWidth;
  const maxLines = box ? Math.max(1, Math.floor((rect.height - 8) / BOX_NODE.lineHeight)) : 4;
  const label = node.label.trim() ? wrapText(node.label, width, NODE_LABEL.fontSize, maxLines) : [];
  const textWidth = label.length && !box ? Math.max(...label.map((line) => measureText(line, NODE_LABEL.fontSize))) : 0;
  const labelBox = textWidth ? { x: middle - textWidth / 2, y: bottom + NODE_LABEL.gap, width: textWidth, height: label.length * NODE_LABEL.lineHeight } : null;
  const specDetails = node.specs ? specLines(node.specs) : [];
  const caption = node.specs?.showDetails ? specDetails.join('\n') : node.specs?.instanceType?.trim() ?? '';
  if (!caption) return { label, labelBox, specCaption: null, specDetails };
  const { fontSize, maxWidth, lineHeight, gap, padX, padY } = SPEC_CAPTION;
  const lines = wrapText(caption, maxWidth, fontSize, 10);
  const captionWidth = Math.ceil(Math.max(...lines.map((line) => measureText(line, fontSize)))) + 2 * padX;
  const captionY = (labelBox ? labelBox.y + labelBox.height : bottom) + gap;
  const captionBox = { x: middle - captionWidth / 2, y: captionY, width: captionWidth, height: lines.length * lineHeight + 2 * padY };
  return { label, labelBox, specCaption: { box: captionBox, lines }, specDetails };
}
