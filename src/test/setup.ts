import '@testing-library/jest-dom';

// Fabric.js requires canvas — mock it so tests run in jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).HTMLCanvasElement.prototype.getContext = () => ({
  fillRect: () => {},
  clearRect: () => {},
  getImageData: (_x: number, _y: number, w: number, h: number) => ({
    data: new Array(w * h * 4).fill(0),
  }),
  putImageData: () => {},
  createImageData: () => [],
  setTransform: () => {},
  drawImage: () => {},
  save: () => {},
  restore: () => {},
  scale: () => {},
  rotate: () => {},
  translate: () => {},
  transform: () => {},
  beginPath: () => {},
  moveTo: () => {},
  lineTo: () => {},
  arc: () => {},
  fill: () => {},
  stroke: () => {},
  closePath: () => {},
  clip: () => {},
  measureText: () => ({ width: 10 }),
  fillText: () => {},
  strokeText: () => {},
  canvas: { width: 800, height: 600 },
});

// ResizeObserver stub
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// URL.createObjectURL / revokeObjectURL stubs
globalThis.URL.createObjectURL = () => 'blob:mock';
globalThis.URL.revokeObjectURL = () => {};

// Mock Image so onload fires synchronously (jsdom never loads external URLs)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Image = class MockImage {
  width  = 80;
  height = 24;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  get src() { return this._src; }
  set src(v: string) {
    this._src = v;
    // Fire onload asynchronously so assignment stack can complete first
    if (this.onload) setTimeout(this.onload.bind(this), 0);
  }
};

// Suppress noisy console.error from React Testing Library act() warnings
const originalError = console.error.bind(console);
beforeEach(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('act(')) return;
    originalError(...args);
  };
});
afterEach(() => {
  console.error = originalError;
});
