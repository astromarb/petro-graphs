import { describe, it, expect } from 'vitest';
import {
  clamp, convertUnit, niceScaleBar, ptToPx, pxToPt, nanoid, UNIT_METERS,
} from '../utils';
import type { ImageCalibration } from '../types';

describe('clamp', () => {
  it('returns value inside range unchanged', () => expect(clamp(5, 0, 10)).toBe(5));
  it('clamps below min', () => expect(clamp(-3, 0, 10)).toBe(0));
  it('clamps above max', () => expect(clamp(42, 0, 10)).toBe(10));
});

describe('convertUnit', () => {
  it('µm → mm divides by 1000', () => expect(convertUnit(1500, 'µm', 'mm')).toBeCloseTo(1.5));
  it('mm → µm multiplies by 1000', () => expect(convertUnit(2, 'mm', 'µm')).toBeCloseTo(2000));
  it('m → km divides by 1000', () => expect(convertUnit(2500, 'm', 'km')).toBeCloseTo(2.5));
  it('Å → nm divides by 10', () => expect(convertUnit(25, 'Å', 'nm')).toBeCloseTo(2.5));
  it('identity conversion is a no-op', () => expect(convertUnit(7, 'cm', 'cm')).toBeCloseTo(7));
  it('UNIT_METERS is strictly increasing from Å to km', () => {
    const order = ['Å', 'nm', 'µm', 'mm', 'cm', 'm', 'km'] as const;
    for (let i = 1; i < order.length; i++) {
      expect(UNIT_METERS[order[i]]).toBeGreaterThan(UNIT_METERS[order[i - 1]]);
    }
  });
});

describe('ptToPx / pxToPt', () => {
  it('8 pt at 300 dpi = 33 px', () => expect(ptToPx(8, 300)).toBe(33));
  it('16 pt at 300 dpi = 67 px', () => expect(ptToPx(16, 300)).toBe(67));
  it('12 pt at 72 dpi = 12 px (1:1 at 72 dpi)', () => expect(ptToPx(12, 72)).toBe(12));
  it('round-trips within rounding error', () => {
    for (const pt of [8, 10, 12, 16, 24]) {
      expect(Math.abs(pxToPt(ptToPx(pt, 300), 300) - pt)).toBeLessThanOrEqual(1);
    }
  });
});

describe('niceScaleBar', () => {
  const cal = (unitsPerPixel: number, unit: ImageCalibration['unit'] = 'µm'): ImageCalibration => ({
    unitsPerPixel, unit, refPixelDistance: 100, refRealLength: unitsPerPixel * 100,
  });

  it('image at native size, 5 µm/px, 400 px wide → 500 µm bar at 100 px (25%)', () => {
    const r = niceScaleBar(400, 400, cal(5));
    expect(r).toEqual({ realLength: 500, unit: 'µm', canvasPx: 100 });
  });

  it('image displayed at half size doubles units-per-canvas-px', () => {
    // 400 src px shown at 200 canvas px → 10 µm per canvas px
    // target = 10 * 200 * 0.25 = 500 µm → canvasPx = 500/10 = 50
    const r = niceScaleBar(400, 200, cal(5));
    expect(r.realLength).toBe(500);
    expect(r.canvasPx).toBe(50);
  });

  it('always picks a 1/2/5/10 × 10^n round number', () => {
    for (const upp of [0.37, 1.1, 3.3, 7.9, 42]) {
      const { realLength } = niceScaleBar(800, 600, cal(upp));
      const mag = Math.pow(10, Math.floor(Math.log10(realLength)));
      const mantissa = realLength / mag;
      expect([1, 2, 5, 10]).toContainEqual(expect.closeTo(mantissa, 5));
    }
  });

  it('respects a custom targetFraction', () => {
    const half = niceScaleBar(400, 400, cal(5), 0.5);   // target 1000 µm
    expect(half.realLength).toBe(1000);
    expect(half.canvasPx).toBe(200);
  });

  it('preserves the calibration unit', () => {
    expect(niceScaleBar(100, 100, cal(2, 'nm')).unit).toBe('nm');
  });

  it('canvasPx is consistent with realLength (round-trip)', () => {
    const r = niceScaleBar(1024, 512, cal(3.7));
    const unitsPerCanvasPx = 3.7 * (1024 / 512);
    expect(r.canvasPx).toBe(Math.round(r.realLength / unitsPerCanvasPx));
  });
});

describe('scale bar tracks image resize (rescale invariant)', () => {
  // Mirrors the object:modified logic in CanvasArea: when an image is resized
  // by `ratio`, an attached bar's length multiplies by ratio and its
  // metersPerCanvasPx divides by ratio — so the real-world reading
  // (length × metersPerCanvasPx) must be invariant.
  const rescale = (len: number, mpcp: number, ratio: number) => ({
    length: Math.max(1, Math.round(len * ratio)),
    metersPerCanvasPx: mpcp / ratio,
  });

  it.each([
    [100, 5e-6, 2],
    [100, 5e-6, 0.5],
    [37, 1.3e-7, 3.17],
    [250, 2e-3, 0.21],
  ])('length %i px, %f m/px, ratio %f keeps real length constant', (len, mpcp, ratio) => {
    const before = len * mpcp;
    const after = rescale(len, mpcp, ratio);
    // Pixel lengths are rounded to integers, so allow up to half a pixel of
    // drift in real-world terms (0.5 × new metersPerCanvasPx).
    const tolerance = 0.5000001 * after.metersPerCanvasPx; // half-pixel + float epsilon
    expect(Math.abs(after.length * after.metersPerCanvasPx - before)).toBeLessThanOrEqual(tolerance);
  });

  it('bar position stays pinned to the same relative spot on the image', () => {
    // image at (100, 100), bar at (112, 360) → offset (12, 260)
    // image doubles in size from its anchor → offset doubles
    const img = { x: 100, y: 100, w: 400, h: 300 };
    const sb  = { x: 112, y: 360 };
    const ratioX = 2, ratioY = 2;
    const nx = img.x + (sb.x - img.x) * ratioX;
    const ny = img.y + (sb.y - img.y) * ratioY;
    expect(nx).toBe(124);
    expect(ny).toBe(620);
  });
});

describe('nanoid', () => {
  it('generates unique ids across many calls', () => {
    const ids = new Set(Array.from({ length: 500 }, () => nanoid()));
    expect(ids.size).toBe(500);
  });
});
