import React, { useState, useMemo } from 'react';
import { X, ChevronUp, ChevronDown, Grid3x3, Tag } from 'lucide-react';
import { useStore } from '../store';
import type { CanvasObject, TextObject } from '../types';
import { nanoid } from '../utils';

const LABEL_STYLES = [
  { id: 'upper', label: 'A, B, C…', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  { id: 'lower', label: 'a, b, c…', chars: 'abcdefghijklmnopqrstuvwxyz' },
  { id: 'num',   label: '1, 2, 3…', chars: '123456789' },
] as const;

const LABEL_POSITIONS = [
  { id: 'tl', label: 'Top-left'  },
  { id: 'tr', label: 'Top-right' },
  { id: 'bl', label: 'Bot-left'  },
  { id: 'br', label: 'Bot-right' },
] as const;

interface Props { onClose: () => void }

export default function GridLayoutModal({ onClose }: Props) {
  const { doc, batchUpdateObjects, addObject } = useStore();

  // All image objects in their current z-order
  const allImages = useMemo(
    () => doc.objects.filter(o => o.type === 'image'),
    [doc.objects],
  );

  const [order, setOrder] = useState<string[]>(() => allImages.map(o => o.id));
  const [cols, setCols]       = useState(3);
  const [gap, setGap]         = useState(20);
  const [margin, setMargin]   = useState(40);
  const [addLabels, setAddLabels] = useState(true);
  const [labelStyle, setLabelStyle] = useState<'upper' | 'lower' | 'num'>('upper');
  const [labelPos, setLabelPos]     = useState<'tl' | 'tr' | 'bl' | 'br'>('tl');
  const [labelSize, setLabelSize]   = useState(18);
  const [labelColor, setLabelColor] = useState('#ffffff');

  const orderedImages = order
    .map(id => allImages.find(o => o.id === id))
    .filter(Boolean) as CanvasObject[];

  const move = (idx: number, dir: -1 | 1) => {
    const arr = [...order];
    const to = idx + dir;
    if (to < 0 || to >= arr.length) return;
    [arr[idx], arr[to]] = [arr[to], arr[idx]];
    setOrder(arr);
  };

  const preview = useMemo(() => {
    const rows = Math.ceil(orderedImages.length / cols);
    const cellW = Math.max(...orderedImages.map(o => o.width));
    const cellH = Math.max(...orderedImages.map(o => o.height));
    return { rows, cellW, cellH };
  }, [orderedImages, cols]);

  const totalW = margin * 2 + cols * preview.cellW + (cols - 1) * gap;
  const totalH = margin * 2 + preview.rows * preview.cellH + (preview.rows - 1) * gap;

  const apply = () => {
    const { cellW, cellH } = preview;
    const updates: { id: string; patch: Partial<CanvasObject> }[] = [];

    orderedImages.forEach((obj, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = margin + col * (cellW + gap);
      const y = margin + row * (cellH + gap);
      // Center image within cell (preserve aspect ratio, don't resize)
      const cx = x + (cellW  - obj.width)  / 2;
      const cy = y + (cellH  - obj.height) / 2;
      updates.push({ id: obj.id, patch: { x: Math.round(cx), y: Math.round(cy) } });
    });

    batchUpdateObjects(updates);

    if (addLabels) {
      const chars = LABEL_STYLES.find(s => s.id === labelStyle)!.chars;
      orderedImages.forEach((obj, idx) => {
        const lbl = chars[idx] ?? String(idx + 1);
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cellX = margin + col * (cellW + gap);
        const cellY = margin + row * (cellH + gap);
        const cx = updates[idx].patch.x!;
        const cy = updates[idx].patch.y!;
        const pad = 6;
        let lx: number, ly: number;
        if (labelPos === 'tl') { lx = cx + pad; ly = cy + pad; }
        else if (labelPos === 'tr') { lx = cx + obj.width  - labelSize - pad; ly = cy + pad; }
        else if (labelPos === 'bl') { lx = cx + pad; ly = cy + obj.height - labelSize - pad; }
        else { lx = cx + obj.width - labelSize - pad; ly = cy + obj.height - labelSize - pad; }
        void cellX; void cellY;
        const textObj: TextObject = {
          id: nanoid(), type: 'text',
          content: lbl,
          isLatex: false,
          x: Math.round(lx), y: Math.round(ly),
          width: labelSize * 2, height: labelSize + 4,
          rotation: 0, locked: false, visible: true,
          label: `Label ${lbl}`,
          fontSize: labelSize, color: labelColor,
          fontWeight: 'bold', align: 'left',
        };
        addObject(textObj);
      });
    }

    onClose();
  };

  if (allImages.length === 0) {
    return (
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <header style={headerStyle}>
            <span style={{ fontWeight: 600 }}>Grid Layout</span>
            <button className="btn-icon" onClick={onClose}><X size={14} /></button>
          </header>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>
            No image objects on canvas yet. Drop images from the library first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={{ ...panelStyle, width: 540 }}>
        <header style={headerStyle}>
          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Grid3x3 size={14} /> Grid Layout
          </span>
          <button className="btn-icon" onClick={onClose}><X size={14} /></button>
        </header>

        <div style={{ display: 'flex', gap: 16 }}>
          {/* Left: ordered image list */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="input-label" style={{ marginBottom: 2 }}>Panel order ({orderedImages.length} images)</div>
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              {orderedImages.map((obj, idx) => (
                <div key={obj.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 5, padding: '4px 6px',
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--accent)',
                    minWidth: 18, textAlign: 'center',
                  }}>
                    {LABEL_STYLES.find(s => s.id === labelStyle)!.chars[idx] ?? idx + 1}
                  </span>
                  <img src={(doc.objects.find(o => o.id === obj.id) as any)?.width ? undefined : undefined}
                    alt=""
                    style={{ width: 36, height: 27, objectFit: 'cover', borderRadius: 3, background: '#111', flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {obj.label}
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <button className="btn-icon" style={{ padding: 1 }} onClick={() => move(idx, -1)} disabled={idx === 0}><ChevronUp size={10} /></button>
                    <button className="btn-icon" style={{ padding: 1 }} onClick={() => move(idx, 1)}  disabled={idx === orderedImages.length - 1}><ChevronDown size={10} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: options */}
          <div style={{ width: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Columns</span><span style={{ color: 'var(--text-primary)' }}>{cols}</span>
              </div>
              <input type="range" min={1} max={6} value={cols}
                onChange={e => setCols(+e.target.value)} style={{ width: '100%' }} />
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ flex: 1 }}>
                <div className="input-label">Gap (px)</div>
                <input className="input" type="number" value={gap} onChange={e => setGap(+e.target.value || 0)} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="input-label">Margin (px)</div>
                <input className="input" type="number" value={margin} onChange={e => setMargin(+e.target.value || 0)} />
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '4px 6px', background: 'var(--surface)', borderRadius: 4, border: '1px solid var(--border)' }}>
              Grid: {preview.rows} × {cols} · {totalW} × {totalH} px total
            </div>

            {/* Panel labels */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 8 }}>
                <input type="checkbox" checked={addLabels} onChange={e => setAddLabels(e.target.checked)} />
                <Tag size={11} />
                <span style={{ fontSize: 12, fontWeight: 500 }}>Add panel labels</span>
              </label>

              {addLabels && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div>
                    <div className="input-label">Style</div>
                    <select className="select" value={labelStyle}
                      onChange={e => setLabelStyle(e.target.value as typeof labelStyle)}>
                      {LABEL_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div className="input-label">Position</div>
                    <select className="select" value={labelPos}
                      onChange={e => setLabelPos(e.target.value as typeof labelPos)}>
                      {LABEL_POSITIONS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ flex: 1 }}>
                      <div className="input-label">Size</div>
                      <input className="input" type="number" min={8} max={60} value={labelSize}
                        onChange={e => setLabelSize(+e.target.value || 18)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="input-label">Color</div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input type="color" value={labelColor} onChange={e => setLabelColor(e.target.value)}
                          style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }} />
                        <input className="input" value={labelColor} onChange={e => setLabelColor(e.target.value)}
                          style={{ fontSize: 10 }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={apply}>
            <Grid3x3 size={12} /> Apply layout
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9000,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const panelStyle: React.CSSProperties = {
  background: 'var(--surface-2)', borderRadius: 10, padding: 20,
  maxWidth: '95vw', display: 'flex', flexDirection: 'column', gap: 14,
  border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  fontSize: 14,
};
