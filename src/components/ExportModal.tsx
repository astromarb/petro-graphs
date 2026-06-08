import React, { useState, useRef, useEffect } from 'react';
import { X, Download, FileImage, FileText, CheckCircle } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { useStore } from '../store';

interface Props {
  fabricCanvasRef: React.RefObject<import('fabric').Canvas | null>;
  onClose: () => void;
}

type Format = 'png' | 'jpeg' | 'pdf';

const RESOLUTIONS = [
  { label: 'Screen (1×)',   value: 1   as const },
  { label: '2× (HiDPI)',    value: 2   as const },
  { label: '300 DPI',       value: 300 as const },
  { label: '600 DPI',       value: 600 as const },
] as const;

export default function ExportModal({ fabricCanvasRef, onClose }: Props) {
  const { doc } = useStore();
  const [format, setFormat]     = useState<Format>('png');
  const [resOption, setResOption] = useState<1 | 2 | 300 | 600>(300);
  const [quality, setQuality]   = useState(0.95);
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [progress, setProgress] = useState<{ phase: string; pct: number } | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const prevBlobRef = useRef<string>('');

  // Pre-render a small preview thumbnail of document space.
  // Never resize the canvas — zero the pan and use a fractional multiplier instead.
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;
    try {
      const currentZoom = fc.getZoom();
      const savedVT = [...(fc.viewportTransform ?? [1,0,0,1,0,0])] as [number,number,number,number,number,number];
      fc.setViewportTransform([currentZoom, 0, 0, currentZoom, 0, 0]);
      fc.renderAll();
      const multiplier = 0.25 / currentZoom;
      const url = fc.toDataURL({ format: 'png', multiplier });
      fc.setViewportTransform(savedVT);
      fc.renderAll();
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
      setPreviewUrl(url);
    } catch { /* tainted canvas — skip preview */ }
  }, []);

  const doExport = async () => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;
    setBusy(true);
    setError('');
    setExportDone(false);

    // Strategy: never resize the Fabric canvas (resizing clears its pixel buffer,
    // producing a blank white export). Keep the current zoom, zero the pan so the
    // document origin is at (0,0), and compute a multiplier:
    //   output_px = canvas_px × multiplier
    //   multiplier = (resOption/96) / currentZoom
    const currentZoom = fc.getZoom();
    const multiplier = resOption <= 2
      ? resOption / currentZoom
      : (resOption / 96) / currentZoom;

    const savedVT = [...(fc.viewportTransform ?? [1,0,0,1,0,0])] as [number,number,number,number,number,number];

    try {
      setProgress({ phase: 'Preparing canvas…', pct: 15 });
      await new Promise<void>(r => setTimeout(r, 16));

      fc.setViewportTransform([currentZoom, 0, 0, currentZoom, 0, 0]);
      fc.renderAll();

      setProgress({ phase: 'Encoding image…', pct: 55 });
      await new Promise<void>(r => setTimeout(r, 16));

      let dataUrl: string;
      try {
        const fmt = format === 'pdf' ? 'jpeg' : format;
        const q   = format === 'pdf' ? 0.92 : quality;
        dataUrl = fc.toDataURL({ format: fmt, quality: q, multiplier });
      } catch (e) {
        throw new Error(`Canvas export failed: ${(e as Error).message}`);
      }

      setProgress({ phase: 'Saving file…', pct: 85 });
      await new Promise<void>(r => setTimeout(r, 16));

      const outW = Math.round(doc.width  * (resOption <= 2 ? resOption : resOption / 96));
      const outH = Math.round(doc.height * (resOption <= 2 ? resOption : resOption / 96));
      const safeTitle = doc.title.replace(/[^a-z0-9_-]/gi, '_') || 'figure';

      if (format === 'pdf') {
        const landscape = outW > outH;
        const ptW = outW * 72 / (resOption <= 2 ? 96 * resOption : resOption);
        const ptH = outH * 72 / (resOption <= 2 ? 96 * resOption : resOption);
        const pdf = new jsPDF({
          orientation: landscape ? 'landscape' : 'portrait',
          unit: 'pt',
          format: [ptW, ptH],
        });
        pdf.addImage(dataUrl, 'JPEG', 0, 0, ptW, ptH, undefined, 'FAST');
        pdf.save(`${safeTitle}.pdf`);
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${safeTitle}.${format}`;
        a.click();
      }

      setProgress({ phase: 'Export complete!', pct: 100 });
      setExportDone(true);
      setTimeout(() => onClose(), 2000);
    } catch (e) {
      setError((e as Error).message);
      setProgress(null);
    } finally {
      fc.setViewportTransform(savedVT);
      fc.renderAll();
      setBusy(false);
    }
  };

  const outW = Math.round(doc.width  * (resOption <= 2 ? resOption : resOption / 96));
  const outH = Math.round(doc.height * (resOption <= 2 ? resOption : resOption / 96));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface-2)', borderRadius: 10, padding: 20,
        width: 420, maxWidth: '95vw',
        display: 'flex', flexDirection: 'column', gap: 14,
        border: '1px solid var(--border)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14 }}>
          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Download size={14} /> Export Figure
          </span>
          <button className="btn-icon" onClick={onClose} disabled={busy}><X size={14} /></button>
        </div>

        {/* Export complete banner */}
        {exportDone && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(62,207,142,0.12)',
            border: '1px solid rgba(62,207,142,0.35)',
            borderRadius: 6, padding: '10px 12px',
            fontSize: 13, color: '#3ecf8e', fontWeight: 500,
          }}>
            <CheckCircle size={15} /> Export complete!
          </div>
        )}

        {/* Preview thumbnail */}
        {previewUrl && !exportDone && (
          <div style={{ background: '#111', borderRadius: 6, padding: 8, display: 'flex', justifyContent: 'center' }}>
            <img src={previewUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 3 }} />
          </div>
        )}

        {!exportDone && (
          <>
            {/* Format */}
            <div>
              <div className="input-label">Format</div>
              <div className="segmented">
                {([
                  { id: 'png',  label: 'PNG',  icon: <FileImage size={11} /> },
                  { id: 'jpeg', label: 'JPEG', icon: <FileImage size={11} /> },
                  { id: 'pdf',  label: 'PDF',  icon: <FileText  size={11} /> },
                ] as { id: Format; label: string; icon: React.ReactNode }[]).map(f => (
                  <button key={f.id}
                    className={`segmented-btn${format === f.id ? ' active' : ''}`}
                    onClick={() => setFormat(f.id)}
                    style={{ gap: 5 }}>
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution */}
            <div>
              <div className="input-label">Resolution</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {RESOLUTIONS.map(r => (
                  <button key={r.value}
                    className={`btn btn-ghost${resOption === r.value ? ' active' : ''}`}
                    style={{
                      fontSize: 11, padding: '3px 8px',
                      background: resOption === r.value ? 'var(--accent-glow)' : undefined,
                      borderColor: resOption === r.value ? 'var(--accent)' : undefined,
                      color:  resOption === r.value ? 'var(--accent)' : undefined,
                    }}
                    onClick={() => setResOption(r.value)}>
                    {r.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>
                Output: {outW} × {outH} px
                {doc.dpi !== 96 && ` (document DPI: ${doc.dpi}, using ${resOption <= 2 ? `${resOption}× screen` : `${resOption} DPI`})`}
              </div>
            </div>

            {/* Quality (JPEG only) */}
            {format === 'jpeg' && (
              <div>
                <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>JPEG Quality</span>
                  <span style={{ color: 'var(--text-primary)' }}>{Math.round(quality * 100)}%</span>
                </div>
                <input type="range" min={50} max={100} value={Math.round(quality * 100)}
                  onChange={e => setQuality(+e.target.value / 100)} style={{ width: '100%' }} />
              </div>
            )}
          </>
        )}

        {/* Progress bar */}
        {progress && (
          <div>
            <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress.pct}%`,
                background: progress.pct === 100 ? '#3ecf8e' : 'var(--accent)',
                borderRadius: 3,
                transition: 'width 0.3s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              {progress.phase}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ fontSize: 11, color: 'var(--danger)', background: 'rgba(255,60,60,0.08)',
            border: '1px solid rgba(255,60,60,0.3)', borderRadius: 5, padding: '8px 10px', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {/* Actions */}
        {!exportDone && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={doExport} disabled={busy}>
              {busy ? 'Exporting…' : <><Download size={12} /> Export {format.toUpperCase()}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
