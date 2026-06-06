import katex from 'katex';
import * as fabric from 'fabric';

const cache = new Map<string, fabric.FabricImage>();

// Collect all @font-face rules from document stylesheets and convert to base64 data URLs
async function collectFontFaces(): Promise<string> {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try { cssRules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(cssRules)) {
      if (rule instanceof CSSFontFaceRule) {
        const src = rule.style.getPropertyValue('src');
        // Find woff2 URL(s)
        const matches = src.match(/url\(["']?([^"')]+\.woff2[^"')]*?)["']?\)/gi);
        if (!matches) {
          rules.push(rule.cssText);
          continue;
        }
        let converted = rule.cssText;
        for (const m of matches) {
          const urlMatch = m.match(/url\(["']?([^"')]+)["']?\)/i);
          if (!urlMatch) continue;
          const url = urlMatch[1];
          try {
            const resp = await fetch(url);
            const buf  = await resp.arrayBuffer();
            const b64  = btoa(String.fromCharCode(...new Uint8Array(buf)));
            converted  = converted.replace(url, `data:font/woff2;base64,${b64}`);
          } catch { /* leave original */ }
        }
        rules.push(converted);
      }
    }
  }
  return rules.join('\n');
}

let fontFaceCache: string | null = null;
async function getFontFaces(): Promise<string> {
  if (fontFaceCache === null) fontFaceCache = await collectFontFaces();
  return fontFaceCache;
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
  const fontFaces = await getFontFaces();
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

  const fontFaces = await getFontFaces();

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
