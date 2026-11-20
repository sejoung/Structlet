import type { Document } from '../../domain';
import { computeScene, renderStandaloneSvg, type Appearance } from '../../engine';

/** SVG file text for a document, using the same scene and renderer as the canvas. */
export function exportSvg(doc: Document, appearance: Appearance): string {
  const { svg } = renderStandaloneSvg(computeScene(doc, appearance), { title: doc.title });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`;
}

/** PNG from the exported SVG, drawn at `scale` for sharp output. Browser only. */
export async function exportPng(doc: Document, appearance: Appearance, scale = 2): Promise<Blob> {
  const { svg, box } = renderStandaloneSvg(computeScene(doc, appearance), { title: doc.title });
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
