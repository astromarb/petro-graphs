import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as fabric from 'fabric';
import { useStore } from '../store';
import type {
  CanvasObject, ImageObject, TextObject, ShapeObject, ScaleBarObject,
  BorderStyle, InsetPair, ThinSectionImage, ImageAdjustments, ScaleUnit,
} from '../types';
import { DEFAULT_ADJUSTMENTS } from '../types';
import { nanoid } from '../utils';
import { renderLatexToDataUrl } from '../latexRenderer';

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
  if ('rx' in fObj) (fObj as fabric.Rect).set({ rx: b.radius, ry: b.radius });
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

const SCALE_UNITS: ScaleUnit[] = ['µm', 'nm', 'mm', 'cm', 'm', 'km', 'Å'];

// ── Scale bar input dialog ────────────────────────────────────────────────

interface ScaleDialogProps {
  pixelLength: number;
  onConfirm: (realLength: number, unit: ScaleUnit, color: string, thickness: number, fontSize: number) => void;
  onCancel: () => void;
}

function ScaleBarDialog({ pixelLength, onConfirm, onCancel }: ScaleDialogProps) {
  const [val,       setVal]       = useState('100');
  const [unit,      setUnit]      = useState<ScaleUnit>('µm');
  const [color,     setColor]     = useState('#ffffff');
  const [thickness, setThickness] = useState(4);
  const [fontSize,  setFontSize]  = useState(13);

  const handleConfirm = () => {
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return;
    onConfirm(n, unit, color, thickness, fontSize);
  };

  return (
    <div style={{
      position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-surface)', border: '1px solid var(--accent)',
      borderRadius: 10, padding: '14px 18px', zIndex: 30,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      minWidth: 320,
    }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
        Scale Bar — {Math.round(pixelLength)} px drawn
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div className="input-label">Real-world length</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              className="input"
              type="number"
              min="0.001"
              step="any"
              value={val}
              onChange={e => setVal(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') onCancel(); }}
              autoFocus
              style={{ flex: 1 }}
            />
            <select
              className="select"
              value={unit}
              onChange={e => setUnit(e.target.value as ScaleUnit)}
              style={{ width: 72 }}
            >
              {SCALE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Thickness</span><span style={{ color: 'var(--text-primary)' }}>{thickness}px</span>
            </div>
            <input type="range" min={1} max={12} value={thickness}
              onChange={e => setThickness(+e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Font size</span><span style={{ color: 'var(--text-primary)' }}>{fontSize}px</span>
            </div>
            <input type="range" min={8} max={32} value={fontSize}
              onChange={e => setFontSize(+e.target.value)} style={{ width: '100%' }} />
          </div>
        </div>

        <div>
          <div className="input-label">Color</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: 28, height: 26, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }} />
            <input className="input" value={color} onChange={e => setColor(e.target.value)} />
            {['#ffffff', '#000000', '#ffcc00', '#00ccff', '#ff6060'].map(c => (
              <div key={c}
                onClick={() => setColor(c)}
                style={{
                  width: 18, height: 18, borderRadius: '50%', background: c, cursor: 'pointer',
                  border: color === c ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.2)',
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={handleConfirm}>Add Scale Bar</button>
      </div>
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
    tool, zoom, setZoom, setPan,
    insets, addInset,
    addImageToGroup,
  } = useStore();

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

  // ── Scalebar draw state ───────────────────────────────────────────────
  const [scalebarPhase, setScalebarPhase] = useState<'idle' | 'drawing' | 'dialog'>('idle');
  const scalebarPreviewRef = useRef<fabric.Line | null>(null);
  const scalebarDrawRef    = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // ── Connector lines: pairId → {line, indicator} ──────────────────────
  const connectorMapRef = useRef<Map<string, { line: fabric.Line; indicator: fabric.Rect }>>(new Map());

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

  // ── Initialize Fabric canvas (once) ──────────────────────────────────
  useEffect(() => {
    if (!canvasElRef.current) return;

    const fc = new fabric.Canvas(canvasElRef.current, {
      selection: true,
      preserveObjectStacking: true,
    });
    fabricRef.current = fc;

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

    // ── mouse:down — start scalebar draw ─────────────────────────────
    fc.on('mouse:down', (options) => {
      if (toolRef.current !== 'scalebar') return;
      if (scalebarPhaseRef.current !== 'idle') return;
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

    // ── mouse:up — place text/shape, finish scalebar, start inset ────
    fc.on('mouse:up', (options) => {
      const currentTool = toolRef.current;

      // Finish scalebar draw
      if (currentTool === 'scalebar' && scalebarPhaseRef.current === 'drawing') {
        // Remove preview line
        if (scalebarPreviewRef.current) {
          fc.remove(scalebarPreviewRef.current);
          scalebarPreviewRef.current = null;
          fc.renderAll();
        }
        const d = scalebarDrawRef.current;
        if (!d) { setScalebarPhase('idle'); return; }
        const dx = d.x2 - d.x1;
        const dy = d.y2 - d.y1;
        const pixLen = Math.sqrt(dx * dx + dy * dy);
        if (pixLen < 10) { setScalebarPhase('idle'); return; }
        setScalebarPhase('dialog');
        return;
      }

      if (!['text', 'shape', 'inset'].includes(currentTool)) return;

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
        state.addObject({
          id: nanoid(), type: 'text',
          content: '\\text{Label}', isLatex: true,
          x: cx, y: cy, width: 200, height: 40, rotation: 0,
          locked: false, visible: true, label: 'Text',
          fontSize: 16, color: '#000000', fontWeight: 'normal', align: 'left',
        });
      }

      if (currentTool === 'shape') {
        state.addObject({
          id: nanoid(), type: 'shape', shape: 'rect',
          x: cx - 60, y: cy - 40, width: 120, height: 80, rotation: 0,
          locked: false, visible: true, label: 'Shape',
          fill: '#aa3bff', fillOpacity: 0,
          border: { color: '#aa3bff', width: 2, style: 'solid', radius: 4 },
        });
      }
    });

    return () => { fc.dispose(); fabricRef.current = null; };
  }, []);

  // ── Scale bar dialog confirm ──────────────────────────────────────────
  const confirmScalebar = useCallback((
    realLength: number, unit: ScaleUnit,
    color: string, thickness: number, fontSize: number,
  ) => {
    const d = scalebarDrawRef.current;
    if (!d) { setScalebarPhase('idle'); return; }
    const dx = d.x2 - d.x1;
    const dy = d.y2 - d.y1;
    const pixLen = Math.round(Math.sqrt(dx * dx + dy * dy));
    const angle  = Math.atan2(dy, dx) * (180 / Math.PI);
    const cx = Math.round(Math.min(d.x1, d.x2));
    const cy = Math.round(Math.min(d.y1, d.y2));

    useStore.getState().addObject({
      id: nanoid(), type: 'scalebar',
      x: cx, y: cy - thickness / 2,
      width: pixLen, height: thickness + 20,
      rotation: angle, locked: false, visible: true,
      label: `${realLength} ${unit}`,
      length: pixLen, realLength, unit,
      color, labelColor: color, thickness, fontSize,
    });
    scalebarDrawRef.current = null;
    setScalebarPhase('idle');
  }, []);

  // ── Canvas size, zoom & background ───────────────────────────────────────
  // Canvas element dimensions = doc size × zoom so the document boundary
  // visually shrinks/grows with zoom rather than staying fixed.
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.setDimensions({ width: Math.round(doc.width * zoom), height: Math.round(doc.height * zoom) });
    fc.setZoom(zoom);
    fc.renderAll();
  }, [zoom, doc.width, doc.height]);

  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.backgroundColor = doc.background;
    fc.renderAll();
  }, [doc.background]);



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
    fc.getObjects().forEach(fObj => {
      if (fObj === cropRectRef.current) return;
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

  // ── Ctrl+wheel zoom ───────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom(zoomRef.current + (e.deltaY > 0 ? -0.1 : 0.1));
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
      const existing = objMapRef.current.get(obj.id) as (fabric.FabricObject & { storeId?: string }) | undefined;
      if (existing) {
        syncFabricProps(existing, obj);
      } else {
        createFabricObject(obj, groups, fc, objMapRef.current);
      }
    });

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

    const defaultW = Math.min(300, freshDoc.width * 0.25);
    const defaultH = defaultW / (img.width / img.height);

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
      showModeTag: true, tagPosition: 'tl', opacity: 1,
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

      {/* Scalebar draw hint */}
      {tool === 'scalebar' && scalebarPhase === 'idle' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-overlay)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '7px 14px', zIndex: 20, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Click and drag to draw the scale bar line
          </span>
        </div>
      )}

      {/* Scalebar drawing feedback */}
      {scalebarPhase === 'drawing' && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-overlay)', border: '1px solid var(--warning)',
          borderRadius: 8, padding: '7px 14px', zIndex: 20, pointerEvents: 'none',
        }}>
          <span style={{ fontSize: 12, color: 'var(--warning)' }}>
            Release to set end point…
          </span>
        </div>
      )}

      {/* Scale bar size dialog */}
      {scalebarPhase === 'dialog' && scalebarDrawRef.current && (
        <ScaleBarDialog
          pixelLength={Math.round(Math.hypot(
            scalebarDrawRef.current.x2 - scalebarDrawRef.current.x1,
            scalebarDrawRef.current.y2 - scalebarDrawRef.current.y1,
          ))}
          onConfirm={confirmScalebar}
          onCancel={() => { scalebarDrawRef.current = null; setScalebarPhase('idle'); }}
        />
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

      {/* Fabric canvas */}
      <div style={{
        position: 'relative', flexShrink: 0,
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 12px 48px rgba(0,0,0,0.7)',
        outline: '1px solid rgba(255,255,255,0.06)',
      }}>
        <canvas ref={canvasElRef} />
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
      // Render LaTeX asynchronously, then place as image
      renderLatexToDataUrl(o.content, o.fontSize, o.color).then(({ dataUrl, width }) => {
        if (!dataUrl) {
          // Fallback to plain textbox on failure
          const tb = new fabric.Textbox(o.content, {
            left: o.x, top: o.y, width: o.width,
            fontSize: o.fontSize, fill: o.color,
            fontWeight: o.fontWeight, textAlign: o.align,
            angle: o.rotation,
            fontFamily: 'Inter, system-ui, sans-serif',
          });
          (tb as typeof tb & { storeId: string }).storeId = obj.id;
          (tb as typeof tb & { _isLatexImg: boolean })._isLatexImg = false;
          fc.add(tb);
          map.set(obj.id, tb);
          fc.renderAll();
          return;
        }
        fabric.FabricImage.fromURL(dataUrl).then((fImg) => {
          fImg.set({
            left: o.x, top: o.y, angle: o.rotation,
            scaleX: o.width / width,
            scaleY: (o.width / width),
          });
          (fImg as typeof fImg & { storeId: string }).storeId = obj.id;
          (fImg as typeof fImg & { _isLatexImg: boolean })._isLatexImg = true;
          fc.add(fImg);
          map.set(obj.id, fImg);
          fc.renderAll();
        });
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

    // Render label as LaTeX image and add below bar
    renderLatexToDataUrl(labelLatex, o.fontSize ?? 13, o.labelColor).then(({ dataUrl, width, height: _lh }) => {
      if (!dataUrl || !fc.getObjects().includes(grp)) return;
      fabric.FabricImage.fromURL(dataUrl).then((lbl) => {
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
}
