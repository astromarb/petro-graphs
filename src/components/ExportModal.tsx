import React, { useState, useRef, useEffect } from 'react';
import { X, Download, FileImage, FileText, CheckCircle } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { useStore } from '../store';

interface Props {
  fabricCanvasRef: React.RefObject<import('fabric').Canvas | null>;
  onClose: () => void;
}

type Format = 'png' | 'jpeg' | 'pdf';

const RESOLUTIONS = [
  { label: '300 DPI', value: 300 as const },
  { label: '600 DPI', value: 600 as const },
] as const;

export default function ExportModal({ fabricCanvasRef, onClose }: Props) {
  const { doc } = useStore();
  const [format, setFormat]       = useState<Format>('png');
  const [resOption, setResOption] = useState<300 | 600>(300);
  const [quality, setQuality]     = useState(0.92);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [progress, setProgress]   = useState<{ phase: string; pct: number } | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const prevBlobRef = useRef<string>('');

  // Pre-render a preview thumbnail cropped to the document area only (excludes OVERFLOW_PAD)
  useEffect(() => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const src = (fc as any).lowerCanvasEl as HTMLCanvasElement;
      const vpt = fc.viewportTransform ?? [1, 0, 0, 1, 0, 0];
      // Canvas-pixel position and size of the document area
      const sx = Math.max(0, Math.round(vpt[4]));
      const sy = Math.max(0, Math.round(vpt[5]));
      const sw = Math.round(doc.width  * vpt[0]);
      const sh = Math.round(doc.height * vpt[3]);
      // Clamp to what's actually on the canvas
      const cw = Math.min(sw, src.width  - sx);
      const ch = Math.min(sh, src.height - sy);
      if (cw <= 0 || ch <= 0) return;
      const previewScale = Math.min(1, 300 / Math.max(sw, sh));
      const dst = document.createElement('canvas');
      dst.width  = Math.max(1, Math.round(sw * previewScale));
      dst.height = Math.max(1, Math.round(sh * previewScale));
      dst.getContext('2d')!.drawImage(src, sx, sy, cw, ch, 0, 0, dst.width, dst.height);
      const url = dst.toDataURL('image/png');
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
      setPreviewUrl(url);
    } catch { /* tainted canvas — skip preview */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doExport = async () => {
    const fc = fabricCanvasRef.current;
    if (!fc) return;
    setBusy(true);
    setError('');
    setExportDone(false);

    const dpiScale = resOption / 96;
    const outW = Math.round(doc.width  * dpiScale);
    const outH = Math.round(doc.height * dpiScale);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fc_ = fc as any;
    const savedW      = fc.getWidth();
    const savedH      = fc.getHeight();
    const savedVT     = [...(fc.viewportTransform ?? [1,0,0,1,0,0])] as [number,number,number,number,number,number];
    const savedRetina = fc_.enableRetinaScaling as boolean;

    try {
      setProgress({ phase: 'Preparing canvas…', pct: 10 });
      await new Promise<void>(r => setTimeout(r, 16));

      fc_.enableRetinaScaling = false;
      const exportZoom = outW / doc.width;
      fc.setDimensions({ width: outW, height: outH });
      fc.getObjects().forEach(o => { (o as { dirty?: boolean }).dirty = true; });
      fc.setViewportTransform([exportZoom, 0, 0, exportZoom, 0, 0]);
      fc.renderAll();

      setProgress({ phase: 'Encoding image…', pct: 50 });
      await new Promise<void>(r => setTimeout(r, 16));

      const src = fc_.lowerCanvasEl as HTMLCanvasElement;
      let dataUrl: string;
      if (format === 'pdf') { dataUrl = src.toDataURL('image/png'); }
      else if (format === 'jpeg') { dataUrl = src.toDataURL('image/jpeg', quality); }
      else { dataUrl = src.toDataURL('image/png'); }

      setProgress({ phase: 'Saving file…', pct: 80 });
      await new Promise<void>(r => setTimeout(r, 16));

      const safeTitle = doc.title.replace(/[^a-z0-9_-]/gi, '_') || 'figure';

      if (format === 'pdf') {
        // pdf-lib embeds the PNG without recompression and sets correct page dimensions.
        const pngBase64 = dataUrl.split(',')[1];
        const pngBytes  = Uint8Array.from(atob(pngBase64), c => c.charCodeAt(0));

        const pdfDoc   = await PDFDocument.create();
        const pdfImage = await pdfDoc.embedPng(pngBytes);

        // Page size in points (1 pt = 1/72 inch).  outW pixels at resOption DPI
        // → outW/resOption inches → outW/resOption × 72 points.
        const ptW = (outW / resOption) * 72;
        const ptH = (outH / resOption) * 72;
        const page = pdfDoc.addPage([ptW, ptH]);
        page.drawImage(pdfImage, { x: 0, y: 0, width: ptW, height: ptH });

        const pdfBytes = await pdfDoc.save();
        const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${safeTitle}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const a    = document.createElement('a');
        a.href     = dataUrl;
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
      fc_.enableRetinaScaling = savedRetina;
      fc.setDimensions({ width: savedW, height: savedH });
      fc.setViewportTransform(savedVT);
      fc.getObjects().forEach(o => { (o as { dirty?: boolean }).dirty = true; });
      fc.renderAll();
      setBusy(false);
    }
  };

  const previewDpiScale = resOption / 96;
  const outW = Math.round(doc.width  * previewDpiScale);
  const outH = Math.round(doc.height * previewDpiScale);

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
              <div style={{ display: 'flex', gap: 5 }}>
                {RESOLUTIONS.map(r => (
                  <button key={r.value}
                    className={`btn btn-ghost${resOption === r.value ? ' active' : ''}`}
                    style={{
                      fontSize: 11, padding: '3px 8px',
                      background: resOption === r.value ? 'var(--accent-glow)' : undefined,
                      borderColor: resOption === r.value ? 'var(--accent)' : undefined,
                      color:       resOption === r.value ? 'var(--accent)' : undefined,
                    }}
                    onClick={() => setResOption(r.value)}>
                    {r.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>
                Output: {outW} × {outH} px — {(outW / resOption).toFixed(2)}" × {(outH / resOption).toFixed(2)}"
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
                height: '100%', width: `${progress.pct}%`,
                background: progress.pct === 100 ? '#3ecf8e' : 'var(--accent)',
                borderRadius: 3, transition: 'width 0.3s ease',
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
