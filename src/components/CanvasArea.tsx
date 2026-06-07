import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, Copy, Trash2, Lock, Unlock, Eye, EyeOff } from 'lucide-react';
import * as fabric from 'fabric';
import { useStore } from '../store';
import type {
  CanvasObject, ImageObject, TextObject, ShapeObject, ScaleBarObject,
  BorderStyle, InsetPair, ThinSectionImage, ImageAdjustments, ScaleUnit, CanvasDoc,
} from '../types';
import { DEFAULT_ADJUSTMENTS } from '../types';
import { nanoid, niceScaleBar, UNIT_METERS, ptToPx } from '../utils';
import { renderLatexToFabricImage } from '../latexRenderer';
import { sharedFabricRef } from '../fabricRef';

// Tracks in-flight LaTeX renders: objId → key currently being rendered.
// Prevents duplicate Fabric images when the user types faster than rendering.
const latexInFlight = new Map<string, string>();
// Prevents selection:cleared from closing the sidebar during LaTeX Fabric object recreation
let suppressSelectionClear = false;
// Current tool — written by the component, read by the module-level createFabricObject.
// Needed because createFabricObject is module-scoped and cannot access component refs.
let _activeTool = 'select';

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
  orientation, size, zoom, dpi, docSize, offsetX = 0, offsetY = 0,
}: {
  orientation: 'horizontal' | 'vertical';
  size: number;
  zoom: number;
  dpi: number;
  docSize: number;
  offsetX?: number;
  offsetY?: number;
}) {
  const isH = orientation === 'horizontal';
  const RULER_SIZE = 18;

  // Figure out a nice tick spacing in document pixels
  const pxPerInch = dpi * zoom;
  const candidates = [10, 25, 50, 100, 200, 250, 500, 1000];
  const minSpacingPx = 40; // minimum pixel gap between labels
  const tickDocPx = candidates.find(c => c * zoom >= minSpacingPx) ?? 1000;

  const ticks: { pos: number; label: string }[] = [];
  for (let docPx = 0; docPx <= docSize; docPx += tickDocPx) {
    const pos = docPx * zoom;
    const label = dpi >= 72 ? `${Math.round(docPx / (dpi / 72))}` : `${docPx}`;
    void label;
    ticks.push({ pos, label: `${docPx}` });
  }

  void pxPerInch;

  const containerStyle: React.CSSProperties = isH
    ? { position: 'absolute', top: offsetY - RULER_SIZE, left: offsetX, width: size, height: RULER_SIZE, pointerEvents: 'none', zIndex: 10 }
    : { position: 'absolute', top: offsetY, left: offsetX - RULER_SIZE, width: RULER_SIZE, height: size, pointerEvents: 'none', zIndex: 10 };

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


// ── Component ─────────────────────────────────────────────────────────────

export default function CanvasArea() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef   = useRef<fabric.Canvas | null>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);

  const {
    doc, groups, addObject, setSelectedId,
    tool, setTool, zoom, setZoom, setPan,
    insets, addInset,
    addImageToGroup,
    selectedId, showRulers,
    bringToFront, sendToBack, bringForward, sendBackward,
    duplicateObject, removeObject, updateObject,
  } = useStore();

  // ── Context menu state ────────────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; objId: string | null } | null>(null);

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

  // ── Panning ───────────────────────────────────────────────────────────
  const isPanning = useRef(false);
  const lastPan   = useRef({ x: 0, y: 0 });

  // ── Drop highlight ────────────────────────────────────────────────────
  const [dropHighlight, setDropHighlight] = useState(false);

  // ── Inset state ───────────────────────────────────────────────────────
  const [insetPhase, setInsetPhase]       = useState<'idle' | 'selecting'>('idle');
  const [insetSourceId, setInsetSourceId] = useState<string | null>(null);
  const cropRectRef = useRef<fabric.Rect | null>(null);

  // (scale bar is click-to-place — no draw-phase state needed)

  // ── Connector lines: pairId → {line, indicator} ──────────────────────
  const connectorMapRef = useRef<Map<string, { line: fabric.Line; indicator: fabric.Rect }>>(new Map());

  // ── Refs to latest values (used in stable fabric event handlers) ──────
  const toolRef = useRef(tool);
  useEffect(() => { toolRef.current = tool; _activeTool = tool; }, [tool]);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const addObjectRef = useRef(addObject);
  useEffect(() => { addObjectRef.current = addObject; }, [addObject]);
  const setSelectedIdRef = useRef(setSelectedId);
  useEffect(() => { setSelectedIdRef.current = setSelectedId; }, [setSelectedId]);
  const setCtxMenuRef = useRef(setCtxMenu);
  useEffect(() => { setCtxMenuRef.current = setCtxMenu; }, [setCtxMenu]);

  const insetPhaseRef    = useRef(insetPhase);
  const insetSourceIdRef = useRef(insetSourceId);
  useEffect(() => { insetPhaseRef.current = insetPhase; }, [insetPhase]);
  useEffect(() => { insetSourceIdRef.current = insetSourceId; }, [insetSourceId]);


  // temp-pan: tool overridden by spacebar hold
  const prevToolRef = useRef<typeof tool | null>(null);

  // Guard: prevent double-placement from mousedown+mouseup both firing
  const justPlacedRef = useRef(false);

  // Document background rect (not a store object — always at z-index 0)
  const docBgRef    = useRef<fabric.Rect | null>(null);
  // Tracks where the top-left of the document sits in screen space (for rulers)
  const [docOffset, setDocOffset] = useState({ x: 0, y: 0 });
  // True after initial viewport centering has been done
  const viewportInitRef = useRef(false);

  // Keep setTool in a ref so fabric event handlers can call it
  const setToolRef = useRef(setTool);
  useEffect(() => { setToolRef.current = setTool; }, [setTool]);

  // ── Initialize Fabric canvas (once) ──────────────────────────────────
  useEffect(() => {
    if (!canvasElRef.current) return;

    const wrap = wrapRef.current!;
    const fc = new fabric.Canvas(canvasElRef.current, {
      selection: true,
      preserveObjectStacking: true,
      width: wrap.clientWidth || 800,
      height: wrap.clientHeight || 600,
    });
    fabricRef.current = fc;
    sharedFabricRef.current = fc;
    // Resize canvas when wrapper resizes
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      fc.setDimensions({ width: Math.round(width), height: Math.round(height) });
      fc.renderAll();
    });
    ro.observe(wrap);
    // Document background rect — always behind store objects
    const docBg = new fabric.Rect({
      left: 0, top: 0,
      width: useStore.getState().doc.width,
      height: useStore.getState().doc.height,
      fill: useStore.getState().doc.background,
      selectable: false, evented: false, hoverCursor: 'default', strokeWidth: 0,
    });
    (docBg as fabric.Rect & { isDocBackground: boolean }).isDocBackground = true;
    fc.add(docBg);
    docBgRef.current = docBg;
    viewportInitRef.current = false;

    fc.on('selection:created', () => {
      const sel = fc.getActiveObject() as fabric.FabricObject & { storeId?: string };
      if (sel?.storeId) setSelectedIdRef.current(sel.storeId);
    });
    fc.on('selection:updated', () => {
      const sel = fc.getActiveObject() as fabric.FabricObject & { storeId?: string };
      if (sel?.storeId) setSelectedIdRef.current(sel.storeId);
    });
    fc.on('selection:cleared', () => { if (!suppressSelectionClear) setSelectedIdRef.current(null); });

    fc.on('object:modified', (e) => {
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

    // Right-click context menu — use Fabric's own event to avoid stopPropagation issue
    fc.on('contextmenu', (options) => {
      const nativeEvent = options.e as MouseEvent;
      nativeEvent.preventDefault();
      const pt = getScenePt(fc, options);
      if (!pt) return;
      const sd = useStore.getState();
      const hit = [...sd.doc.objects].reverse().find(o =>
        o.visible !== false &&
        pt.x >= o.x && pt.x <= o.x + o.width &&
        pt.y >= o.y && pt.y <= o.y + o.height,
      );
      setCtxMenuRef.current({ x: nativeEvent.clientX, y: nativeEvent.clientY, objId: hit?.id ?? null });
    });

    // ── mouse:up — place text/shape/scalebar, start inset ────────────
    fc.on('mouse:up', (options) => {
      const currentTool = toolRef.current;

      // Scale bar: click-to-place (no drag — always horizontal)
      if (currentTool === 'scalebar') {
        const { selectedId, doc: sd, groups: sg } = useStore.getState();
        const pt = getScenePt(fc, options);
        if (!pt) return;

        // Prefer the currently-selected image; fall back to a hit-test at the click point.
        let imgObj = sd.objects.find(o => o.id === selectedId && o.type === 'image') as ImageObject | undefined;
        if (!imgObj) {
          imgObj = sd.objects.find(o =>
            o.type === 'image' &&
            pt.x >= o.x && pt.x <= o.x + o.width &&
            pt.y >= o.y && pt.y <= o.y + o.height,
          ) as ImageObject | undefined;
        }

        const srcGrp = sg.find(gr => gr.id === imgObj?.groupId);
        const srcImg = srcGrp?.images.find(i => i.id === imgObj?.imageId);
        const cal    = srcImg?.calibration;
        if (!imgObj || !srcImg || !cal) return;
        const { realLength, unit, canvasPx } = niceScaleBar(srcImg.width, imgObj.width, cal);
        const canvasUnitsPerPx  = cal.unitsPerPixel * (srcImg.width / imgObj.width);
        const metersPerCanvasPx = canvasUnitsPerPx * (UNIT_METERS[cal.unit] ?? 1e-6);
        const { doc: placeDock } = useStore.getState();
        useStore.getState().addObject({
          id: nanoid(), type: 'scalebar',
          x: Math.round(pt.x - canvasPx / 2),
          y: Math.round(pt.y),
          width: canvasPx, height: 36,
          rotation: 0, locked: false, visible: true,
          label: `${realLength} ${unit}`,
          length: canvasPx, realLength, unit,
          color: '#ffffff', labelColor: '#ffffff', thickness: 4,
          fontSize: ptToPx(8, placeDock.dpi),
          metersPerCanvasPx,
        });
        setToolRef.current('select');
        return;
      }

      if (!['text', 'shape', 'inset'].includes(currentTool)) return;

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
          fontSize: ptToPx(12, state.doc.dpi), color: '#000000', fontWeight: 'normal', align: 'left',
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

    return () => { ro.disconnect(); fc.dispose(); fabricRef.current = null; sharedFabricRef.current = null; };
  }, []);


  // ── Auto-fit zoom when doc dimensions change ──────────────────────────
  const prevDocSizeRef = useRef({ w: doc.width, h: doc.height });
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

  // ── Canvas size, zoom & background ───────────────────────────────────────
  // Zoom effect: update viewport transform (canvas element size is managed by ResizeObserver)
  useEffect(() => {
    const fc = fabricRef.current;
    const wrap = wrapRef.current;
    if (!fc || !wrap) return;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    const vpt = fc.viewportTransform ?? [1, 0, 0, 1, 0, 0];
    if (!viewportInitRef.current) {
      // First run: center the document
      viewportInitRef.current = true;
      const { width: dw, height: dh } = useStore.getState().doc;
      const tx = (cw - dw * zoom) / 2;
      const ty = (ch - dh * zoom) / 2;
      fc.setViewportTransform([zoom, 0, 0, zoom, tx, ty]);
      setDocOffset({ x: tx, y: ty });
    } else if (Math.abs(vpt[0] - zoom) > 0.001) {
      // Zoom change: scale about canvas center, preserve pan
      const ratio = zoom / vpt[0];
      const tx = cw / 2 + (vpt[4] - cw / 2) * ratio;
      const ty = ch / 2 + (vpt[5] - ch / 2) * ratio;
      fc.setViewportTransform([zoom, 0, 0, zoom, tx, ty]);
      setDocOffset({ x: tx, y: ty });
    }
    fc.renderAll();
  }, [zoom]);

  useEffect(() => {
    if (docBgRef.current) {
      docBgRef.current.set({ fill: doc.background });
      fabricRef.current?.renderAll();
    }
  }, [doc.background]);

  useEffect(() => {
    if (docBgRef.current) {
      docBgRef.current.set({ width: doc.width, height: doc.height });
      fabricRef.current?.renderAll();
    }
  }, [doc.width, doc.height]);



  // ── Tool mode (cursor, selection) ─────────────────────────────────────
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    if (tool === 'pan') {
      fc.defaultCursor = 'grab';
      fc.selection = false;
    } else if (['text', 'shape', 'scalebar', 'inset'].includes(tool)) {
      fc.defaultCursor = 'crosshair';
      fc.selection = false;
    } else {
      fc.defaultCursor = 'default';
      fc.selection = true;
    }
    const isSelect = tool === 'select';
    fc.skipTargetFind = !isSelect; // pan/draw tools must not drag objects
    fc.getObjects().forEach(fObj => {
      if (fObj === cropRectRef.current) return;
      fObj.selectable = isSelect;
      fObj.evented    = isSelect;
    });
    if (tool === 'pan') fc.discardActiveObject();
    fc.renderAll();
  }, [tool]);

  // ── Pan with mouse ────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onDown = (e: MouseEvent) => {
      const isMiddle  = e.button === 1;          // scroll-wheel click
      const isPanTool = toolRef.current === 'pan';
      if (!isMiddle && !isPanTool) return;
      if (isMiddle) {
        e.preventDefault(); // prevent autoscroll cursor
        const fc = fabricRef.current;
        if (fc) fc.skipTargetFind = true;
      }
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
      setDocOffset({ x: t[4], y: t[5] });
    };
    const onUp = (e: MouseEvent) => {
      if (!isPanning.current) return;
      isPanning.current = false;
      // If we were middle-mouse panning, restore skipTargetFind to match current tool
      if (e.button === 1) {
        const fc = fabricRef.current;
        if (fc) fc.skipTargetFind = toolRef.current !== 'select';
      }
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
      if (fc) { fc.defaultCursor = 'grab'; fc.selection = false; fc.skipTargetFind = true; }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (prevToolRef.current === null) return;
      const restore = prevToolRef.current;
      prevToolRef.current = null;
      toolRef.current = restore;
      const fc = fabricRef.current;
      if (!fc) return;
      if      (restore === 'pan')   { fc.defaultCursor = 'grab'; fc.selection = false; fc.skipTargetFind = true; }
      else if (['text','shape','scalebar','inset'].includes(restore))
                                    { fc.defaultCursor = 'crosshair'; fc.selection = false; fc.skipTargetFind = true; }
      else                          { fc.defaultCursor = 'default'; fc.selection = true; fc.skipTargetFind = false; }
      const wasSelect = restore === 'select';
      fc.getObjects().forEach(o => {
        if (o === cropRectRef.current) return;
        (o as fabric.FabricObject).selectable = wasSelect;
        (o as fabric.FabricObject).evented    = wasSelect;
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
      const fc = fabricRef.current;
      if (!fc) return;
      const delta = e.ctrlKey || e.metaKey ? 0.05 : 0.1;
      const newZoom = Math.max(0.05, Math.min(4, zoomRef.current + (e.deltaY > 0 ? -delta : delta)));
      // Zoom about the mouse cursor for natural scroll-to-zoom
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const vpt = fc.viewportTransform ?? [1, 0, 0, 1, 0, 0];
      const ratio = newZoom / vpt[0];
      fc.setViewportTransform([newZoom, 0, 0, newZoom, mx + (vpt[4] - mx) * ratio, my + (vpt[5] - my) * ratio]);
      fc.renderAll();
      setZoom(newZoom);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Sync store objects → Fabric canvas ───────────────────────────────
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;

    const storeIds = new Set(doc.objects.map(o => o.id));

    const toRemove: fabric.FabricObject[] = [];
    fc.getObjects().forEach(fObj => {
      const id = (fObj as fabric.FabricObject & { storeId?: string }).storeId;
      if (id && !storeIds.has(id)) toRemove.push(fObj);
    });
    toRemove.forEach(o => {
      fc.remove(o);
      objMapRef.current.delete((o as fabric.FabricObject & { storeId?: string }).storeId!);
    });

    doc.objects.forEach(obj => {
      type ExtFabricObj = fabric.FabricObject & { storeId?: string; _latexKey?: string; _sbKey?: string };
      const existing = objMapRef.current.get(obj.id) as ExtFabricObj | undefined;
      if (existing) {
        // LaTeX text: recreate when content/color/fontSize changes
        if (obj.type === 'text' && (obj as TextObject).isLatex) {
          const o = obj as TextObject;
          const newKey = `${o.content}||${o.fontSize}||${o.color}`;
          if (existing._latexKey !== newKey) {
            // Only kick off a new render if not already rendering this exact key
            if (latexInFlight.get(obj.id) !== newKey) {
              suppressSelectionClear = true;
              fc.remove(existing);
              suppressSelectionClear = false;
              objMapRef.current.delete(obj.id);
              createFabricObject(obj, groups, fc, objMapRef.current);
            }
            return; // either waiting for in-flight or just started — don't syncFabricProps
          }
        }
        // Scale bar: recreate when visual properties change
        if (obj.type === 'scalebar') {
          const o = obj as ScaleBarObject;
          const newKey = `${o.length}|${o.color}|${o.labelColor}|${o.realLength}|${o.unit}|${o.thickness}|${o.fontSize ?? 13}`;
          if (existing._sbKey !== newKey) {
            fc.remove(existing);
            objMapRef.current.delete(obj.id);
            createFabricObject(obj, groups, fc, objMapRef.current);
            return;
          }
        }
        syncFabricProps(existing, obj);
      } else {
        // For LaTeX, createFabricObject itself guards against duplicate in-flight renders
        createFabricObject(obj, groups, fc, objMapRef.current);
      }
    });

    // Enforce Fabric z-order to match store order (index 0 = back, last = front)
    doc.objects.forEach((obj, idx) => {
      const fObj = objMapRef.current.get(obj.id);
      if (fObj) (fc as fabric.Canvas & { moveObjectTo(obj: fabric.FabricObject, index: number): void }).moveObjectTo(fObj, idx);
    });
    // Document background rect always stays below store objects
    if (docBgRef.current) fc.sendObjectToBack(docBgRef.current);

    fc.renderAll();
  }, [doc.objects, groups]);

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

    const fc       = fabricRef.current;
    const wrapRect = wrapRef.current?.getBoundingClientRect();
    if (!fc || !wrapRect) return;

    const vpt = fc.viewportTransform;
    const cx  = (e.clientX - wrapRect.left - vpt[4]) / zoomRef.current;
    const cy  = (e.clientY - wrapRect.top  - vpt[5]) / zoomRef.current;

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
      opacity: 1,
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

    const crLeft = cropRect.left ?? 0;
    const crTop  = cropRect.top  ?? 0;
    const crW    = (cropRect.width  ?? 100) * (cropRect.scaleX ?? 1);
    const crH    = (cropRect.height ?? 100) * (cropRect.scaleY ?? 1);

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
      opacity: 1,
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
        width: canvasPx, height: 36,
        rotation: 0, locked: false, visible: true,
        label: `${realLength} ${unit}`,
        length: canvasPx, realLength, unit,
        color: '#ffffff', labelColor: '#ffffff', thickness: 4,
        fontSize: ptToPx(8, useStore.getState().doc.dpi),
        metersPerCanvasPx,
      };
      addObject(sb);
    }

    fc.remove(cropRect);
    cropRectRef.current = null;
    setInsetPhase('idle');
    setInsetSourceId(null);
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
  }, []);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div
      ref={wrapRef}
      className="canvas-area canvas-checkerboard"
      style={{ overflow: 'hidden', position: 'relative' }}
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

      {/* Scale bar hint */}
      {tool === 'scalebar' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-overlay)',
          border: `1px solid ${selectedCalibratedImg ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8, padding: '7px 14px', zIndex: 20, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 12, color: selectedCalibratedImg ? 'var(--accent)' : 'var(--text-muted)' }}>
            {selectedCalibratedImg
              ? `Click to place scale bar — calibrated from ${selectedCalibratedImg.name}`
              : 'Select a calibrated image first, then click to place a scale bar'}
          </span>
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

      {/* Fabric canvas — fills wrapper; document is centered via viewport transform */}
      <canvas ref={canvasElRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />

      {/* Rulers — positioned at document boundary using docOffset */}
      {showRulers && (
        <>
          <RulerOverlay orientation="horizontal" size={Math.round(doc.width * zoom)} zoom={zoom} dpi={doc.dpi} docSize={doc.width} offsetX={docOffset.x} offsetY={docOffset.y} />
          <RulerOverlay orientation="vertical"   size={Math.round(doc.height * zoom)} zoom={zoom} dpi={doc.dpi} docSize={doc.height} offsetX={docOffset.x} offsetY={docOffset.y} />
        </>
      )}

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

      {/* Right-click context menu */}
      {ctxMenu && createPortal(
        <CanvasContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          objId={ctxMenu.objId}
          doc={doc}
          onClose={() => setCtxMenu(null)}
          bringToFront={bringToFront}
          sendToBack={sendToBack}
          bringForward={bringForward}
          sendBackward={sendBackward}
          duplicateObject={duplicateObject}
          removeObject={removeObject}
          updateObject={updateObject}
        />,
        document.body,
      )}
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

    fabric.FabricImage.fromURL(img.dataUrl).then((fImg) => {
      const o = obj as ImageObject;
      fImg.set({ left: o.x, top: o.y, angle: o.rotation, opacity: o.opacity });
      fImg.scaleToWidth(o.width);
      applyBorder(fImg, o.border);
      applyAdjustments(fImg, o.adjustments ?? DEFAULT_ADJUSTMENTS);
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
      // Load SVG blob directly into FabricImage — avoids the canvas.toDataURL()
      // taint issue that makes the intermediate-canvas path silently produce blank output.
      type LatexFabricImage = fabric.FabricImage & {
        storeId: string; _isLatexImg: boolean; _latexKey: string;
      };
      const renderKey = `${o.content}||${o.fontSize}||${o.color}`;
      // Guard: skip if an identical render is already in-flight
      if (latexInFlight.get(obj.id) === renderKey) return;
      latexInFlight.set(obj.id, renderKey);

      renderLatexToFabricImage(o.content, o.fontSize, o.color)
        .then(async (cached) => {
          // Check if the store content changed while we were rendering
          const storeState = useStore.getState();
          const storeObj   = storeState.doc.objects.find(s => s.id === obj.id) as TextObject | undefined;
          const currentKey = storeObj
            ? `${storeObj.content}||${storeObj.fontSize}||${storeObj.color}`
            : null;

          if (currentKey !== renderKey) {
            // Content changed — restart with the latest content if the object still exists
            latexInFlight.delete(obj.id);
            if (storeObj?.isLatex) {
              createFabricObject(storeObj, storeState.groups, fc, map);
            }
            return;
          }

          latexInFlight.delete(obj.id);
          // Remove any stale duplicate that another race might have placed
          const dup = map.get(obj.id);
          if (dup) fc.remove(dup);

          const fImg = await cached.clone() as LatexFabricImage;
          const imgW = fImg.width ?? 100;
          const scale = imgW > 0 ? o.width / imgW : 1;
          const isSelectNow = _activeTool === 'select';
          fImg.set({
            left: o.x, top: o.y, angle: o.rotation,
            scaleX: scale, scaleY: scale,
            selectable: isSelectNow, evented: isSelectNow,
          });
          fImg.storeId    = obj.id;
          fImg._isLatexImg = true;
          fImg._latexKey  = renderKey;
          map.set(obj.id, fImg); // set before add to prevent re-entry race
          fc.add(fImg);
          fc.renderAll();
          // Restore selection if this object was selected when re-render started
          if (useStore.getState().selectedId === obj.id) {
            fc.setActiveObject(fImg);
            fc.renderAll();
          }
        })
        .catch(() => {
          // Fallback: plain textbox showing stripped content
          latexInFlight.delete(obj.id);
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
    const capH = Math.round(o.thickness * 4.5); // taller caps for clear start/end markers
    const capOff = Math.round((capH - o.thickness) / 2);

    const bar = new fabric.Rect({
      left: 0, top: capOff,
      width: o.length, height: o.thickness,
      fill: o.color, stroke: '', strokeWidth: 0,
    });
    const capL = new fabric.Rect({
      left: 0, top: 0,
      width: Math.max(1, o.thickness), height: capH,
      fill: o.color, stroke: '', strokeWidth: 0,
    });
    const capR = new fabric.Rect({
      left: o.length - Math.max(1, o.thickness), top: 0,
      width: Math.max(1, o.thickness), height: capH,
      fill: o.color, stroke: '', strokeWidth: 0,
    });
    const label = new fabric.Text(`${o.realLength} ${o.unit}`, {
      left: o.length / 2, top: capH + 4,
      fontSize: o.fontSize ?? 13,
      fill: o.labelColor,
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 'bold',
      originX: 'center', originY: 'top',
      selectable: false, evented: false,
    });

    const grp = new fabric.Group([bar, capL, capR, label], {
      left: o.x, top: o.y, angle: o.rotation,
      originX: 'left', originY: 'top',
    });

    type SbGroup = fabric.Group & { storeId: string; _sbKey: string };
    const sbKey = `${o.length}|${o.color}|${o.labelColor}|${o.realLength}|${o.unit}|${o.thickness}|${o.fontSize ?? 13}`;
    (grp as SbGroup).storeId = obj.id;
    (grp as SbGroup)._sbKey  = sbKey;
    fc.add(grp);
    map.set(obj.id, grp);
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
  fObj.setCoords();
}

// ── Canvas context menu ───────────────────────────────────────────────────

interface CtxMenuProps {
  x: number; y: number;
  objId: string | null;
  doc: CanvasDoc;
  onClose: () => void;
  bringToFront:  (id: string) => void;
  sendToBack:    (id: string) => void;
  bringForward:  (id: string) => void;
  sendBackward:  (id: string) => void;
  duplicateObject: (id: string) => void;
  removeObject:    (id: string) => void;
  updateObject:    (id: string, patch: Partial<CanvasObject>) => void;
}

function CanvasContextMenu({
  x, y, objId, doc, onClose,
  bringToFront, sendToBack, bringForward, sendBackward,
  duplicateObject, removeObject, updateObject,
}: CtxMenuProps) {
  const obj  = objId ? doc.objects.find(o => o.id === objId) : null;
  const idx  = objId ? doc.objects.findIndex(o => o.id === objId) : -1;
  const atTop    = idx === doc.objects.length - 1;
  const atBottom = idx === 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const safeX = Math.min(x, window.innerWidth  - 192);
  const safeY = Math.min(y, window.innerHeight - (obj ? 264 : 56));

  const run = (fn: () => void) => { fn(); onClose(); };

  const item = (
    label: string,
    icon: React.ReactNode,
    action: () => void,
    danger = false,
    disabled = false,
  ) => (
    <button
      key={label}
      disabled={disabled}
      onClick={disabled ? undefined : () => run(action)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        width: '100%', padding: '6px 14px',
        background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'var(--text-muted)' : danger ? 'var(--danger)' : 'var(--text-primary)',
        fontSize: 12, textAlign: 'left', opacity: disabled ? 0.45 : 1,
        borderRadius: 0,
      }}
      onMouseEnter={e => { if (!disabled) (e.currentTarget as HTMLButtonElement).style.background = danger ? 'rgba(224,92,92,0.12)' : 'rgba(255,255,255,0.07)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
    >
      {icon}{label}
    </button>
  );

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
        onClick={onClose}
        onContextMenu={e => { e.preventDefault(); onClose(); }}
      />
      <div style={{
        position: 'fixed', left: safeX, top: safeY, zIndex: 99999,
        background: 'var(--surface-2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '4px 0', minWidth: 180,
        boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
      }}>
        {obj ? (
          <>
            {item('Bring to Front', <ChevronsUp  size={12}/>, () => bringToFront(objId!), false, atTop)}
            {item('Bring Forward',  <ChevronUp   size={12}/>, () => bringForward(objId!), false, atTop)}
            {item('Send Backward',  <ChevronDown size={12}/>, () => sendBackward(objId!), false, atBottom)}
            {item('Send to Back',   <ChevronsDown size={12}/>, () => sendToBack(objId!), false, atBottom)}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            {item('Duplicate', <Copy    size={12}/>, () => duplicateObject(objId!))}
            {item('Delete',    <Trash2  size={12}/>, () => removeObject(objId!), true)}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            {item(
              obj.locked ? 'Unlock' : 'Lock',
              obj.locked ? <Unlock size={12}/> : <Lock size={12}/>,
              () => updateObject(objId!, { locked: !obj.locked }),
            )}
            {item(
              obj.visible ? 'Hide' : 'Show',
              obj.visible ? <EyeOff size={12}/> : <Eye size={12}/>,
              () => updateObject(objId!, { visible: !obj.visible }),
            )}
          </>
        ) : (
          <div style={{ padding: '6px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
            Right-click on an object
          </div>
        )}
      </div>
    </>
  );
}
