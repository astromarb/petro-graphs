import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as fabric from 'fabric';
import { useStore } from '../store';
import type {
  CanvasObject, ImageObject, TextObject, ShapeObject, ScaleBarObject,
  BorderStyle, InsetPair, ThinSectionImage, ImageAdjustments, ScaleUnit, PendingGrid,
} from '../types';
import { DEFAULT_ADJUSTMENTS } from '../types';
import { nanoid, niceScaleBar, UNIT_METERS } from '../utils';
import { renderLatexToFabricImage, renderLatexToDataUrl } from '../latexRenderer';
import { sharedFabricRef } from '../fabricRef';

// ── Helpers ──────────────────────────────────────────────────────────────

function borderToDash(style: BorderStyle['style'], w: number): number[] {
  if (style === 'dashed') return [w * 4, w * 2];
  if (style === 'dotted') return [w, w * 2];
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyAdjustments(fImg: fabric.FabricImage, adj: ImageAdjustments) {
  const filters: any[] = [];
  if (adj.brightness !== 0)
    filters.push(new fabric.filters.Brightness({ brightness: adj.brightness }));
  if (adj.contrast !== 0)
    filters.push(new fabric.filters.Contrast({ contrast: adj.contrast }));
  if (adj.saturation !== 0)
    filters.push(new fabric.filters.Saturation({ saturation: adj.saturation }));
  if (adj.hue !== 0)
    filters.push(new fabric.filters.HueRotation({ rotation: adj.hue }));
  if (adj.grayscale)
    filters.push(new fabric.filters.Grayscale());
  if (adj.invert)
    filters.push(new fabric.filters.Invert());
  if (adj.sharpen)
    filters.push(new fabric.filters.Convolute({
      matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0],
    }));
  fImg.filters = filters;
  fImg.applyFilters();
  fImg.set({ flipX: adj.flipX, flipY: adj.flipY });
}

function applyBorder(fObj: fabric.FabricObject, b: BorderStyle) {
  fObj.set({
    stroke: b.style === 'none' ? '' : b.color,
    strokeWidth: b.style === 'none' ? 0 : b.width,
    strokeDashArray: borderToDash(b.style, b.width),
  });
  if ('rx' in fObj) {
    (fObj as fabric.Rect).set({ rx: b.radius, ry: b.radius });
  } else if (fObj instanceof fabric.FabricImage && b.radius > 0) {
    // FabricImage doesn't have rx/ry — use a clipPath rect
    const w = (fObj.width  ?? 100) * (fObj.scaleX ?? 1);
    const h = (fObj.height ?? 100) * (fObj.scaleY ?? 1);
    fObj.clipPath = new fabric.Rect({
      width: fObj.width ?? 100,
      height: fObj.height ?? 100,
      rx: b.radius / (fObj.scaleX ?? 1),
      ry: b.radius / (fObj.scaleY ?? 1),
      originX: 'center', originY: 'center',
    });
    void w; void h;
  } else if (fObj instanceof fabric.FabricImage) {
    fObj.clipPath = undefined;
  }
}

async function cropDataUrl(
  src: string,
  sx: number, sy: number, sw: number, sh: number,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(sw));
      c.height = Math.max(1, Math.round(sh));
      c.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      resolve(c.toDataURL('image/jpeg', 0.95));
    };
    img.src = src;
  });
}

function getScenePt(fc: fabric.Canvas, options: fabric.TEvent): fabric.Point | null {
  // Fabric v6: getScenePoint(e) converts DOM mouse coords → scene (canvas) coords
  try { return fc.getScenePoint(options.e as MouseEvent); } catch { /* fallback */ }
  const o = options as unknown as { scenePoint?: fabric.Point; absolutePointer?: fabric.Point };
  return o.scenePoint ?? o.absolutePointer ?? null;
}



// ── Ruler overlay ─────────────────────────────────────────────────────────

