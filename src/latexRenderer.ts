/**
 * LaTeX → FabricImage via MathJax SVG output.
 *
 * MathJax is loaded as a pre-built global script (/mathjax-tex-svg.js) so
 * it bypasses Vite's bundler entirely — no eval()/require() issues.
 * With fontCache:'none' every glyph is an inline <path>, giving a fully
 * self-contained SVG that renders correctly in Tauri/WebView2.
 */
import * as fabric from 'fabric';

// ─── Wait for MathJax to initialise ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const MathJax: any;

let _ready: Promise<void> | null = null;

function mjReady(): Promise<void> {
  if (_ready) return _ready;
  _ready = (async () => {
    // Poll until window.MathJax exists and startup resolves.
    // The script is defer-loaded, so it may not be available immediately.
    for (let i = 0; i < 100; i++) {
      if (typeof MathJax !== 'undefined' && MathJax?.startup?.promise) break;
      await new Promise(r => setTimeout(r, 100));
    }
    if (typeof MathJax === 'undefined') throw new Error('MathJax script not loaded');
    await MathJax.startup.promise;
  })();
  return _ready;
}

// ─── SVG post-processing ──────────────────────────────────────────────────────

/**
 * Convert ex-unit dimensions to explicit pixels and apply fill colour.
 * Renders at 2× the visual size so scaling it to 0.5× in Fabric gives
 * crisp retina output without depending on SVG re-rasterisation behaviour.
 */
function processSvg(raw: string, fontSize: number, color: string): string {
  const exToPx = fontSize * 0.431 * 2; // 0.431em per ex; ×2 = retina sharpness
  return raw
    .replace(/width="([\d.]+)ex"/,  (_, v) => `width="${Math.ceil(parseFloat(v) * exToPx)}"`)
    .replace(/height="([\d.]+)ex"/, (_, v) => `height="${Math.ceil(parseFloat(v) * exToPx)}"`)
    .replace(/\bcurrentColor\b/g, color);
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface Entry { fImg: fabric.FabricImage; dataUrl: string; w: number; h: number }
const cache = new Map<string, Entry>();

// ─── Public API ───────────────────────────────────────────────────────────────

export async function renderLatexToFabricImage(
  latex: string,
  fontSize: number,
  color: string,
  displayMode = false,
): Promise<fabric.FabricImage> {
  const key = `${latex}||${fontSize}||${color}||${displayMode}`;
  const hit = cache.get(key);
  if (hit) return hit.fImg;

  await mjReady();

  // tex2svg() is synchronous after startup; returns an mjx-container DOM node
  const container: Element = MathJax.tex2svg(latex, { display: displayMode });
  const svgEl = container.querySelector('svg');
  if (!svgEl) throw new Error('MathJax tex2svg returned no <svg> element');

  const rawSvg  = svgEl.outerHTML;
  const svg     = processSvg(rawSvg, fontSize, color);
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const fImg = await fabric.FabricImage.fromURL(dataUrl);
  fImg.set({ selectable: false, evented: false });
  cache.set(key, { fImg, dataUrl, w: fImg.width ?? 100, h: fImg.height ?? 30 });
  return fImg;
}

/** Render LaTeX to a data URL (used by scalebar label rendering). */
export async function renderLatexToDataUrl(
  latex: string,
  fontSize: number,
  color: string,
  displayMode = false,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const key = `${latex}||${fontSize}||${color}||${displayMode}`;
  const hit = cache.get(key);
  if (hit) return { dataUrl: hit.dataUrl, width: hit.w, height: hit.h };
  await renderLatexToFabricImage(latex, fontSize, color, displayMode);
  const entry = cache.get(key)!;
  return { dataUrl: entry.dataUrl, width: entry.w, height: entry.h };
}
