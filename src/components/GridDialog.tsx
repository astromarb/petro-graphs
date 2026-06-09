import React, { useState, useEffect, useMemo } from 'react';
import { X, LayoutGrid } from 'lucide-react';
import { useStore } from '../store';

interface Props { onClose: () => void }

export default function GridDialog({ onClose }: Props) {
  const groups       = useStore(s => s.groups);
  const setTool      = useStore(s => s.setTool);
  const setPendingGrid = useStore(s => s.setPendingGrid);

  const [groupId,  setGroupId]  = useState(groups[0]?.id ?? '');
  const [cols,     setCols]     = useState(2);
  const [gap,      setGap]      = useState(16);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const group = useMemo(() => groups.find(g => g.id === groupId), [groups, groupId]);

  useEffect(() => {
    if (!group) return;
    setSelected(new Set(group.images.map(i => i.id)));
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

  const effectiveCols = Math.min(cols, orderedImgs.length);
  const rows = orderedImgs.length > 0 ? Math.ceil(orderedImgs.length / Math.max(1, effectiveCols)) : 0;

  const handlePlace = () => {
    if (orderedImgs.length === 0 || !group) return;
    setPendingGrid({
      imageIds: orderedImgs.map(i => i.id),
      groupId: group.id,
      cols: effectiveCols,
      gap,
    });
    setTool('grid-place');
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
        width: 420,
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
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 4 }}
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
              <select value={groupId} onChange={e => setGroupId(e.target.value)} style={inputStyle}>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.images.length} images)</option>
                ))}
              </select>
            )}
          </div>

          {/* Image selection */}
          {group && group.images.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={labelStyle}>Images to place</span>
                <button onClick={() => setSelected(new Set(group.images.map(i => i.id)))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 11 }}>All</button>
                <button onClick={() => setSelected(new Set())}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 11 }}>None</button>
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
                    <input type="checkbox" checked={selected.has(img.id)} onChange={() => toggleImg(img.id)} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {img.name}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{img.mode}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Grid dimensions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Columns</label>
              <input type="number" min={1} max={8} value={cols}
                onChange={e => setCols(Math.max(1, Math.min(8, +e.target.value)))}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Gap (px)</label>
              <input type="number" min={0} max={200} value={gap}
                onChange={e => setGap(Math.max(0, +e.target.value))}
                style={inputStyle} />
            </div>
          </div>

          {/* Summary */}
          {orderedImgs.length > 0 && (
            <div style={{
              background: 'var(--bg-raised)', borderRadius: 6, padding: '8px 12px',
              fontSize: 11, color: 'var(--text-secondary)',
            }}>
              {orderedImgs.length} image{orderedImgs.length !== 1 ? 's' : ''} →{' '}
              {effectiveCols} col{effectiveCols !== 1 ? 's' : ''} × {rows} row{rows !== 1 ? 's' : ''}
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                · draw an area on the canvas to set size and position
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 18px', borderTop: '1px solid var(--border)',
        }}>
          <button onClick={onClose} style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '6px 14px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 12,
          }}>Cancel</button>
          <button
            disabled={orderedImgs.length === 0}
            onClick={handlePlace}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: orderedImgs.length > 0 ? 'var(--accent)' : 'var(--bg-raised)',
              border: 'none', borderRadius: 6,
              padding: '6px 16px',
              cursor: orderedImgs.length > 0 ? 'pointer' : 'default',
              color: orderedImgs.length > 0 ? '#fff' : 'var(--text-muted)',
              fontSize: 12, fontWeight: 600,
            }}
          >
            <LayoutGrid size={13} />
            Set placement area…
          </button>
        </div>
      </div>
    </div>
  );
}
