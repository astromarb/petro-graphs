import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock html-to-image (uses browser APIs unavailable in jsdom)
vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockResolvedValue('data:image/png;base64,AAAA'),
}));

const mockFabricImage = {
  width: 80, height: 24,
  set: vi.fn(),
  clone: vi.fn().mockResolvedValue({ set: vi.fn(), width: 80, height: 24 }),
};

vi.mock('fabric', () => ({
  FabricImage: {
    fromURL: vi.fn().mockResolvedValue(mockFabricImage),
  },
  StaticCanvas: vi.fn().mockImplementation(() => ({
    add: vi.fn(), renderAll: vi.fn(), dispose: vi.fn(),
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,AAAA'),
  })),
}));

function makeMathJaxMock() {
  return {
    startup: { promise: Promise.resolve() },
    tex2svg: vi.fn().mockImplementation(() => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '5ex');
      svg.setAttribute('height', '3ex');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0 0');
      path.setAttribute('fill', 'currentColor');
      svg.appendChild(path);
      const container = document.createElement('span');
      container.appendChild(svg);
      return container;
    }),
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('MathJax', makeMathJaxMock());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('renderLatexToDataUrl', () => {
  it('returns a non-empty dataUrl', async () => {
    const { renderLatexToDataUrl } = await import('../latexRenderer');
    const { dataUrl } = await renderLatexToDataUrl('\\text{Hello}', 16, '#000000');
    expect(dataUrl).toBeTruthy();
    expect(dataUrl).toMatch(/^data:/);
  });

  it('returns positive width and height', async () => {
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

  it('returns object with dataUrl, width, height on malformed input', async () => {
    const { renderLatexToDataUrl } = await import('../latexRenderer');
    const result = await renderLatexToDataUrl('\\invalidcmd{{{', 16, '#000');
    expect(result).toHaveProperty('dataUrl');
    expect(result).toHaveProperty('width');
    expect(result).toHaveProperty('height');
  });
});

describe('renderLatexToFabricImage', () => {
  it('returns a FabricImage-like object', async () => {
    const { renderLatexToFabricImage } = await import('../latexRenderer');
    const img = await renderLatexToFabricImage('\\text{Hello}', 16, '#000');
    expect(img).toBeTruthy();
    expect(typeof img.set).toBe('function');
  });

  it('returns same object for repeated calls with same key (caching)', async () => {
    const { renderLatexToFabricImage } = await import('../latexRenderer');
    const a = await renderLatexToFabricImage('\\text{X}', 16, '#000');
    const b = await renderLatexToFabricImage('\\text{X}', 16, '#000');
    expect(a).toBe(b);
  });
});
