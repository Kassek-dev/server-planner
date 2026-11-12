import type { Rect } from '@xyflow/react';
import { toPng, toSvg } from 'html-to-image';

export type ImageFormat = 'png' | 'svg';
export type ExportTheme = 'dark' | 'light';

/** Margin around the exported elements (px) and the largest side we render. */
const PADDING = 32;
const MAX_SIDE = 8000;

/**
 * Renders the React Flow viewport for the given bounds (docs/03: html-to-image, the method React
 * Flow recommends). The export theme is applied to the viewport only for the capture, so the
 * picture does not depend on the UI theme. Connection handles are left out.
 */
export async function renderCanvas(
  viewport: HTMLElement,
  bounds: Rect,
  format: ImageFormat,
  theme: ExportTheme,
): Promise<string> {
  const width = Math.min(MAX_SIDE, Math.ceil(bounds.width + 2 * PADDING));
  const height = Math.min(MAX_SIDE, Math.ceil(bounds.height + 2 * PADDING));
  const previous = viewport.dataset.theme;
  const previousColor = viewport.style.color;
  viewport.dataset.theme = theme;
  // Text that inherits its colour from <body> must follow the export theme, not the UI one.
  viewport.style.color = 'var(--sp-text-primary)';
  try {
    const background = getComputedStyle(viewport).getPropertyValue('--sp-bg-canvas').trim();
    const options = {
      ...(background ? { backgroundColor: background } : {}),
      width,
      height,
      style: {
        width: `${width}px`,
        height: `${height}px`,
        transform: `translate(${PADDING - bounds.x}px, ${PADDING - bounds.y}px) scale(1)`,
      },
      filter: (node: HTMLElement) => !node.classList?.contains('react-flow__handle'),
    };
    return format === 'png'
      ? await toPng(viewport, { ...options, pixelRatio: 2 })
      : await toSvg(viewport, options);
  } finally {
    viewport.style.color = previousColor;
    if (previous === undefined) delete viewport.dataset.theme;
    else viewport.dataset.theme = previous;
  }
}

/** Saves a data URL as a file (a link click, not a fetch — CSP `connect-src 'self'`). */
export function downloadDataUrl(url: string, fileName: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
}
