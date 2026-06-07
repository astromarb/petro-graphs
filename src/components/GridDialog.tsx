import React, { useState, useEffect, useMemo } from 'react';
import { X, LayoutGrid } from 'lucide-react';
import { useStore } from '../store';
import { nanoid } from '../utils';
import type { ImageObject, CanvasObject } from '../types';
import { DEFAULT_ADJUSTMENTS } from '../types';

interface Props { onClose: () => void }

export default function GridDialog({ onClose }: Props) {
  const groups     = useStore(s => s.groups);
  const doc        = useStore(s => s.doc);
  const addObjects = useStore(s => s.addObjects);

  const [groupId,  setGroupId]  = useState(groups[0]?.id ?? '');
  const [cols,     setCols]     = useState(2);
  const [cellW,    setCellW]    = useState(400);
  const [cellH,    setCellH]    = useState(300);
  const [gap,      setGap]      = useState(20);
  const [startX,   setStartX]   = useState(40);
  const [startY,   setStartY]   = useState(40);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const group = useMemo(() => groups.find(g => g.id === groupId), [groups, groupId]);

  useEffect(() => {
    if (!group) return;
    setSelected(new Set(group.images.map(i => i.id)));
    if (group.images.length > 0) {
      const img = group.images[0];
      const maxW = Math.floor((doc.width - 40) / Math.max(1, cols));
      const w = Math.min(maxW, img.width, 600);
      const h = Math.round(w * (img.height / img.width));
      setCellW(w);
      setCellH(h);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const toggleImg = (id: string) =>
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const orderedImgs = useMemo(
    () => (group?.images ?? []).filter(i => selected.has(i.id)),
    [group, selected],
  );
  const rows   = Math.ceil(orderedImgs.length / Math.max(1, cols));
  const totalW = cols * cellW + (cols - 1) * gap;
  const totalH = rows * cellH + (rows - 1) * gap;
  const overflows = startX + totalW > doc.width || startY + totalH > doc.height;

  const handlePlace = () => {
    if (orderedImgs.length === 0 || !group) return;
    const objs: CanvasObject[] = orderedImgs.map((img, idx): ImageObject => ({
      id: nanoid(),
      type: 'image',
      imageId: img.id,
      groupId: group.id,
      mode: img.mode,
      x: startX + (idx % cols) * (cellW + gap),
      y: startY + Math.floor(idx / cols) * (cellH + gap),
      width:  cellW,
      height: cellH,
      rotation: 0,
      locked: false,
      visible: true,
      label: img.name,
      border: { color: '#ffffff', width: 2, style: 'solid', radius: 0 },
      opacity: 1,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
    }));
    addObjects(objs);
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-raised)', border: '1px solid var(--border)',
    borderRadius: 5, padding: '5px 8px', color: 'var(--text-primary)',
    fontSize: 12, width: '100%', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div style={{
        background: 'var(--bg-surface)',
        borderRadius: 10,
        border: '1px solid var(--border)',
        width: 500,
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
            <LayoutGrid size={15} /> Place as Grid
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 4, borderRadius: 4,
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '18px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Group selector */}
          <div>
            <label style={labelStyle}>Image group</label>
            {groups.length === 0 ? (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                No groups — upload images in the library first
              </span>
            ) : (
              <select
                value={groupId}
                onChange={e => setGroupId(e.target.value)}
                style={inputStyle}
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.images.length} images)
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Image selection checkboxes */}
          {group && group.images.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={labelStyle}>Images to place</span>
                <button
                  onClick={() => setSelected(new Set(group.images.map(i => i.id)))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 11 }}
                >All</button>
                <button
                  onClick={() => setSelected(new Set())}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11 }}
                >None</button>
              </div>
              <div style={{
                maxHeight: 130, overflowY: 'auto',
                border: '1px solid var(--border)', borderRadius: 6, padding: '4px 0',
              }}>
                {group.images.map(img => (
                  <label key={img.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 10px', cursor: 'pointer', fontSize: 12,
                  }}>
                    <input
                      type="checkbox"
                      checked={selected.has(img.id)}
                      onChange={() => toggleImg(img.id)}
                    />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {img.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{img.mode}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Grid params */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {([
              ['Columns', cols,   v => setCols(Math.max(1, Math.min(8, v))),   1,  8],
              ['Gap (px)', gap,   v => setGap(Math.max(0, v)),                 0,  200],
              ['Cell width (px)', cellW, v => setCellW(Math.max(50, v)),       50, 2000],
              ['Cell height (px)', cellH, v => setCellH(Math.max(50, v)),      50, 2000],
              ['Start X (px)', startX, v => setStartX(Math.max(0, v)),         0,  doc.width],
              ['Start Y (px)', startY, v => setStartY(Math.max(0, v)),         0,  doc.height],
            ] as [string, number, (v: number) => void, number, number][]).map(([lbl, val, fn, min, max]) => (
              <div key={lbl}>
                <label style={labelStyle}>{lbl}</label>
                <input
                  type="number" min={min} max={max} value={val}
                  onChange={e => fn(+e.target.value)}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          {/* Summary */}
          {orderedImgs.length > 0 && (
            <div style={{
              background: 'var(--bg-raised)', borderRadius: 6, padding: '8px 12px',
              fontSize: 11, color: 'var(--text-secondary)',
            }}>
              {orderedImgs.length} images → {cols} col{cols !== 1 ? 's' : ''} × {rows} row{rows !== 1 ? 's' : ''}
              &ensp;·&ensp;grid {totalW} × {totalH} px
              {overflows && (
                <span style={{ color: '#f59e0b', marginLeft: 8 }}>⚠ Extends beyond canvas</span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 18px', borderTop: '1px solid var(--border)',
        }}>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '6px 14px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12,
            }}
          >Cancel</button>
          <button
            disabled={orderedImgs.length === 0}
            onClick={handlePlace}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: orderedImgs.length > 0 ? 'var(--accent)' : 'var(--bg-raised)',
              border: 'none', borderRadius: 6,
              padding: '6px 16px', cursor: orderedImgs.length > 0 ? 'pointer' : 'default',
              color: orderedImgs.length > 0 ? '#fff' : 'var(--text-muted)', fontSize: 12, fontWeight: 600,
            }}
          >
            <LayoutGrid size={13} />
            Place {orderedImgs.length} image{orderedImgs.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
