import type { Document, Rect } from '../../domain';
import { computeScene, renderIsometricSvg, renderStandaloneSvg, type Appearance, type DiagramTheme } from '../../engine';

export type ExportView = '2d' | 'isometric';

export interface ExportOptions {
  readonly view?: ExportView;
  readonly theme?: DiagramTheme;
}

function render(doc: Document, appearance: Appearance, options: ExportOptions): { svg: string; box: Rect } {
  const scene = computeScene(doc, appearance);
  return options.view === 'isometric' ? renderIsometricSvg(scene, { theme: options.theme, title: doc.title }) : renderStandaloneSvg(scene, { title: doc.title, theme: options.theme });
}

/** SVG file text for a document, using the same scene and renderer as the canvas. */
export function exportSvg(doc: Document, appearance: Appearance, options: ExportOptions = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${render(doc, appearance, options).svg}\n`;
}

/** PNG from the exported SVG, drawn at `scale` for sharp output. Browser only. */
export async function exportPng(doc: Document, appearance: Appearance, options: ExportOptions = {}, scale = 2): Promise<Blob> {
  const { svg, box } = render(doc, appearance, options);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not render the diagram image'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(box.width * scale);
    canvas.height = Math.ceil(box.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, box.width, box.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
