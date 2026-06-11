import React, { useRef, useState, useCallback, useEffect } from 'react';
import { X, Check, Ruler, ZoomIn, ZoomOut, Copy } from 'lucide-react';
import { useStore } from '../store';
import type { ScaleUnit, ThinSectionImage } from '../types';

const UNITS: ScaleUnit[] = ['µm', 'nm', 'mm', 'cm', 'm', 'km', 'Å'];

interface Point { x: number; y: number }

export default function CalibrationModal() {
  const { calibrationQueue, shiftCalibration, updateImageCalibration, groups } = useStore();
  const item = calibrationQueue[0];

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pts, setPts]             = useState<Point[]>([]);
  const [realLength, setRealLength] = useState('');
  const [unit, setUnit]           = useState<ScaleUnit>('µm');
  const [imgEl, setImgEl]         = useState<HTMLImageElement | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);

  // natural-image → canvas-element scale factor (fixed at load time)
  const scaleRef = useRef(1);

  // Reset state when item changes
  useEffect(() => {
    if (!item) return;
    setPts([]);
    setRealLength('');
    setPreviewZoom(1);
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      const cv = canvasRef.current;
      if (!cv) return;
      const MAX = 540;
      const s = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
      scaleRef.current = s;
      cv.width  = Math.round(img.naturalWidth  * s);
      cv.height = Math.round(img.naturalHeight * s);
      const ctx = cv.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0, cv.width, cv.height);
    };
    img.src = item.image.dataUrl;
  }, [item]);

  // Redraw overlay whenever points change
  useEffect(() => {
    const cv  = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!ctx || !cv || !imgEl) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(imgEl, 0, 0, cv.width, cv.height);

    if (pts.length >= 1) {
      ctx.strokeStyle = '#ff3b30';
      ctx.fillStyle   = '#ff3b30';
      ctx.lineWidth   = 2 / previewZoom;
      pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 / previewZoom, 0, Math.PI * 2);
        ctx.fill();
      });
      if (pts.length === 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        const dx  = pts[1].x - pts[0].x;
        const dy  = pts[1].y - pts[0].y;
        const px  = Math.round(Math.sqrt(dx * dx + dy * dy) / scaleRef.current);
        ctx.fillStyle = '#fff';
        ctx.font = `${12 / previewZoom}px sans-serif`;
        ctx.fillText(`${px} px`, (pts[0].x + pts[1].x) / 2 + 6 / previewZoom, (pts[0].y + pts[1].y) / 2 - 6 / previewZoom);
      }
    }
  }, [pts, imgEl, previewZoom]);

  // Scroll-to-zoom on the preview container
  const onContainerWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setPreviewZoom(z => Math.max(0.5, Math.min(8, z + (e.deltaY < 0 ? 0.25 : -0.25))));
  }, []);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (pts.length >= 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // getBoundingClientRect returns the post-CSS-transform visual rect in viewport px.
    // Dividing by previewZoom converts from visual px → canvas logical px.
    const x = (e.clientX - rect.left) / previewZoom;
    const y = (e.clientY - rect.top)  / previewZoom;
    setPts(prev => [...prev, { x, y }]);
  }, [pts.length, previewZoom]);

  const pixelDistance = (() => {
    if (pts.length < 2) return 0;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.sqrt(dx * dx + dy * dy) / scaleRef.current;
  })();

  const canConfirm = pts.length === 2 && parseFloat(realLength) > 0;

  // All calibrated images in the library other than the one being calibrated
  const calibratedImages: (ThinSectionImage & { groupName: string })[] = item
    ? groups.flatMap(g =>
        g.images
          .filter(img => img.calibration && img.id !== item.image.id)
          .map(img => ({ ...img, groupName: g.name }))
      )
    : [];

  const applyCopied = (src: ThinSectionImage) => {
    if (!item || !src.calibration) return;
    updateImageCalibration(item.groupId, item.image.id, { ...src.calibration });
    shiftCalibration();
  };

  const handleConfirm = () => {
    if (!item || !canConfirm) return;
    const real = parseFloat(realLength);
    updateImageCalibration(item.groupId, item.image.id, {
      unitsPerPixel: real / pixelDistance,
      unit,
      refPixelDistance: pixelDistance,
      refRealLength: real,
    });
    shiftCalibration();
  };

  if (!item) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface-2)', borderRadius: 10, padding: 20,
        width: 640, maxWidth: '96vw', display: 'flex', flexDirection: 'column', gap: 14,
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
            <Ruler size={15} />
            Calibrate Scale — {item.image.name}
          </div>
          <button className="btn-icon" onClick={() => shiftCalibration()} title="Skip (no calibration)">
            <X size={14} />
          </button>
        </div>

        {/* Copy from calibrated image shortcut */}
        {calibratedImages.length > 0 && (
          <div style={{
            background: 'var(--surface-3, var(--surface-2))',
            border: '1px solid var(--border)',
            borderRadius: 7,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
              <Copy size={12} />
              Copy calibration from another image
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Images taken at the same magnification share the same scale. Click an image below to apply its calibration directly.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {calibratedImages.map(img => (
                <button
                  key={img.id}
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={() => applyCopied(img)}
                  title={`${img.calibration!.refRealLength} ${img.calibration!.unit} / ${Math.round(img.calibration!.refPixelDistance)} px`}
                >
                  <Ruler size={10} color="#3ecf8e" />
                  {img.groupName} — {img.name}
                  <span style={{ color: 'var(--text-muted)', marginLeft: 2 }}>
                    ({img.calibration!.refRealLength} {img.calibration!.unit})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Or pick two points manually — click over a feature of known length. Scroll to zoom.
          {pts.length === 0 && ' → Click the first point.'}
          {pts.length === 1 && ' → Click the second point.'}
          {pts.length === 2 && ' → Points set. Enter the real-world length below.'}
        </div>

        {/* Zoom controls + image preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn-icon" onClick={() => setPreviewZoom(z => Math.max(0.5, z - 0.5))} title="Zoom out">
              <ZoomOut size={13} />
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 40, textAlign: 'center' }}>
              {Math.round(previewZoom * 100)}%
            </span>
            <button className="btn-icon" onClick={() => setPreviewZoom(z => Math.min(8, z + 0.5))} title="Zoom in">
              <ZoomIn size={13} />
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: '2px 7px', marginLeft: 4 }}
              onClick={() => setPreviewZoom(1)}>
              Reset zoom
            </button>
          </div>

          {/* Scrollable, zoomable canvas container */}
          <div
            ref={containerRef}
            style={{
              overflow: 'auto', maxHeight: '50vh',
              background: '#111', borderRadius: 6,
              cursor: pts.length < 2 ? 'crosshair' : 'default',
            }}
            onWheel={onContainerWheel}
          >
            <canvas
              ref={canvasRef}
              onClick={handleCanvasClick}
              style={{
                display: 'block',
                transform: `scale(${previewZoom})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
        </div>

        {/* Reset points */}
        {pts.length > 0 && (
          <button
            className="btn btn-ghost"
            style={{ alignSelf: 'flex-start', fontSize: 11, padding: '3px 10px' }}
            onClick={() => setPts([])}
          >
            Reset points
          </button>
        )}

        {/* Real length input */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <div className="input-label">Real length</div>
            <input
              className="input"
              type="number"
              min="0"
              placeholder="e.g. 100"
              value={realLength}
              onChange={e => setRealLength(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canConfirm) handleConfirm(); }}
            />
          </div>
          <div style={{ width: 90 }}>
            <div className="input-label">Unit</div>
            <select className="select" value={unit} onChange={e => setUnit(e.target.value as ScaleUnit)}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {pts.length === 2 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 6, whiteSpace: 'nowrap' }}>
              {Math.round(pixelDistance)} px in image
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => shiftCalibration()}>
            Skip
          </button>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12 }}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            <Check size={13} /> Save calibration
          </button>
        </div>
      </div>
    </div>
  );
}
