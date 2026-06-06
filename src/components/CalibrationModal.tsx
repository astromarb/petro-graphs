import React, { useRef, useState, useCallback, useEffect } from 'react';
import { X, Check, Ruler } from 'lucide-react';
import { useStore } from '../store';
import type { ScaleUnit } from '../types';

const UNITS: ScaleUnit[] = ['µm', 'nm', 'mm', 'cm', 'm', 'km', 'Å'];

interface Point { x: number; y: number }

export default function CalibrationModal() {
  const { calibrationQueue, shiftCalibration, updateImageCalibration } = useStore();
  const item = calibrationQueue[0];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pts, setPts] = useState<Point[]>([]);
  const [realLength, setRealLength] = useState('');
  const [unit, setUnit] = useState<ScaleUnit>('µm');
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);

  // natural→canvas scale factor
  const scaleRef = useRef(1);

  // Load image into canvas when item changes
  useEffect(() => {
    if (!item) return;
    setPts([]);
    setRealLength('');
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      const cv = canvasRef.current;
      if (!cv) return;
      const MAX = 560;
      const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
      scaleRef.current = scale;
      cv.width  = Math.round(img.naturalWidth  * scale);
      cv.height = Math.round(img.naturalHeight * scale);
      const ctx = cv.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0, cv.width, cv.height);
    };
    img.src = item.image.dataUrl;
  }, [item]);

  // Redraw whenever points change
  useEffect(() => {
    const cv = canvasRef.current;
    const ctx = cv?.getContext('2d');
    if (!ctx || !cv || !imgEl) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(imgEl, 0, 0, cv.width, cv.height);

    if (pts.length >= 1) {
      ctx.strokeStyle = '#ff3b30';
      ctx.fillStyle   = '#ff3b30';
      ctx.lineWidth   = 2;
      pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
      if (pts.length === 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const px = Math.round(Math.sqrt(dx * dx + dy * dy) / scaleRef.current);
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.fillText(`${px} px`, (pts[0].x + pts[1].x) / 2 + 6, (pts[0].y + pts[1].y) / 2 - 6);
      }
    }
  }, [pts, imgEl]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (pts.length >= 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPts(prev => [...prev, { x, y }]);
  }, [pts.length]);

  const pixelDistance = (() => {
    if (pts.length < 2) return 0;
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    return Math.sqrt(dx * dx + dy * dy) / scaleRef.current;
  })();

  const canConfirm = pts.length === 2 && parseFloat(realLength) > 0;

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

  const handleSkip = () => shiftCalibration();

  if (!item) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface-2)', borderRadius: 10, padding: 20,
        width: 620, maxWidth: '95vw', display: 'flex', flexDirection: 'column', gap: 14,
        border: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
            <Ruler size={15} />
            Calibrate Scale — {item.image.name}
          </div>
          <button className="btn-icon" onClick={handleSkip} title="Skip (no calibration)">
            <X size={14} />
          </button>
        </div>

        {/* Instructions */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Click two points on a feature of known length, then enter the real-world measurement below.
          {pts.length === 0 && ' Click the first point.'}
          {pts.length === 1 && ' Click the second point.'}
          {pts.length === 2 && ' Points set. Enter the real length.'}
        </div>

        {/* Image canvas */}
        <div style={{ position: 'relative', overflow: 'auto', maxHeight: '55vh',
          background: '#111', borderRadius: 6, cursor: pts.length < 2 ? 'crosshair' : 'default' }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            style={{ display: 'block', maxWidth: '100%' }}
          />
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
              {Math.round(pixelDistance)} px drawn
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={handleSkip}>
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
