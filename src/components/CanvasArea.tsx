import React, { useEffect, useRef, useCallback, useState } from 'react';
import * as fabric from 'fabric';
import { useStore } from '../store';
import type { CanvasObject, ImageObject, TextObject, ShapeObject, ScaleBarObject, BorderStyle } from '../types';
import { nanoid } from '../utils';

function borderToDash(style: BorderStyle['style'], width: number): number[] | undefined {
  if (style === 'dashed') return [width * 4, width * 2];
  if (style === 'dotted') return [width, width * 2];
  return undefined;
}

function applyBorderToFabric(fObj: fabric.FabricObject, border: BorderStyle) {
  fObj.set({
    stroke: border.style === 'none' ? '' : border.color,
    strokeWidth: border.style === 'none' ? 0 : border.width,
    strokeDashArray: borderToDash(border.style, border.width) ?? [],
  });
  if ('rx' in fObj) (fObj as fabric.Rect).set({ rx: border.radius, ry: border.radius });
}

export default function CanvasArea() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const {
    doc, groups, addObject, updateObject, setSelectedId,
    tool, zoom, setZoom, setPan,
  } = useStore();

  const objMapRef = useRef<Map<string, fabric.FabricObject>>(new Map());
  const isPanningRef = useRef(false);
  const lastPanPosRef = useRef({ x: 0, y: 0 });
  const [dropHighlight, setDropHighlight] = useState(false);

  // ── Initialize fabric canvas ─────────────────────────────────────────
  useEffect(() => {
    if (!canvasElRef.current) return;

    const fc = new fabric.Canvas(canvasElRef.current, {
      selection: true,
      preserveObjectStacking: true,
    });
    fabricRef.current = fc;

    fc.on('selection:created', () => {
      const sel = fc.getActiveObject() as fabric.FabricObject & { storeId?: string };
      if (sel?.storeId) setSelectedId(sel.storeId);
    });
    fc.on('selection:updated', () => {
      const sel = fc.getActiveObject() as fabric.FabricObject & { storeId?: string };
      if (sel?.storeId) setSelectedId(sel.storeId);
    });
    fc.on('selection:cleared', () => setSelectedId(null));

    fc.on('object:modified', (e) => {
      const obj = e.target as fabric.FabricObject & { storeId?: string };
      if (!obj?.storeId) return;
      updateObject(obj.storeId, {
        x: obj.left ?? 0,
        y: obj.top ?? 0,
        width: (obj.width ?? 0) * (obj.scaleX ?? 1),
        height: (obj.height ?? 0) * (obj.scaleY ?? 1),
        rotation: obj.angle ?? 0,
      });
    });

    return () => { fc.dispose(); fabricRef.current = null; };
  }, []);

  // ── Sync canvas size & background ────────────────────────────────────
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.setDimensions({ width: doc.width, height: doc.height });
    fc.backgroundColor = doc.background;
    fc.renderAll();
  }, [doc.width, doc.height, doc.background]);

  // ── Sync zoom ────────────────────────────────────────────────────────
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    fc.setZoom(zoom);
    fc.renderAll();
  }, [zoom]);

  // ── Tool cursor & selection mode ─────────────────────────────────────
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;
    if (tool === 'pan') {
      fc.defaultCursor = 'grab';
      fc.selection = false;
    } else {
      fc.defaultCursor = 'default';
      fc.selection = tool === 'select';
    }
    fc.getObjects().forEach(o => { o.selectable = tool === 'select'; });
    fc.renderAll();
  }, [tool]);

  // ── Pan mouse events ─────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (tool !== 'pan') return;
      isPanningRef.current = true;
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      el.style.cursor = 'grabbing';
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current) return;
      const fc = fabricRef.current;
      if (!fc) return;
      const dx = e.clientX - lastPanPosRef.current.x;
      const dy = e.clientY - lastPanPosRef.current.y;
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      fc.relativePan(new fabric.Point(dx, dy));
      const t = fc.viewportTransform;
      setPan(-t[4], -t[5]);
    };
    const onMouseUp = () => {
      isPanningRef.current = false;
      el.style.cursor = tool === 'pan' ? 'grab' : 'default';
    };

    el.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [tool]);

  // ── Wheel zoom ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(zoom + delta);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoom]);

  // ── Render store objects onto fabric canvas ──────────────────────────
  useEffect(() => {
    const fc = fabricRef.current;
    if (!fc) return;

    const storeIds = new Set(doc.objects.map(o => o.id));

    // Remove deleted objects
    const toRemove: fabric.FabricObject[] = [];
    fc.getObjects().forEach(fObj => {
      const id = (fObj as fabric.FabricObject & { storeId?: string }).storeId;
      if (id && !storeIds.has(id)) toRemove.push(fObj);
    });
    toRemove.forEach(o => { fc.remove(o); objMapRef.current.delete((o as fabric.FabricObject & { storeId?: string }).storeId!); });

    // Add or update
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

  // ── Drop from sidebar ────────────────────────────────────────────────
  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropHighlight(false);
    const raw = e.dataTransfer.getData('application/petro-image');
    if (!raw) return;
    const { imageId, groupId } = JSON.parse(raw) as { imageId: string; groupId: string };

    const group = groups.find(g => g.id === groupId);
    const img = group?.images.find(i => i.id === imageId);
    if (!img) return;

    const fc = fabricRef.current;
    const wrapRect = wrapRef.current?.getBoundingClientRect();
    if (!fc || !wrapRect) return;

    const vpt = fc.viewportTransform;
    const cx = (e.clientX - wrapRect.left - vpt[4]) / zoom;
    const cy = (e.clientY - wrapRect.top - vpt[5]) / zoom;

    const aspect = img.width / img.height;
    const defaultW = Math.min(300, doc.width * 0.25);
    const defaultH = defaultW / aspect;

    const newObj: ImageObject = {
      id: nanoid(),
      type: 'image',
      imageId: img.id,
      groupId,
      mode: img.mode,
      x: Math.round(cx - defaultW / 2),
      y: Math.round(cy - defaultH / 2),
      width: Math.round(defaultW),
      height: Math.round(defaultH),
      rotation: 0,
      locked: false,
      visible: true,
      label: img.name,
      border: { color: '#ffffff', width: 2, style: 'solid', radius: 0 },
      showModeTag: true,
      tagPosition: 'tl',
      opacity: 1,
    };
    addObject(newObj);
  }, [groups, doc.width, zoom, addObject]);

  // ── Click-to-place text / shape / scalebar ───────────────────────────
  const onAreaClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const fc = fabricRef.current;
    if (!fc || tool === 'select' || tool === 'pan') return;

    const hit = fc.findTarget(e.nativeEvent as unknown as fabric.TPointerEvent);
    if (hit) return;

    const wrapRect = wrapRef.current?.getBoundingClientRect();
    if (!wrapRect) return;
    const vpt = fc.viewportTransform;
    const cx = (e.clientX - wrapRect.left - vpt[4]) / zoom;
    const cy = (e.clientY - wrapRect.top - vpt[5]) / zoom;

    if (tool === 'text') {
      addObject({
        id: nanoid(), type: 'text',
        content: '\\text{Label}', isLatex: true,
        x: Math.round(cx), y: Math.round(cy),
        width: 200, height: 40, rotation: 0,
        locked: false, visible: true, label: 'Text',
        fontSize: 16, color: '#000000', fontWeight: 'normal', align: 'left',
      });
    }

    if (tool === 'shape') {
      addObject({
        id: nanoid(), type: 'shape', shape: 'rect',
        x: Math.round(cx - 60), y: Math.round(cy - 40),
        width: 120, height: 80, rotation: 0,
        locked: false, visible: true, label: 'Shape',
        fill: 'transparent', fillOpacity: 0,
        border: { color: '#aa3bff', width: 2, style: 'solid', radius: 4 },
      });
    }

    if (tool === 'scalebar') {
      addObject({
        id: nanoid(), type: 'scalebar',
        x: Math.round(cx - 50), y: Math.round(cy),
        width: 100, height: 20, rotation: 0,
        locked: false, visible: true, label: 'Scale Bar',
        length: 100, realLength: 100,
        color: '#ffffff', labelColor: '#ffffff', thickness: 4,
      });
    }
  }, [tool, zoom, addObject]);

  return (
    <div
      ref={wrapRef}
      className="canvas-area canvas-checkerboard"
      style={{ overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onDrop={onDrop}
      onDragOver={e => { e.preventDefault(); setDropHighlight(true); }}
      onDragLeave={() => setDropHighlight(false)}
      onClick={onAreaClick}
    >
      {dropHighlight && (
        <div style={{
          position: 'absolute', inset: 0, border: '2px solid var(--accent)',
          background: 'var(--accent-glow)', pointerEvents: 'none', zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600 }}>Drop image here</span>
        </div>
      )}

      <div style={{ position: 'relative', boxShadow: '0 8px 40px rgba(0,0,0,0.6)', flexShrink: 0 }}>
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

// ── Fabric object factory ────────────────────────────────────────────────
function createFabricObject(
  obj: CanvasObject,
  groups: ReturnType<typeof useStore.getState>['groups'],
  fc: fabric.Canvas,
  map: Map<string, fabric.FabricObject>
) {
  if (obj.type === 'image') {
    const group = groups.find(g => g.id === obj.groupId);
    const img = group?.images.find(i => i.id === obj.imageId);
    if (!img) return;

    fabric.FabricImage.fromURL(img.dataUrl).then((fImg) => {
      fImg.set({ left: obj.x, top: obj.y, angle: obj.rotation, opacity: obj.opacity });
      fImg.scaleToWidth(obj.width);
      applyBorderToFabric(fImg, (obj as ImageObject).border);
      (fImg as fabric.FabricImage & { storeId: string }).storeId = obj.id;
      fc.add(fImg);
      map.set(obj.id, fImg);
      fc.renderAll();
    });
    return;
  }

  let fObj: fabric.FabricObject | null = null;

  if (obj.type === 'text') {
    const o = obj as TextObject;
    let displayText = o.content;
    if (o.isLatex) displayText = o.content.replace(/\\text\{([^}]*)\}/g, '$1');
    fObj = new fabric.Textbox(displayText, {
      left: o.x, top: o.y, width: o.width,
      fontSize: o.fontSize, fill: o.color,
      fontWeight: o.fontWeight, textAlign: o.align,
      angle: o.rotation,
      fontFamily: 'Inter, system-ui, sans-serif',
    });
  }

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
    if (fObj) applyBorderToFabric(fObj, o.border);
  }

  if (obj.type === 'scalebar') {
    const o = obj as ScaleBarObject;
    const bar = new fabric.Rect({ left: 0, top: 0, width: o.length, height: o.thickness, fill: o.color });
    const label = new fabric.FabricText(`${o.realLength} µm`, {
      left: o.length / 2, top: o.thickness + 4,
      fontSize: 12, fill: o.labelColor,
      originX: 'center',
      fontFamily: 'Inter, system-ui, sans-serif',
    });
    fObj = new fabric.Group([bar, label], { left: o.x, top: o.y, angle: o.rotation });
  }

  if (fObj) {
    (fObj as fabric.FabricObject & { storeId: string }).storeId = obj.id;
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
    const scaleX = o.width / (fObj.width || o.width);
    const scaleY = o.height / (fObj.height || o.height);
    fObj.set({ scaleX, scaleY, opacity: o.opacity });
    applyBorderToFabric(fObj, o.border);
  }

  if (obj.type === 'text' && fObj instanceof fabric.Textbox) {
    const o = obj as TextObject;
    let displayText = o.content;
    if (o.isLatex) displayText = o.content.replace(/\\text\{([^}]*)\}/g, '$1');
    fObj.set({ text: displayText, fontSize: o.fontSize, fill: o.color, fontWeight: o.fontWeight, textAlign: o.align, width: o.width });
  }

  if (obj.type === 'shape') {
    const o = obj as ShapeObject;
    fObj.set({ fill: o.fillOpacity === 0 ? 'transparent' : o.fill });
    applyBorderToFabric(fObj, o.border);
  }
}
