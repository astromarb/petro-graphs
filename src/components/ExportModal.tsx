import React, { useState, useRef, useEffect } from 'react';
import { X, Download, FileImage, FileText } from 'lucide-react';
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
  const [format, setFormat]   = useState<Format>('png');
  const [resOption, setResOption] = useState<1 | 2 | 300 | 600>(300);
  const [quality, setQuality] = useState(0.95);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const prevBlobRef = useRef<string>('');

  // Pre-render a small preview thumbnail
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;
    try {
      const { doc: previewDoc } = useStore.getState();
      const previewMult = 0.25;
      const savedPvpt = [...(fc.viewportTransform ?? [1,0,0,1,0,0])] as [number,number,number,number,number,number];
      const savedPw = fc.width; const savedPh = fc.height;
      fc.setViewportTransform([previewMult, 0, 0, previewMult, 0, 0]);
      fc.setDimensions({ width: Math.round(previewDoc.width * previewMult), height: Math.round(previewDoc.height * previewMult) });
      const url = fc.toDataURL({ format: 'png', multiplier: 1 });
      fc.setViewportTransform(savedPvpt);
      fc.setDimensions({ width: savedPw ?? 800, height: savedPh ?? 600 });
      fc.renderAll();
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
      setPreviewUrl(url);
    } catch { /* tainted canvas */ }
  }, []);

  const getMultiplier = (zoom: number): number => {
    if (resOption === 1) return 1 / zoom;
    if (resOption === 2) return 2 / zoom;
    // DPI-based: screen is 96 dpi, target is resOption
    return (resOption / 96) / zoom;
  };

  const doExport = async () => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;
    setBusy(true);
    setError('');
    const outW = Math.round(doc.width  * (resOption <= 2 ? resOption : resOption / 96));
    const outH = Math.round(doc.height * (resOption <= 2 ? resOption : resOption / 96));
    const savedVpt = [...(fc.viewportTransform ?? [1,0,0,1,0,0])] as [number,number,number,number,number,number];
    const savedW   = fc.width  ?? outW;
    const savedH   = fc.height ?? outH;
    try {
      const zoom       = fc.getZoom();
      const multiplier = getMultiplier(zoom);

      // Temporarily set viewport to document-only export mode
      fc.setViewportTransform([multiplier, 0, 0, multiplier, 0, 0]);
      fc.setDimensions({ width: outW, height: outH });

      let dataUrl: string;
      try {
        dataUrl = fc.toDataURL({
          format: format === 'pdf' ? 'png' : format,
          quality,
          multiplier: 1,
        });
      } catch (e) {
        throw new Error(`Canvas export failed (${(e as Error).message}). If you have LaTeX objects, try switching to plain text mode first.`);
      }

      const safeTitle = doc.title.replace(/[^a-z0-9_-]/gi, '_') || 'figure';

      if (format === 'pdf') {
        // Physical page size in PDF points (1 pt = 1/72 inch).
        // Always derived from the document's own DPI so the page is the
        // correct physical size regardless of the chosen export resolution.
        const ptW = doc.width  * 72 / doc.dpi;
        const ptH = doc.height * 72 / doc.dpi;
        const pdf = new jsPDF({
          orientation: ptW > ptH ? 'landscape' : 'portrait',
          unit: 'pt',
          format: [ptW, ptH],
        });
        pdf.addImage(dataUrl, 'PNG', 0, 0, ptW, ptH);
        pdf.save(`${safeTitle}.pdf`);
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${safeTitle}.${format}`;
        a.click();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      // Restore canvas to its normal infinite-canvas state
      fc.setViewportTransform(savedVpt);
      fc.setDimensions({ width: savedW, height: savedH });
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
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </div>

        {/* Preview */}
        {previewUrl && (
          <div style={{ background: '#111', borderRadius: 6, padding: 8, display: 'flex', justifyContent: 'center' }}>
            <img src={previewUrl} alt="preview" style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 3 }} />
          </div>
        )}

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

        {/* Error */}
        {error && (
          <div style={{ fontSize: 11, color: 'var(--danger)', background: 'rgba(255,60,60,0.08)',
            border: '1px solid rgba(255,60,60,0.3)', borderRadius: 5, padding: '8px 10px', lineHeight: 1.5 }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={doExport} disabled={busy}>
            {busy ? 'Exporting…' : <><Download size={12} /> Export {format.toUpperCase()}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
