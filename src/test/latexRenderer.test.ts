import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// jsdom doesn't support SVG foreignObject rendering.
// We mock: getBoundingClientRect (for dimension measurement), fetch (for font
// collection), Image (set in setup.ts to fire onload synchronously via setTimeout),
// and HTMLCanvasElement.toDataURL (for the final rasterisation step).

let mockWidth  = 80;
let mockHeight = 24;

beforeEach(() => {
  vi.resetModules(); // clear the module-level fontFaceCache between tests

  // Override getBoundingClientRect for the measurement div
  const origAppend = document.body.appendChild.bind(document.body);
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
    const el = origAppend(node);
    if (node instanceof HTMLElement) {
      vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({
        width: mockWidth, height: mockHeight,
        x: 0, y: 0, top: 0, left: 0,
        right: mockWidth, bottom: mockHeight,
        toJSON: () => ({}),
      } as DOMRect);
    }
    return el;
  });

  // stub HTMLCanvasElement.toDataURL
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
    'AABjkB6QAAAABJRU5ErkJggg=='
  );

  // stub fetch for @font-face woff2 collection
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockWidth  = 80;
  mockHeight = 24;
});

describe('renderLatexToDataUrl', () => {
  it('returns a non-empty dataUrl for \\text{Hello}', async () => {
    const { renderLatexToDataUrl } = await import('../latexRenderer');
    const { dataUrl } = await renderLatexToDataUrl('\\text{Hello}', 16, '#000000');
    expect(dataUrl).toBeTruthy();
    expect(dataUrl).toMatch(/^data:/);
  });

  it('returns positive width and height', async () => {
    mockWidth = 75; mockHeight = 20;
    const { renderLatexToDataUrl } = await import('../latexRenderer');
    const { width, height } = await renderLatexToDataUrl('\\text{Test}', 14, '#ffffff');
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it('handles a fraction expression without throwing', async () => {
    const { renderLatexToDataUrl } = await import('../latexRenderer');
    await expect(
      renderLatexToDataUrl('\\frac{SiO_2}{Al_2O_3}', 16, '#000')
    ).resolves.not.toThrow();
  });

  it('handles display-mode math without throwing', async () => {
    const { renderLatexToDataUrl } = await import('../latexRenderer');
    await expect(
      renderLatexToDataUrl('\\sum_{i=0}^{n} x_i', 16, '#000', true)
    ).resolves.not.toThrow();
  });

  it('returns an object with dataUrl, width, height on malformed input (graceful)', async () => {
    const { renderLatexToDataUrl } = await import('../latexRenderer');
    // KaTeX with throwOnError:false never throws — degrades gracefully
    const result = await renderLatexToDataUrl('\\invalidcmd{{{', 16, '#000');
    expect(result).toHaveProperty('dataUrl');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
    expect(result.width).toBeGreaterThanOrEqual(0);
    expect(result.height).toBeGreaterThanOrEqual(0);
  });

  it('returns width/height matching mock measurements', async () => {
    mockWidth = 120; mockHeight = 30;
    const { renderLatexToDataUrl } = await import('../latexRenderer');
    const { width, height } = await renderLatexToDataUrl('\\text{Wide label}', 18, '#fff');
    // width = mockWidth + 16 padding; height = mockHeight + 10 padding
    expect(width).toBe(136);
    expect(height).toBe(40);
  });
});