function RulerOverlay({
  orientation, size, zoom, dpi, docSize, rulerUnit, left, top,
}: {
  orientation: 'horizontal' | 'vertical';
  size: number;
  zoom: number;
  dpi: number;
  docSize: number;
  rulerUnit: 'in' | 'cm' | 'mm';
  left?: number;
  top?: number;
}) {
  const isH = orientation === 'horizontal';
  const RULER_SIZE = 18;

  // Determine tick spacing in real-world units
  // pxPerUnit = how many doc-pixels per 1 real unit (inch or cm)
  const pxPerIn = dpi;
  const pxPerUnit = rulerUnit === 'in' ? pxPerIn
    : rulerUnit === 'mm'               ? pxPerIn / 25.4
    :                                    pxPerIn / 2.54;  // cm

  // Nice tick intervals in real units
  const unitCandidates = rulerUnit === 'in'
    ? [1/16, 1/8, 1/4, 1/2, 1, 2, 3, 6, 12]
    : rulerUnit === 'mm'
    ? [0.5, 1, 2, 5, 10, 25, 50, 100, 250]
    : [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50];
  const minSpacingPx = 40;
  const tickUnit = unitCandidates.find(c => c * pxPerUnit * zoom >= minSpacingPx) ?? unitCandidates[unitCandidates.length - 1];
  const tickDocPx = tickUnit * pxPerUnit;

  const totalUnits = docSize / pxPerUnit;
  const ticks: { pos: number; label: string }[] = [];
  for (let u = 0; u <= totalUnits + 1e-9; u += tickUnit) {
    const docPx = u * pxPerUnit;
    if (docPx > docSize + 0.5) break;
    const pos = docPx * zoom;
    const label = Number.isInteger(u) ? `${Math.round(u)}` : `${+u.toFixed(2)}`;
    ticks.push({ pos, label });
  }

  void tickDocPx;

  const containerStyle: React.CSSProperties = isH
    ? { position: 'absolute', top: (top ?? 0) - RULER_SIZE, left: left ?? 0, width: size, height: RULER_SIZE, pointerEvents: 'none', zIndex: 10 }
    : { position: 'absolute', top: top ?? 0, left: (left ?? 0) - RULER_SIZE, width: RULER_SIZE, height: size, pointerEvents: 'none', zIndex: 10 };

  return (
    <div style={{
      ...containerStyle,
      background: 'rgba(20,20,28,0.88)',
      border: '1px solid rgba(255,255,255,0.08)',
      overflow: 'hidden',
    }}>
      {ticks.map(({ pos, label }) => (
        <div key={pos} style={{
          position: 'absolute',
          ...(isH
            ? { left: pos, top: 0, width: 1, height: RULER_SIZE }
            : { top: pos, left: 0, width: RULER_SIZE, height: 1 }),
          background: 'rgba(255,255,255,0.25)',
        }}>
          <span style={{
            position: 'absolute',
            fontSize: 8,
            color: 'rgba(255,255,255,0.5)',
            userSelect: 'none',
            ...(isH
              ? { left: 2, top: 2, whiteSpace: 'nowrap' }
              : { left: 2, top: 2, whiteSpace: 'nowrap', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }),
          }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}


// OVERFLOW_PAD is intentionally 0: the canvas equals the document boundary.
// A non-zero pad caused the canvas element to be much larger than the page,
// making overflow areas visible as a "ghost" rectangle next to the white page
// when the outer wrapper used overflow:hidden + flex centering (the wrapper
// centered the entire canvas, not the document within it).  Objects outside
// the document are clipped by Fabric at the canvas edge — acceptable since
// the export always crops to the document boundary anyway.
const OVERFLOW_PAD = 0;

// ── Component ─────────────────────────────────────────────────────────────

export default function CanvasArea() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef   = useRef<fabric.Canvas | null>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  // Serializes async Fabric dispose → create across remounts (see init effect)
  const disposeChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const {
    doc, groups, addObject, setSelectedId,
    tool, setTool, zoom, setZoom, setPan,
    insets, addInset,
    addImageToGroup,
    selectedId, showRulers, rulerUnit, toggleRulerUnit,
    fitViewRequest,
    pendingGrid, setPendingGrid,
  } = useStore();

  // Compute whether the currently selected object is a calibrated image
  const selectedCalibratedImg = (() => {
    if (!selectedId) return null;
    const obj = doc.objects.find(o => o.id === selectedId);
    if (!obj || obj.type !== 'image') return null;
    const img = groups.flatMap(g => g.images).find(i => i.id === (obj as ImageObject).imageId);
    return img?.calibration ? img : null;
  })();

  // ── Object map: storeId → fabric object ──────────────────────────────
  const objMapRef = useRef<Map<string, fabric.FabricObject>>(new Map());

  // ── Document background rect (the white page within the larger canvas) ──
  const docBgRef = useRef<fabric.Rect | null>(null);

  // ── Panning ───────────────────────────────────────────────────────────
  const isPanning = useRef(false);
  const lastPan   = useRef({ x: 0, y: 0 });

  // ── Drop highlight ────────────────────────────────────────────────────
  const [dropHighlight, setDropHighlight] = useState(false);

  // ── Inset state ───────────────────────────────────────────────────────
  const [insetPhase, setInsetPhase]       = useState<'idle' | 'selecting'>('idle');
  const [insetSourceId, setInsetSourceId] = useState<string | null>(null);
  const cropRectRef = useRef<fabric.Rect | null>(null);

  // ── Grid-place draw state ─────────────────────────────────────────────
  const gridRectPreviewRef = useRef<fabric.Rect | null>(null);
  const gridDrawRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const pendingGridRef = useRef<PendingGrid | null>(null);
  useEffect(() => { pendingGridRef.current = pendingGrid; }, [pendingGrid]);

  // ── Scalebar draw state ───────────────────────────────────────────────
  const [scalebarPhase, setScalebarPhase] = useState<'idle' | 'drawing'>('idle');
  const scalebarPreviewRef = useRef<fabric.Line | null>(null);
  const scalebarDrawRef    = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const scalebarSourceRef  = useRef<{ metersPerCanvasPx: number; unit: ScaleUnit } | null>(null);

  // ── Connector lines: pairId → {line, indicator} ──────────────────────
  const connectorMapRef = useRef<Map<string, { line: fabric.Line; indicator: fabric.Rect }>>(new Map());

  // (mode tag labels removed — PPL/XPL overlays are no longer rendered)

  // ── Refs to latest values (used in stable fabric event handlers) ──────
  const toolRef = useRef(tool);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const addObjectRef = useRef(addObject);
  useEffect(() => { addObjectRef.current = addObject; }, [addObject]);
  const setSelectedIdRef = useRef(setSelectedId);
  useEffect(() => { setSelectedIdRef.current = setSelectedId; }, [setSelectedId]);

  const insetPhaseRef    = useRef(insetPhase);
  const insetSourceIdRef = useRef(insetSourceId);
  useEffect(() => { insetPhaseRef.current = insetPhase; }, [insetPhase]);
  useEffect(() => { insetSourceIdRef.current = insetSourceId; }, [insetSourceId]);

  const scalebarPhaseRef = useRef(scalebarPhase);
  useEffect(() => { scalebarPhaseRef.current = scalebarPhase; }, [scalebarPhase]);

  // temp-pan: tool overridden by spacebar hold
  const prevToolRef = useRef<typeof tool | null>(null);

  // Guard: prevent double-placement from mousedown+mouseup both firing
  const justPlacedRef = useRef(false);

  // Keep setTool in a ref so fabric event handlers can call it
  const setToolRef = useRef(setTool);
  useEffect(() => { setToolRef.current = setTool; }, [setTool]);

  // Used to trigger the sync effect after canvas init completes
  const [fabricReady, setFabricReady] = useState(false);
  // Smart guide lines shown during drag: screen-pixel coordinates relative to canvas div
  const [guides, setGuides] = useState<{ type: 'v' | 'h'; pos: number }[]>([]);
  const setGuidesRef = useRef(setGuides);

  // ── Initialize Fabric canvas (once) ──────────────────────────────────
  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;
    let cancelled = false;
    let created: fabric.Canvas | null = null;

    // Fabric's dispose() is async: it tears down the DOM wrapper after the
    // current render settles. If a remount (React StrictMode in dev, or any
    // future slot/page switching) creates a new Canvas around the same
    // element while the old one is mid-dispose, the old teardown rips the
    // element out of the new instance's container — leaving a dead "ghost"
    // canvas in the DOM and a misaligned interaction layer. Chaining
    // create/dispose on a single promise serializes the lifecycle.
    disposeChainRef.current = disposeChainRef.current.then(() => {
      if (cancelled) return;

      const fc = new fabric.Canvas(el, {
        selection: true,
        preserveObjectStacking: true,
      });
      created = fc;

      fabricRef.current = fc;
      sharedFabricRef.current = fc;
  
      // Document background rect — the white page within the larger canvas.
      // Canvas background is transparent so the CSS checkerboard shows through
      // in the OVERFLOW_PAD margin; only this rect is "white".
      const bgRect = new fabric.Rect({
        left: 0, top: 0,
        width: useStore.getState().doc.width,
        height: useStore.getState().doc.height,
        fill: useStore.getState().doc.background,
        selectable: false, evented: false,
      });
      fc.add(bgRect);
      docBgRef.current = bgRect;
      // fc.backgroundColor stays '' (transparent)
  
      setFabricReady(true);
  
      fc.on('selection:created', () => {
        const sel = fc.getActiveObject() as fabric.FabricObject & { storeId?: string };
        if (sel?.storeId) setSelectedIdRef.current(sel.storeId);
      });
      fc.on('selection:updated', () => {
        const sel = fc.getActiveObject() as fabric.FabricObject & { storeId?: string };
        if (sel?.storeId) setSelectedIdRef.current(sel.storeId);
      });
      fc.on('selection:cleared', () => setSelectedIdRef.current(null));
  
      fc.on('object:modified', (e) => {
        setGuidesRef.current([]);
        const fObj = e.target as fabric.FabricObject & { storeId?: string };
        if (!fObj?.storeId) return;
        if (fObj === cropRectRef.current) return;
        useStore.getState().updateObject(fObj.storeId, {
          x: fObj.left ?? 0,
          y: fObj.top  ?? 0,
          width:  (fObj.width  ?? 1) * (fObj.scaleX ?? 1),
          height: (fObj.height ?? 1) * (fObj.scaleY ?? 1),
          rotation: fObj.angle ?? 0,
        });
      });
  
      // Keep mode tags tracking their image live during drag (before store commits).
      // Also compute smart alignment guides.
      fc.on('object:moving', (e) => {
        const fObj = e.target as fabric.FabricObject & { storeId?: string };
        if (!fObj?.storeId) return;
  
        // ── Smart guides ─────────────────────────────────────────────────
        const { doc: sd } = useStore.getState();
        const vt   = fc.viewportTransform ?? [1,0,0,1,0,0];
        const zoom = vt[0];
        const panX = vt[4];
        const panY = vt[5];
  
        // Moving object bounds in doc pixels
        const mL = fObj.left  ?? 0;
        const mT = fObj.top   ?? 0;
        const mW = (fObj.width  ?? 0) * (fObj.scaleX ?? 1);
        const mH = (fObj.height ?? 0) * (fObj.scaleY ?? 1);
        const mR  = mL + mW;
        const mMX = mL + mW / 2;
        const mB  = mT + mH;
        const mMY = mT + mH / 2;
        const movingEdgesX = [mL, mMX, mR];
        const movingEdgesY = [mT, mMY, mB];
  
        // Reference snap points: canvas edges + other objects
        const refX = new Set<number>([0, sd.width / 2, sd.width]);
        const refY = new Set<number>([0, sd.height / 2, sd.height]);
        sd.objects.forEach(o => {
          if (o.id === fObj.storeId) return;
          refX.add(o.x); refX.add(o.x + o.width / 2); refX.add(o.x + o.width);
          refY.add(o.y); refY.add(o.y + o.height / 2); refY.add(o.y + o.height);
        });
  
        const SNAP_THRESH = 6 / zoom; // 6 screen px → doc px
        const activeGuides: { type: 'v' | 'h'; pos: number }[] = [];
  
        // Snap and record guides on X axis
        let snappedX = false;
        outer_x: for (const ref of refX) {
          for (let ei = 0; ei < movingEdgesX.length; ei++) {
            const diff = movingEdgesX[ei] - ref;
            if (Math.abs(diff) <= SNAP_THRESH) {
              fObj.set({ left: mL - diff });
              activeGuides.push({ type: 'v', pos: Math.round(ref * zoom + panX) });
              snappedX = true;
              break outer_x;
            }
          }
        }
        void snappedX;
  
        // Snap and record guides on Y axis
        let snappedY = false;
        outer_y: for (const ref of refY) {
          for (let ei = 0; ei < movingEdgesY.length; ei++) {
            const diff = movingEdgesY[ei] - ref;
            if (Math.abs(diff) <= SNAP_THRESH) {
              fObj.set({ top: mT - diff });
              activeGuides.push({ type: 'h', pos: Math.round(ref * zoom + panY) });
              snappedY = true;
              break outer_y;
            }
          }
        }
        void snappedY;
  
        setGuidesRef.current(activeGuides);
      });
  
      // ── mouse:down — start grid-place rect draw ───────────────────────
      fc.on('mouse:down', (options) => {
        if (toolRef.current === 'grid-place') {
          const pt = getScenePt(fc, options);
          if (!pt) return;
          gridDrawRef.current = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
          const preview = new fabric.Rect({
            left: pt.x, top: pt.y, width: 0, height: 0,
            fill: 'rgba(170,59,255,0.12)',
            stroke: '#aa3bff', strokeWidth: 2,
            strokeDashArray: [6, 4],
            selectable: false, evented: false,
          });
          gridRectPreviewRef.current = preview;
          fc.add(preview);
          fc.renderAll();
          return;
        }
      });
  
      // ── mouse:down — start scalebar draw (requires calibrated image) ─────
      fc.on('mouse:down', (options) => {
        if (toolRef.current !== 'scalebar') return;
        if (scalebarPhaseRef.current !== 'idle') return;
  
        // Require a calibrated image to be selected
        const { selectedId, doc: sd, groups: sg } = useStore.getState();
        const imgObj = sd.objects.find(o => o.id === selectedId && o.type === 'image') as ImageObject | undefined;
        const srcGrp = sg.find(gr => gr.id === imgObj?.groupId);
        const srcImg = srcGrp?.images.find(i => i.id === imgObj?.imageId);
        const cal    = srcImg?.calibration;
        if (!imgObj || !srcImg || !cal) return;
  
        const canvasUnitsPerPx  = cal.unitsPerPixel * (srcImg.width / imgObj.width);
        const metersPerCanvasPx = canvasUnitsPerPx * (UNIT_METERS[cal.unit] ?? 1e-6);
        scalebarSourceRef.current = { metersPerCanvasPx, unit: cal.unit };
  
        const pt = getScenePt(fc, options);
        if (!pt) return;
        const line = new fabric.Line([pt.x, pt.y, pt.x, pt.y], {
          stroke: '#ffcc00', strokeWidth: 3,
          selectable: false, evented: false,
          strokeLineCap: 'round',
        });
        scalebarPreviewRef.current = line;
        scalebarDrawRef.current = { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
        fc.add(line);
        fc.renderAll();
        setScalebarPhase('drawing');
      });
  
      // ── mouse:move — update grid-place rect preview ───────────────────
      fc.on('mouse:move', (options) => {
        if (toolRef.current === 'grid-place' && gridDrawRef.current && gridRectPreviewRef.current) {
          const pt = getScenePt(fc, options);
          if (!pt) return;
          const d = gridDrawRef.current;
          d.x2 = pt.x; d.y2 = pt.y;
          const left   = Math.min(d.x1, d.x2);
          const top    = Math.min(d.y1, d.y2);
          const width  = Math.abs(d.x2 - d.x1);
          const height = Math.abs(d.y2 - d.y1);
          gridRectPreviewRef.current.set({ left, top, width, height });
          fc.renderAll();
          return;
        }
      });
  
      // ── mouse:move — update scalebar preview line ─────────────────────
      fc.on('mouse:move', (options) => {
        if (toolRef.current !== 'scalebar') return;
        if (scalebarPhaseRef.current !== 'drawing') return;
        const pt = getScenePt(fc, options);
        if (!pt || !scalebarPreviewRef.current || !scalebarDrawRef.current) return;
        scalebarPreviewRef.current.set({ x2: pt.x, y2: pt.y });
        scalebarDrawRef.current.x2 = pt.x;
        scalebarDrawRef.current.y2 = pt.y;
        fc.renderAll();
      });
  
      // ── mouse:up — finish grid-place rect draw ────────────────────────
      fc.on('mouse:up', () => {
        if (toolRef.current !== 'grid-place') return;
        const d   = gridDrawRef.current;
        const pg  = pendingGridRef.current;
        // Remove preview rect
        if (gridRectPreviewRef.current) {
          fc.remove(gridRectPreviewRef.current);
          gridRectPreviewRef.current = null;
          fc.renderAll();
        }
        gridDrawRef.current = null;
        if (!d || !pg) { setToolRef.current('select'); return; }
  
        const areaW = Math.abs(d.x2 - d.x1);
        const areaH = Math.abs(d.y2 - d.y1);
        if (areaW < 20 || areaH < 20) { setToolRef.current('select'); return; }
  
        const { groups: sg } = useStore.getState();
        const grp = sg.find(g => g.id === pg.groupId);
        if (!grp) { setToolRef.current('select'); return; }
  
        const imgs = pg.imageIds
          .map(id => grp.images.find(i => i.id === id))
          .filter(Boolean) as typeof grp.images;
  
        if (imgs.length === 0) { setToolRef.current('select'); return; }
  
        const cols  = pg.cols;
        const rows  = Math.ceil(imgs.length / cols);
        const gap   = pg.gap;
        const cellW = Math.floor((areaW - gap * (cols - 1)) / cols);
        const cellH = Math.floor((areaH - gap * (rows - 1)) / rows);
        const originX = Math.min(d.x1, d.x2);
        const originY = Math.min(d.y1, d.y2);
  
        if (cellW < 10 || cellH < 10) { setToolRef.current('select'); return; }
  
        const objs: CanvasObject[] = imgs.map((img, idx) => ({
          id: nanoid(),
          type: 'image' as const,
          imageId: img.id,
          groupId: grp.id,
          mode: img.mode,
          x: Math.round(originX + (idx % cols) * (cellW + gap)),
          y: Math.round(originY + Math.floor(idx / cols) * (cellH + gap)),
          width:  cellW,
          height: cellH,
          rotation: 0, locked: false, visible: true,
          label: img.name,
          border: { color: '#ffffff', width: 2, style: 'solid' as const, radius: 0 },
          opacity: 1,
          adjustments: { ...DEFAULT_ADJUSTMENTS },
        } as ImageObject));
  
        useStore.getState().addObjects(objs);
        useStore.getState().setPendingGrid(null);
        setToolRef.current('select');
      });
  
      // ── mouse:up — place text/shape, finish scalebar, start inset ────
      fc.on('mouse:up', (options) => {
        const currentTool = toolRef.current;
  
        // Finish scalebar draw — create directly from calibration
        if (currentTool === 'scalebar' && scalebarPhaseRef.current === 'drawing') {
          if (scalebarPreviewRef.current) {
            fc.remove(scalebarPreviewRef.current);
            scalebarPreviewRef.current = null;
            fc.renderAll();
          }
          const d   = scalebarDrawRef.current;
          const src = scalebarSourceRef.current;
          scalebarDrawRef.current   = null;
          scalebarSourceRef.current = null;
          setScalebarPhase('idle');
          if (!d || !src) return;
          const dx = d.x2 - d.x1;
          const dy = d.y2 - d.y1;
          const pixLen = Math.sqrt(dx * dx + dy * dy);
          if (pixLen < 5) return;
          const pLen = Math.round(pixLen);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const rawReal = pLen * src.metersPerCanvasPx / (UNIT_METERS[src.unit] ?? 1e-6);
          // Round to 3 significant figures for a clean label
          const realLength = parseFloat(rawReal.toPrecision(3));
          useStore.getState().addObject({
            id: nanoid(), type: 'scalebar',
            x: Math.round(Math.min(d.x1, d.x2)),
            y: Math.round(Math.min(d.y1, d.y2)) - 2,
            width: pLen, height: 28,
            rotation: angle, locked: false, visible: true,
            label: `${realLength} ${src.unit}`,
            length: pLen, realLength, unit: src.unit,
            color: '#ffffff', labelColor: '#ffffff', thickness: 4, fontSize: 13,
            metersPerCanvasPx: src.metersPerCanvasPx,
          });
          return;
        }
  
        if (!['text', 'shape', 'inset'].includes(currentTool)) return; // grid-place handled in its own handler above
  
        // Guard: ignore if we just placed an object in this same click cycle
        if (justPlacedRef.current) { justPlacedRef.current = false; return; }
  
        const target = options.target as (fabric.FabricObject & { storeId?: string }) | null;
        const pt = getScenePt(fc, options);
        if (!pt) return;
        const cx = Math.round(pt.x);
        const cy = Math.round(pt.y);
  
        // ── Inset: click on an image to begin crop selection ─────────────
        if (currentTool === 'inset') {
          if (insetPhaseRef.current === 'selecting') return;
          if (!target?.storeId) return;
          const storeObj = useStore.getState().doc.objects.find(o => o.id === target.storeId);
          if (!storeObj || storeObj.type !== 'image') return;
  
          setInsetSourceId(target.storeId);
          setInsetPhase('selecting');
  
          const defaultW = storeObj.width * 0.45;
          const defaultH = storeObj.height * 0.45;
          const rect = new fabric.Rect({
            left:   storeObj.x + storeObj.width  * 0.275,
            top:    storeObj.y + storeObj.height * 0.275,
            width:  defaultW,
            height: defaultH,
            fill:   'rgba(170,59,255,0.10)',
            stroke: '#aa3bff',
            strokeWidth: 2,
            strokeDashArray: [6, 4],
            cornerColor: '#aa3bff',
            cornerSize: 10,
            transparentCorners: false,
            selectable: true,
            evented: true,
          });
          cropRectRef.current = rect;
          fc.add(rect);
          fc.bringObjectToFront(rect); // ensure crop rect is above all images
          fc.setActiveObject(rect);
          fc.renderAll();
          return;
        }
  
        // Don't place on top of a user-placed store object
        if (target?.storeId) return;
  
        const state = useStore.getState();
  
        if (currentTool === 'text') {
          const newId = nanoid();
          state.addObject({
            id: newId, type: 'text',
            content: 'Label', isLatex: false,
            x: cx, y: cy, width: 200, height: 40, rotation: 0,
            locked: false, visible: true, label: 'Text',
            fontSize: 16, color: '#000000', fontWeight: 'normal', align: 'left',
          });
          // Auto-return to select so next click selects rather than places
          setToolRef.current('select');
          // Select the newly placed object after fabric sync
          setTimeout(() => setSelectedIdRef.current(newId), 50);
        }
  
        if (currentTool === 'shape') {
          const newId = nanoid();
          state.addObject({
            id: newId, type: 'shape', shape: 'rect',
            x: cx - 60, y: cy - 40, width: 120, height: 80, rotation: 0,
            locked: false, visible: true, label: 'Shape',
            fill: '#aa3bff', fillOpacity: 0,
            border: { color: '#aa3bff', width: 2, style: 'solid', radius: 4 },
          });
          setToolRef.current('select');
          setTimeout(() => setSelectedIdRef.current(newId), 50);
        }
      });
    });

    return () => {
      cancelled = true;
      // Queue the dispose on the same chain so the next mount waits for it.
      disposeChainRef.current = disposeChainRef.current.then(() => {
        const fc = created;
        created = null;
        if (!fc) return;
        fabricRef.current = null;
        sharedFabricRef.current = null;
        docBgRef.current = null;
        setFabricReady(false);
        return fc.dispose().catch(() => {/* already disposed */});
      });
    };
  }, []);


  // ── Auto-fit zoom on first load and when doc dimensions change ──────────
  const prevDocSizeRef = useRef({ w: 0, h: 0 });
  useEffect(() => {
    const prev = prevDocSizeRef.current;
    if (prev.w === doc.width && prev.h === doc.height) return;
    prevDocSizeRef.current = { w: doc.width, h: doc.height };
    const wrap = wrapRef.current;
    if (!wrap) return;
    const padded = 0.92; // leave 8% margin
    const fitZoom = Math.min(
      (wrap.clientWidth  * padded) / doc.width,
      (wrap.clientHeight * padded) / doc.height,
    );
    setZoom(Math.max(0.05, Math.min(4, fitZoom)));
  }, [doc.width, doc.height, setZoom]);

  // ── fitView on demand (0 key, toolbar button) ─────────────────────────
  useEffect(() => {
    if (fitViewRequest === 0) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const padded = 0.92;
    const fitZoom = Math.min(
      (wrap.clientWidth  * padded) / doc.width,
      (wrap.clientHeight * padded) / doc.height,
    );
    setZoom(Math.max(0.05, Math.min(4, fitZoom)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitViewRequest]);

  // ── Canvas size, zoom & background ───────────────────────────────────────
  // Canvas element = doc × zoom + 2×OVERFLOW_PAD so objects placed outside
  // the document boundary are still rendered rather than silently clipped.
  // The doc area is represented by docBgRef (a plain Rect) rather than
  // fc.backgroundColor, so the overflow margin stays transparent and the
  // CSS checkerboard shows through it.
  useEffect(() => {
    const fc    = fabricRef.current;
    const bgRect = docBgRef.current;
    if (!fc) return;
    fc.setDimensions({
      width:  Math.round(doc.width  * zoom) + 2 * OVERFLOW_PAD,
      height: Math.round(doc.height * zoom) + 2 * OVERFLOW_PAD,
    });
    // Reset viewport so doc coord (0,0) maps to canvas pixel (OVERFLOW_PAD, OVERFLOW_PAD).
    // This also resets any accumulated pan (matching previous setZoom() behaviour).
    fc.setViewportTransform([zoom, 0, 0, zoom, OVERFLOW_PAD, OVERFLOW_PAD]);
    if (bgRect) {
      bgRect.set({ width: doc.width, height: doc.height });
      fc.sendObjectToBack(bgRect);
    }
    fc.renderAll();
  }, [zoom, doc.width, doc.height, fabricReady]);

  useEffect(() => {
    const bgRect = docBgRef.current;
    const fc = fabricRef.current;
    if (!bgRect || !fc) return;
    bgRect.set({ fill: doc.background });
    fc.renderAll();
  }, [doc.background, fabricReady]);



  // ── Tool mode (cursor, selection) ─────────────────────────────────────
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    if (tool === 'pan') {
      fc.defaultCursor = 'grab';
      fc.selection = false;
    } else if (['text', 'shape', 'scalebar', 'inset', 'grid-place'].includes(tool)) {
      fc.defaultCursor = 'crosshair';
      fc.selection = false;
    } else {
      fc.defaultCursor = 'default';
      fc.selection = true;
    }
    fc.getObjects().forEach(fObj => {
      if (fObj === cropRectRef.current) return;
      // Only user-owned objects (those with a storeId) can be selected; decorative
      // objects (scalebar parts, mode tags, inset indicators) must stay non-interactive.
      const owned = !!(fObj as fabric.FabricObject & { storeId?: string }).storeId;
      if (!owned) return; // always leave selectable/evented as set at creation time
      fObj.selectable = tool === 'select';
    });
    fc.renderAll();
  }, [tool]);

  // ── Pan with mouse ────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onDown = (e: MouseEvent) => {
      if (toolRef.current !== 'pan') return;
      isPanning.current = true;
      lastPan.current = { x: e.clientX, y: e.clientY };
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: MouseEvent) => {
      if (!isPanning.current) return;
      const fc = fabricRef.current;
      if (!fc) return;
      fc.relativePan(new fabric.Point(e.clientX - lastPan.current.x, e.clientY - lastPan.current.y));
      lastPan.current = { x: e.clientX, y: e.clientY };
      const t = fc.viewportTransform;
      setPan(-t[4], -t[5]);
    };
    const onUp = () => {
      isPanning.current = false;
      el.style.cursor = toolRef.current === 'pan' ? 'grab' : 'default';
    };

    el.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // ── Spacebar hold = temporary pan (works in any tool mode) ──────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      e.preventDefault();
      if (prevToolRef.current !== null) return; // already in temp-pan
      prevToolRef.current = toolRef.current;
      toolRef.current = 'pan';
      const fc = fabricRef.current;
      if (fc) { fc.defaultCursor = 'grab'; fc.selection = false; }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (prevToolRef.current === null) return;
      const restore = prevToolRef.current;
      prevToolRef.current = null;
      toolRef.current = restore;
      const fc = fabricRef.current;
      if (!fc) return;
      if      (restore === 'pan')   { fc.defaultCursor = 'grab'; fc.selection = false; }
      else if (['text','shape','scalebar','inset','grid-place'].includes(restore))
                                    { fc.defaultCursor = 'crosshair'; fc.selection = false; }
      else                          { fc.defaultCursor = 'default'; fc.selection = true; }
      fc.getObjects().forEach(o => {
        if (o === cropRectRef.current) return;
        (o as fabric.FabricObject).selectable = restore === 'select';
      });
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup',   onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup',   onUp);
    };
  }, []);

  // ── Scroll-to-zoom (plain scroll on canvas area) ─────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Pinch-to-zoom (ctrlKey set by browser for trackpad pinch) = fine steps
      const delta = e.ctrlKey || e.metaKey ? 0.05 : 0.1;
      setZoom(zoomRef.current + (e.deltaY > 0 ? -delta : delta));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Sync store objects → Fabric canvas ───────────────────────────────
  // fabricReady ensures this re-runs once after the canvas initializes,
  // so rehydrated state (images loaded from IndexedDB) gets drawn.
  // We read from useStore.getState() directly (rather than the closure's
  // doc/groups) so we always operate on the absolute freshest state and
  // eliminate any stale-closure snap-back when React batches updates.
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;

    const { doc: freshDoc, groups: freshGroups } = useStore.getState();

    const storeIds = new Set(freshDoc.objects.map(o => o.id));

    const toRemove: fabric.FabricObject[] = [];
    fc.getObjects().forEach(fObj => {
      const id = (fObj as fabric.FabricObject & { storeId?: string }).storeId;
      if (id && !storeIds.has(id)) toRemove.push(fObj);
    });
    toRemove.forEach(o => {
      // Also remove scale bar label image if one is attached to this object
      type WithLabel = fabric.FabricObject & { storeId?: string; _labelFab?: fabric.FabricImage };
      const withLabel = o as WithLabel;
      if (withLabel._labelFab) fc.remove(withLabel._labelFab);
      fc.remove(o);
      objMapRef.current.delete(withLabel.storeId!);
    });

    freshDoc.objects.forEach(obj => {
      const existing = objMapRef.current.get(obj.id) as (fabric.FabricObject & { storeId?: string; _latexKey?: string }) | undefined;
      if (existing) {
        // Sentinel: async render is in flight — don't sync or re-create yet
        if (!('storeId' in existing)) return;

        // LaTeX images must be recreated when content, color, or fontSize changes
        if (obj.type === 'text' && (obj as TextObject).isLatex) {
          const o = obj as TextObject;
          const newKey = `${o.content}||${o.fontSize}||${o.color}`;
          if (existing._latexKey !== newKey) {
            fc.remove(existing);
            objMapRef.current.delete(obj.id);
            createFabricObject(obj, freshGroups, fc, objMapRef.current);
            return;
          }
        }
        syncFabricProps(existing, obj);
      } else {
        createFabricObject(obj, freshGroups, fc, objMapRef.current);
      }
    });

    // Keep the document background rect behind all user objects
    if (docBgRef.current) fc.sendObjectToBack(docBgRef.current);
    fc.renderAll();
  }, [doc.objects, groups, fabricReady]);

  // ── Sync connector lines ──────────────────────────────────────────────
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;

    const liveIds = new Set(insets.map(p => p.id));

    for (const [pid, conn] of connectorMapRef.current) {
      if (!liveIds.has(pid)) {
        fc.remove(conn.line);
        fc.remove(conn.indicator);
        connectorMapRef.current.delete(pid);
      }
    }

    for (const pair of insets) {
      const parent = doc.objects.find(o => o.id === pair.parentObjectId);
      const inset  = doc.objects.find(o => o.id === pair.insetObjectId);
      if (!parent || !inset) continue;

      const srcX = parent.x + pair.cropRect.relX + pair.cropRect.w / 2;
      const srcY = parent.y + pair.cropRect.relY + pair.cropRect.h / 2;
      const tgtX = inset.x + inset.width  / 2;
      const tgtY = inset.y + inset.height / 2;

      if (connectorMapRef.current.has(pair.id)) {
        const conn = connectorMapRef.current.get(pair.id)!;
        conn.line.set({ x1: srcX, y1: srcY, x2: tgtX, y2: tgtY });
        conn.indicator.set({
          left: parent.x + pair.cropRect.relX,
          top:  parent.y + pair.cropRect.relY,
          width:  pair.cropRect.w,
          height: pair.cropRect.h,
        });
        conn.indicator.setCoords();
      } else {
        const line = new fabric.Line([srcX, srcY, tgtX, tgtY], {
          stroke: '#aa3bff', strokeWidth: 1.5,
          strokeDashArray: [5, 5],
          selectable: false, evented: false,
          opacity: 0.75,
        });
        const indicator = new fabric.Rect({
          left: parent.x + pair.cropRect.relX,
          top:  parent.y + pair.cropRect.relY,
          width:  pair.cropRect.w,
          height: pair.cropRect.h,
          fill: 'transparent',
          stroke: '#aa3bff', strokeWidth: 1.5,
          strokeDashArray: [4, 3],
          selectable: false, evented: false,
        });
        fc.add(line);
        fc.add(indicator);
        connectorMapRef.current.set(pair.id, { line, indicator });
      }
    }

    if (docBgRef.current) fc.sendObjectToBack(docBgRef.current);
    fc.renderAll();
  }, [insets, doc.objects]);

  // ── Drop image from sidebar ───────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropHighlight(false);
    const raw = e.dataTransfer.getData('application/petro-image');
    if (!raw) return;
    const { imageId, groupId } = JSON.parse(raw) as { imageId: string; groupId: string };

    // Always read fresh state so images from newly added groups are found
    const { groups: freshGroups, doc: freshDoc } = useStore.getState();
    const group = freshGroups.find(g => g.id === groupId);
    const img   = group?.images.find(i => i.id === imageId);
    if (!img) return;

    const fc = fabricRef.current;
    if (!fc) return;
    // Use the canvas element's bounding rect (not the wrapper) so the coord
    // calculation works regardless of OVERFLOW_PAD or wrapper centering offset.
    const canvasRect = fc.getElement().getBoundingClientRect();
    const vpt = fc.viewportTransform;
    const cx  = (e.clientX - canvasRect.left - vpt[4]) / zoomRef.current;
    const cy  = (e.clientY - canvasRect.top  - vpt[5]) / zoomRef.current;

    // Place at original pixel size; scale down only if larger than canvas
    const fitScale = Math.min(1, freshDoc.width / img.width, freshDoc.height / img.height);
    const defaultW = Math.round(img.width  * fitScale);
    const defaultH = Math.round(img.height * fitScale);

    addObject({
      id: nanoid(), type: 'image',
      imageId: img.id, groupId,
      mode: img.mode,
      x: Math.round(cx - defaultW / 2),
      y: Math.round(cy - defaultH / 2),
      width:  Math.round(defaultW),
      height: Math.round(defaultH),
      rotation: 0, locked: false, visible: true, label: img.name,
      border: { color: '#ffffff', width: 2, style: 'solid', radius: 0 },
      showModeTag: false, tagPosition: 'tl', opacity: 1,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
    });
  }, [addObject]);

  // ── Confirm inset creation ────────────────────────────────────────────
  const confirmInset = useCallback(async () => {
    const fc = fabricRef.current;
    const cropRect = cropRectRef.current;
    if (!fc || !cropRect || !insetSourceId) return;

    const parentObj = doc.objects.find(o => o.id === insetSourceId) as ImageObject | undefined;
    if (!parentObj) return;

    const group = groups.find(g => g.id === parentObj.groupId);
    const srcImg = group?.images.find(i => i.id === parentObj.imageId);
    if (!srcImg) return;

    // Use scene-space coords directly — cropRect.left/top are document coords,
    // unaffected by viewport zoom/pan (getBoundingRect returns viewport pixels, which
    // would mismatch the scene-space parentObj.x/y).
    const crLeft = cropRect.left ?? 0;
    const crTop  = cropRect.top  ?? 0;
    const crW    = cropRect.getScaledWidth();
    const crH    = cropRect.getScaledHeight();

    const relX = crLeft - parentObj.x;
    const relY = crTop  - parentObj.y;

    const scaleX = srcImg.width  / parentObj.width;
    const scaleY = srcImg.height / parentObj.height;

    const cropSx = Math.max(0, relX * scaleX);
    const cropSy = Math.max(0, relY * scaleY);
    const cropSw = Math.min(crW * scaleX, srcImg.width  - cropSx);
    const cropSh = Math.min(crH * scaleY, srcImg.height - cropSy);

    const croppedUrl = await cropDataUrl(srcImg.dataUrl, cropSx, cropSy, cropSw, cropSh);

    const newImg: ThinSectionImage = {
      id: nanoid(),
      mode: parentObj.mode,
      name: `${srcImg.name} — inset`,
      dataUrl: croppedUrl,
      width:  Math.round(cropSw),
      height: Math.round(cropSh),
    };
    addImageToGroup(parentObj.groupId, newImg);

    const insetW = Math.min(parentObj.width * 0.65, 220);
    const insetH = insetW * (cropSh / cropSw);
    const insetObj: ImageObject = {
      id: nanoid(), type: 'image',
      imageId: newImg.id, groupId: parentObj.groupId,
      mode: parentObj.mode,
      x: parentObj.x + parentObj.width + 24,
      y: parentObj.y,
      width:  Math.round(insetW),
      height: Math.round(insetH),
      rotation: 0, locked: false, visible: true,
      label: `${parentObj.label} — inset`,
      border: { color: '#aa3bff', width: 2, style: 'solid', radius: 0 },
      showModeTag: false, tagPosition: 'tl', opacity: 1,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
    };
    addObject(insetObj);

    const pair: InsetPair = {
      id: nanoid(),
      parentObjectId: parentObj.id,
      insetObjectId: insetObj.id,
      cropRect: { relX, relY, w: crW, h: crH },
    };
    addInset(pair);

    // Auto-generate scale bar if parent image is calibrated
    if (srcImg.calibration) {
      const cal = srcImg.calibration;
      const { realLength, unit, canvasPx } = niceScaleBar(cropSw, insetW, cal);
      const canvasUnitsPerPx  = cal.unitsPerPixel * (cropSw / insetW);
      const metersPerCanvasPx = canvasUnitsPerPx * (UNIT_METERS[cal.unit] ?? 1e-6);
      const sb: ScaleBarObject = {
        id: nanoid(), type: 'scalebar',
        x: insetObj.x + 10,
        y: insetObj.y + insetObj.height - 40,
        width: canvasPx + 20, height: 36,
        rotation: 0, locked: false, visible: true,
        label: `${realLength} ${unit}`,
        length: canvasPx, realLength, unit,
        color: '#ffffff', labelColor: '#ffffff', thickness: 4, fontSize: 13,
        metersPerCanvasPx,
      };
      addObject(sb);
    }

    fc.remove(cropRect);
    cropRectRef.current = null;
    setInsetPhase('idle');
    setInsetSourceId(null);
    setToolRef.current('select'); // return to pointer after inset creation
  }, [insetSourceId, doc.objects, groups, addObject, addImageToGroup, addInset]);

  const cancelInset = useCallback(() => {
    const fc = fabricRef.current;
    if (fc && cropRectRef.current) {
      fc.remove(cropRectRef.current);
      cropRectRef.current = null;
      fc.renderAll();
    }
    setInsetPhase('idle');
    setInsetSourceId(null);
    setToolRef.current('select'); // return to pointer on cancel too
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      ref={wrapRef}
      className="canvas-area canvas-checkerboard"
      style={{ overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onDrop={onDrop}
      onDragOver={e => { e.preventDefault(); setDropHighlight(true); }}
      onDragLeave={() => setDropHighlight(false)}
    >
      {/* Drop overlay */}
      {dropHighlight && (
        <div style={{
          position: 'absolute', inset: 0, border: '2px solid var(--accent)',
          background: 'var(--accent-glow)', pointerEvents: 'none', zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600 }}>Drop image here</span>
        </div>
      )}

      {/* Scalebar hints */}
      {tool === 'scalebar' && scalebarPhase === 'idle' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-overlay)',
          border: `1px solid ${selectedCalibratedImg ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8, padding: '7px 14px', zIndex: 20, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 12, color: selectedCalibratedImg ? 'var(--accent)' : 'var(--text-muted)' }}>
            {selectedCalibratedImg
              ? `Click and drag to draw scale bar — calibrated from ${selectedCalibratedImg.name}`
              : 'Select a calibrated image first, then draw a scale bar'}
          </span>
        </div>
      )}

      {scalebarPhase === 'drawing' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-overlay)', border: '1px solid var(--warning)',
          borderRadius: 8, padding: '7px 14px', zIndex: 20, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 12, color: 'var(--warning)' }}>Release to place scale bar…</span>
        </div>
      )}

      {/* Inset confirmation toolbar */}
      {insetPhase === 'selecting' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-overlay)', border: '1px solid var(--accent)',
          borderRadius: 8, padding: '8px 14px', zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Resize the selection, then confirm to create inset
          </span>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={confirmInset}>
            ✓ Create Inset
          </button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={cancelInset}>
            Cancel
          </button>
        </div>
      )}

      {/* Grid placement hint */}
      {tool === 'grid-place' && pendingGrid && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-overlay)', border: '1px solid var(--accent)',
          borderRadius: 8, padding: '7px 14px', zIndex: 20,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 12, color: 'var(--accent)' }}>
            {pendingGrid.cols} col{pendingGrid.cols !== 1 ? 's' : ''} ×{' '}
            {Math.ceil(pendingGrid.imageIds.length / pendingGrid.cols)} rows
            ({pendingGrid.imageIds.length} image{pendingGrid.imageIds.length !== 1 ? 's' : ''})
            &ensp;—&ensp;click and drag to set grid area
          </span>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => {
            setPendingGrid(null);
            setTool('select');
          }}>Cancel</button>
        </div>
      )}

      {/* Inset click prompt */}
      {tool === 'inset' && insetPhase === 'idle' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-overlay)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '7px 14px', zIndex: 20, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Click on an image to start an inset selection
          </span>
        </div>
      )}

      {/* Fabric canvas — sized exactly to the document boundary */}
      <div style={{
        position: 'relative', flexShrink: 0,
        outline: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      }}>
        <canvas ref={canvasElRef} />

        {/* Smart alignment guides */}
        {guides.map((g, i) => (
          <div key={i} style={{
            position: 'absolute', pointerEvents: 'none', zIndex: 12,
            background: '#e040fb',
            ...(g.type === 'v'
              ? { left: g.pos, top: 0, width: 1, height: '100%' }
              : { top: g.pos, left: 0, height: 1, width: '100%' }),
          }} />
        ))}

        {/* Rulers — sit just outside the canvas edge */}
        {showRulers && (
          <>
            <RulerOverlay orientation="horizontal" size={Math.round(doc.width * zoom)} zoom={zoom} dpi={doc.dpi} docSize={doc.width} rulerUnit={rulerUnit} />
            <RulerOverlay orientation="vertical"   size={Math.round(doc.height * zoom)} zoom={zoom} dpi={doc.dpi} docSize={doc.height} rulerUnit={rulerUnit} />
            {/* Unit toggle button at the ruler corner */}
            <button
              onClick={toggleRulerUnit}
              style={{
                position: 'absolute', top: -18, left: -18,
                width: 18, height: 18, padding: 0,
                background: 'rgba(20,20,28,0.88)', border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.6)', fontSize: 7, lineHeight: 1,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 11,
              }}
              title={`Ruler units: ${rulerUnit} — click to toggle`}
            >
              {rulerUnit}
            </button>
          </>
        )}
      </div>

      {/* Status bar */}
      <div style={{
        position: 'absolute', bottom: 12, right: 12,
        background: 'var(--bg-overlay)', border: '1px solid var(--border)',
        borderRadius: 5, padding: '4px 10px', fontSize: 11, color: 'var(--text-secondary)',
        display: 'flex', gap: 8,
      }}>
        <span>{doc.width} × {doc.height} px</span>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span>{Math.round(zoom * 100)}%</span>
        <span style={{ color: 'var(--border)' }}>|</span>
        <span>{doc.dpi} dpi</span>
      </div>
    </div>
  );
}

// ── Fabric object factory ─────────────────────────────────────────────────

function createFabricObject(
  obj: CanvasObject,
  groups: ReturnType<typeof useStore.getState>['groups'],
  fc: fabric.Canvas,
  map: Map<string, fabric.FabricObject>,
) {
  if (obj.type === 'image') {
    const group = groups.find(g => g.id === obj.groupId);
    const img   = group?.images.find(i => i.id === obj.imageId);
    if (!img) return;

    // Sentinel: reserve map slot before the async load so that if the sync
    // effect fires again (e.g. user adds text while image is loading), the
    // second call sees the sentinel and bails rather than starting a duplicate load.
    const sentinel = {} as fabric.FabricObject;
    map.set(obj.id, sentinel);

    fabric.FabricImage.fromURL(img.dataUrl).then((fImg) => {
      if (map.get(obj.id) !== sentinel) return; // superseded — newer load or deletion
      if (!fc.getElement()) return; // canvas disposed
      // Re-read from store rather than using the closure's obj — the user may
      // have moved/resized this image while fromURL was in flight, and using
      // stale closure coords would snap it back to its original spawn position.
      const live = useStore.getState().doc.objects.find(o => o.id === obj.id) as ImageObject | undefined;
      if (!live) return; // deleted while loading
      const nativeW = fImg.width  || 1;
      const nativeH = fImg.height || 1;
      fImg.set({
        left: live.x, top: live.y, angle: live.rotation, opacity: live.opacity,
        scaleX: live.width  / nativeW,
        scaleY: live.height / nativeH,
      });
      applyBorder(fImg, live.border);
      applyAdjustments(fImg, live.adjustments ?? DEFAULT_ADJUSTMENTS);
      (fImg as typeof fImg & { storeId: string }).storeId = obj.id;
      fc.add(fImg);
      map.set(obj.id, fImg);
      fc.renderAll();
    });
    return;
  }

  if (obj.type === 'text') {
    const o = obj as TextObject;
    if (o.isLatex) {
      type LatexFabricImage = fabric.FabricImage & {
        storeId: string; _isLatexImg: boolean; _latexKey: string;
      };
      // Reserve the map slot with a sentinel so concurrent sync-effect runs
      // don't kick off a second render while this async one is in flight.
      const sentinel = {} as fabric.FabricObject;
      map.set(obj.id, sentinel);

      renderLatexToFabricImage(o.content, o.fontSize, o.color)
        .then(async (cached) => {
          if (map.get(obj.id) !== sentinel) return;
          if (!fc.getElement()) return; // canvas was disposed
          const fImg = await cached.clone() as LatexFabricImage;
          if (!fImg || typeof fImg.render !== 'function') return; // safety check
          const imgW = fImg.width ?? 100;
          const scale = imgW > 0 ? o.width / imgW : 1;
          fImg.set({
            left: o.x, top: o.y, angle: o.rotation,
            scaleX: scale, scaleY: scale,
            selectable: true, evented: true,
          });
          fImg.storeId    = obj.id;
          fImg._isLatexImg = true;
          fImg._latexKey  = `${o.content}||${o.fontSize}||${o.color}`;
          fc.add(fImg);
          map.set(obj.id, fImg);
          fc.renderAll();
        })
        .catch(() => {
          if (map.get(obj.id) !== sentinel) return;
          if (!fc.getElement()) return;
          const stripped = o.content.replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1').replace(/[\\{}]/g, '');
          const tb = new fabric.Textbox(stripped || o.content, {
            left: o.x, top: o.y, width: o.width,
            fontSize: o.fontSize, fill: o.color,
            fontWeight: o.fontWeight, textAlign: o.align, angle: o.rotation,
            fontFamily: 'Inter, system-ui, sans-serif',
          });
          (tb as typeof tb & { storeId: string })  .storeId    = obj.id;
          (tb as typeof tb & { _isLatexImg: boolean })._isLatexImg = false;
          fc.add(tb); map.set(obj.id, tb); fc.renderAll();
        });
      return;
    }
    const tb = new fabric.Textbox(o.content, {
      left: o.x, top: o.y, width: o.width,
      fontSize: o.fontSize, fill: o.color,
      fontWeight: o.fontWeight, textAlign: o.align,
      angle: o.rotation,
      fontFamily: 'Inter, system-ui, sans-serif',
    });
    (tb as typeof tb & { storeId: string }).storeId = obj.id;
    fc.add(tb);
    map.set(obj.id, tb);
    return;
  }

  let fObj: fabric.FabricObject | null = null;

  if (obj.type === 'shape') {
    const o = obj as ShapeObject;
    const fill = o.fillOpacity === 0 ? 'transparent' : o.fill;
    if (o.shape === 'rect') {
      fObj = new fabric.Rect({
        left: o.x, top: o.y, width: o.width, height: o.height,
        fill, angle: o.rotation,
        rx: o.border.radius, ry: o.border.radius,
      });
    } else {
      fObj = new fabric.Ellipse({
        left: o.x, top: o.y, rx: o.width / 2, ry: o.height / 2,
        fill, angle: o.rotation,
      });
    }
    if (fObj) applyBorder(fObj, (obj as ShapeObject).border);
  }

  if (obj.type === 'scalebar') {
    const o = obj as ScaleBarObject;
    // Build scalebar group: line + LaTeX label
    const bar = new fabric.Rect({
      left: 0, top: 0,
      width: o.length, height: o.thickness,
      fill: o.color, stroke: '', strokeWidth: 0,
    });
    // Left cap
    const capL = new fabric.Rect({
      left: 0, top: -4,
      width: o.thickness, height: o.thickness + 8,
      fill: o.color, stroke: '', strokeWidth: 0,
    });
    // Right cap
    const capR = new fabric.Rect({
      left: o.length - o.thickness, top: -4,
      width: o.thickness, height: o.thickness + 8,
      fill: o.color, stroke: '', strokeWidth: 0,
    });

    const labelLatex = `\\text{${o.realLength}\\,${o.unit}}`;
    const grp = new fabric.Group([bar, capL, capR], {
      left: o.x, top: o.y, angle: o.rotation,
      originX: 'left', originY: 'top',
    });

    (grp as typeof grp & { storeId: string }).storeId = obj.id;
    fc.add(grp);
    map.set(obj.id, grp);

    // Render label as LaTeX image, add below bar, and attach ref to group so
    // syncFabricProps can reposition it when the scale bar is moved.
    type GrpWithLabel = typeof grp & { _labelFab?: fabric.FabricImage };
    renderLatexToDataUrl(labelLatex, o.fontSize ?? 13, o.labelColor).then(({ dataUrl, width, height: _lh }) => {
      if (!dataUrl || !fc.getElement()) return;
      if (!fc.getObjects().includes(grp)) return;
      fabric.FabricImage.fromURL(dataUrl).then((lbl) => {
        if (!lbl || typeof lbl.render !== 'function') return;
        if (!fc.getElement()) return;
        const scale = Math.min(1, o.length / width);
        lbl.set({
          left: o.x + o.length / 2,
          top:  o.y + o.thickness + 6,
          originX: 'center',
          originY: 'top',
          angle: o.rotation,
          scaleX: scale,
          scaleY: scale,
          selectable: false,
          evented: false,
        });
        (lbl as typeof lbl & { _scalebarLabel: string })._scalebarLabel = obj.id;
        (grp as GrpWithLabel)._labelFab = lbl;
        fc.add(lbl);
        fc.renderAll();
      });
    });

    fc.renderAll();
    return;
  }

  if (fObj) {
    (fObj as typeof fObj & { storeId: string }).storeId = obj.id;
    fc.add(fObj);
    map.set(obj.id, fObj);
  }
}

function syncFabricProps(
  fObj: fabric.FabricObject & { storeId?: string },
  obj: CanvasObject,
) {
  fObj.set({ left: obj.x, top: obj.y, angle: obj.rotation, visible: obj.visible, selectable: !obj.locked });
  // setCoords() updates cached bounding-box / transform so the next renderAll()
  // uses the new position rather than Fabric's stale cached coords.
  fObj.setCoords();

  if (obj.type === 'image') {
    const o = obj as ImageObject;
    fObj.set({
      scaleX: o.width  / (fObj.width  || o.width),
      scaleY: o.height / (fObj.height || o.height),
      opacity: o.opacity,
    });
    applyBorder(fObj, o.border);
    if (fObj instanceof fabric.FabricImage) {
      applyAdjustments(fObj, o.adjustments ?? DEFAULT_ADJUSTMENTS);
    }
  }

  if (obj.type === 'text') {
    const o = obj as TextObject;
    // For LaTeX images, don't sync text content — re-creation handles it
    if (fObj instanceof fabric.Textbox) {
      let display = o.content;
      if (o.isLatex) display = o.content.replace(/\\text\{([^}]*)\}/g, '$1').replace(/\\\w+\{([^}]*)\}/g, '$1');
      fObj.set({ text: display, fontSize: o.fontSize, fill: o.color, fontWeight: o.fontWeight, textAlign: o.align, width: o.width });
    }
  }

  if (obj.type === 'shape') {
    const o = obj as ShapeObject;
    fObj.set({ fill: o.fillOpacity === 0 ? 'transparent' : o.fill });
    applyBorder(fObj, o.border);
  }

  if (obj.type === 'scalebar') {
    const o = obj as ScaleBarObject;
    type GrpWithLabel = fabric.FabricObject & { _labelFab?: fabric.FabricImage };
    const grp = fObj as GrpWithLabel;
    if (grp._labelFab) {
      grp._labelFab.set({
        left: o.x + o.length / 2,
        top:  o.y + o.thickness + 6,
        angle: o.rotation,
      });
    }
  }
}
