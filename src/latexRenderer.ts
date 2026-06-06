import katex from 'katex';
import * as fabric from 'fabric';

const cache = new Map<string, fabric.FabricImage>();

/**
 * Collect all CSS needed to render KaTeX HTML inside an SVG foreignObject:
 * - All @font-face rules with woff2 URLs replaced by inline base64
 * - All rules that reference KaTeX class names (.katex, .mord, .mrel, etc.)
 *
 * Without the structural KaTeX CSS, spans collapse and glyphs are invisible.
 */
async function collectStylesForSvg(): Promise<string> {
  const fontFaceRules: string[] = [];
  const katexRules:    string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try { cssRules = sheet.cssRules; } catch { continue; }

    for (const rule of Array.from(cssRules)) {
      if (rule instanceof CSSFontFaceRule) {
        const src = rule.style.getPropertyValue('src');
        const matches = src.match(/url\(["']?([^"')]+\.woff2[^"')]*?)["']?\)/gi);
        if (!matches) { fontFaceRules.push(rule.cssText); continue; }
        let converted = rule.cssText;
        for (const m of matches) {
          const urlMatch = m.match(/url\(["']?([^"')]+)["']?\)/i);
          if (!urlMatch) continue;
          const url = urlMatch[1];
          try {
            const resp = await fetch(url);
            const buf  = await resp.arrayBuffer();
            // btoa on large buffers — chunked to avoid call-stack overflow
            const bytes = new Uint8Array(buf);
            let binary = '';
            const CHUNK = 8192;
            for (let i = 0; i < bytes.length; i += CHUNK)
              binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
            converted = converted.replace(url, `data:font/woff2;base64,${btoa(binary)}`);
          } catch { /* leave original URL */ }
        }
        fontFaceRules.push(converted);
      } else if (/katex|\.mord|\.mrel|\.mbin|\.mop|\.minner|\.base|\.strut/i.test(rule.cssText)) {
        katexRules.push(rule.cssText);
      }
    }
  }
  return [...fontFaceRules, ...katexRules].join('\n');
}

let svgStyleCache: string | null = null;
async function getStylesForSvg(): Promise<string> {
  if (svgStyleCache === null) svgStyleCache = await collectStylesForSvg();
  return svgStyleCache;
}

export async function renderLatexToFabricImage(
  latex: string,
  fontSize: number,
  color: string,
  displayMode = false,
): Promise<fabric.FabricImage> {
  const key = `${latex}||${fontSize}||${color}||${displayMode}`;
  if (cache.has(key)) return cache.get(key)!;

  // 1. Render KaTeX to HTML string
  const html = katex.renderToString(latex, {
    throwOnError: false,
    displayMode,
    output: 'html',
  });

  // 2. Inject into hidden DOM node to measure dimensions
  const host = document.createElement('div');
  host.style.cssText = `
    position:fixed; left:-9999px; top:-9999px; visibility:hidden;
    font-size:${fontSize}px; color:${color}; white-space:nowrap;
  `;
  host.innerHTML = html;
  document.body.appendChild(host);
  const rect = host.getBoundingClientRect();
  const w = Math.max(rect.width  + 12, 20);
  const h = Math.max(rect.height + 8,  20);
  document.body.removeChild(host);

  // 3. Build SVG with foreignObject
  const fontFaces = await getStylesForSvg();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><style>${fontFaces}
    .katex { font-size: ${fontSize}px; color: ${color}; }
    .katex * { color: ${color}; }
  </style></defs>
  <foreignObject x="4" y="4" width="${w}" height="${h}">
    <div xmlns="http://www.w3.org/1999/xhtml"
      style="font-size:${fontSize}px;color:${color};white-space:nowrap;display:inline-block">
      ${html}
    </div>
  </foreignObject>
</svg>`;

  const blob    = new Blob([svg], { type: 'image/svg+xml' });
  const blobUrl = URL.createObjectURL(blob);

  const fImg = await fabric.FabricImage.fromURL(blobUrl);
  URL.revokeObjectURL(blobUrl);

  fImg.set({ selectable: false, evented: false });
  cache.set(key, fImg);
  return fImg;
}

// Simpler: render and return as an HTMLImageElement src (data URL via canvas)
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
  host.style.cssText = `position:fixed;left:-9999px;top:-9999px;visibility:hidden;font-size:${fontSize}px;color:${color};white-space:nowrap;`;
  host.innerHTML = html;
  document.body.appendChild(host);
  const rect = host.getBoundingClientRect();
  const w = Math.ceil(rect.width  + 16);
  const h = Math.ceil(rect.height + 10);
  document.body.removeChild(host);

  const fontFaces = await getStylesForSvg();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><style>${fontFaces}
    .katex { font-size: ${fontSize}px; color: ${color}; }
  </style></defs>
  <foreignObject x="4" y="4" width="${w}" height="${h}">
    <div xmlns="http://www.w3.org/1999/xhtml"
      style="font-size:${fontSize}px;color:${color};white-space:nowrap;display:inline-block">
      ${html}
    </div>
  </foreignObject>
</svg>`;

  const blob    = new Blob([svg], { type: 'image/svg+xml' });
  const blobUrl = URL.createObjectURL(blob);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c   = document.createElement('canvas');
      c.width   = w;
      c.height  = h;
      c.getContext('2d')!.drawImage(img, 0, 0);
      URL.revokeObjectURL(blobUrl);
      resolve({ dataUrl: c.toDataURL(), width: w, height: h });
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      resolve({ dataUrl: '', width: w, height: h });
    };
    img.src = blobUrl;
  });
}
