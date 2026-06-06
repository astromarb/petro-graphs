import katex from 'katex';
import * as fabric from 'fabric';
import { toPng } from 'html-to-image';

const cache = new Map<string, fabric.FabricImage>();

/**
 * Render a LaTeX string to a FabricImage by:
 * 1. Injecting KaTeX HTML into a hidden DOM element
 * 2. Capturing it with html-to-image (which inlines ALL computed styles,
 *    bypassing the Chrome SVG-foreignObject-in-canvas restriction)
 * 3. Loading the PNG data URL into a FabricImage
 */
export async function renderLatexToFabricImage(
  latex: string,
  fontSize: number,
  color: string,
  displayMode = false,
): Promise<fabric.FabricImage> {
  const key = `${latex}||${fontSize}||${color}||${displayMode}`;
  if (cache.has(key)) return cache.get(key)!;

  const html = katex.renderToString(latex, {
    throwOnError: false,
    displayMode,
    output: 'html',
  });

  const host = document.createElement('div');
  host.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:-9999px',
    // Transparent background so the PNG has no white box
    'background:transparent',
    `font-size:${fontSize}px`,
    `color:${color}`,
    'white-space:nowrap',
    'display:inline-block',
    'padding:4px 6px',
  ].join(';');
  host.innerHTML = html;
  document.body.appendChild(host);

  // Force a layout so getBoundingClientRect is accurate
  const rect = host.getBoundingClientRect();
  const w = Math.max(Math.ceil(rect.width)  + 4, 20);
  const h = Math.max(Math.ceil(rect.height) + 4, 20);
  host.style.width  = `${w}px`;
  host.style.height = `${h}px`;

  let dataUrl: string;
  try {
    // html-to-image inlines all computed styles so the PNG renders correctly
    // even though KaTeX uses external CSS class rules
    dataUrl = await toPng(host, {
      width: w,
      height: h,
      pixelRatio: 2,
      backgroundColor: 'transparent',
    });
  } finally {
    document.body.removeChild(host);
  }

  const fImg = await fabric.FabricImage.fromURL(dataUrl);
  fImg.set({ selectable: false, evented: false });
  cache.set(key, fImg);
  return fImg;
}

/** Render LaTeX to a PNG data URL (used for scalebar labels and export). */
export async function renderLatexToDataUrl(
  latex: string,
  fontSize: number,
  color: string,
  displayMode = false,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const html = katex.renderToString(latex, {
    throwOnError: false,
    displayMode,
    output: 'html',
  });

  const host = document.createElement('div');
  host.style.cssText = [
    'position:fixed', 'left:-9999px', 'top:-9999px',
    'background:transparent',
    `font-size:${fontSize}px`,
    `color:${color}`,
    'white-space:nowrap',
    'display:inline-block',
    'padding:4px 6px',
  ].join(';');
  host.innerHTML = html;
  document.body.appendChild(host);

  const rect = host.getBoundingClientRect();
  const w = Math.max(Math.ceil(rect.width) + 4, 20);
  const h = Math.max(Math.ceil(rect.height) + 4, 20);
  host.style.width  = `${w}px`;
  host.style.height = `${h}px`;

  let dataUrl: string;
  try {
    dataUrl = await toPng(host, { width: w, height: h, pixelRatio: 2, backgroundColor: 'transparent' });
  } finally {
    document.body.removeChild(host);
  }

  return { dataUrl, width: w * 2, height: h * 2 };
}
