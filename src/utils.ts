export function nanoid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export const BORDER_COLORS = [
  '#ffffff', '#000000', '#e8edf5', '#aa3bff', '#4aadaa',
  '#d4a847', '#c47b8a', '#5b8dee', '#3ecf8e', '#e05c5c',
  '#f5a623', '#2d3548',
];

import type { ImageCalibration, ScaleUnit } from './types';

export const UNIT_METERS: Record<ScaleUnit, number> = {
  'Å': 1e-10, 'nm': 1e-9, 'µm': 1e-6, 'mm': 1e-3,
  'cm': 1e-2, 'm': 1, 'km': 1e3,
};

export function convertUnit(value: number, from: ScaleUnit, to: ScaleUnit): number {
  return value * UNIT_METERS[from] / UNIT_METERS[to];
}

/**
 * Given a calibrated image displayed at `displayWidthPx` canvas pixels
 * (original image is `srcWidthPx` pixels wide), return a "nice" scale bar
 * suggestion: a round real-world number and the canvas pixel length it maps to.
 * targetFraction — preferred fraction of display width for the bar (default 0.25).
 */
export function niceScaleBar(
  srcWidthPx: number,
  displayWidthPx: number,
  calibration: ImageCalibration,
  targetFraction = 0.25,
): { realLength: number; unit: ScaleUnit; canvasPx: number } {
  const canvasUnitsPerPx = calibration.unitsPerPixel * (srcWidthPx / displayWidthPx);
  const targetRealLength = canvasUnitsPerPx * displayWidthPx * targetFraction;
  const mag = Math.pow(10, Math.floor(Math.log10(targetRealLength)));
  const candidates = [1, 2, 5, 10].map(n => n * mag);
  const best = candidates.reduce((a, b) =>
    Math.abs(a - targetRealLength) <= Math.abs(b - targetRealLength) ? a : b,
  );
  return {
    realLength: best,
    unit: calibration.unit,
    canvasPx: Math.round(best / canvasUnitsPerPx),
  };
}

/** Convert typographic points to canvas pixels at a given DPI. */
export const ptToPx = (pt: number, dpi: number): number => Math.round(pt * dpi / 72);
/** Convert canvas pixels to typographic points at a given DPI. */
export const pxToPt = (px: number, dpi: number): number => Math.round(px * 72 / dpi);

export const NAMED_COLORS: Record<string, string> = {
  White: '#ffffff',
  Black: '#000000',
  'Light gray': '#c8d0dc',
  Purple: '#aa3bff',
  Teal: '#4aadaa',
  Amber: '#d4a847',
  Rose: '#c47b8a',
  Blue: '#5b8dee',
  Green: '#3ecf8e',
  Red: '#e05c5c',
};
