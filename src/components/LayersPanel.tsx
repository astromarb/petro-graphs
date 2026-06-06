import React, { useState } from 'react';
import { X, Eye, EyeOff, Lock, Unlock, Image, Type, Square, Ruler, GripVertical, Crop } from 'lucide-react';
import { useStore } from '../store';
import type { CanvasObject } from '../types';

const TYPE_ICON: Record<CanvasObject['type'], React.ReactNode> = {
  image:    <Image    size={11} />,
  text:     <Type     size={11} />,
  shape:    <Square   size={11} />,
  scalebar: <Ruler    size={11} />,
};

const TYPE_COLOR: Record<CanvasObject['type'], string> = {
  image:    'var(--rock-teal)',
  text:     'var(--rock-amber)',
  shape:    'var(--accent)',
  scalebar: 'var(--text-muted)',
};

function LayerRow({
  obj,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  obj: CanvasObject;
  isDragOver: boolean;
  onDragStart: (id: string) => void;
  onDragOver:  (id: string) => void;
  onDrop:      (id: string) => void;
  onDragEnd:   () => void;
}) {
  const { updateObject, setSelectedId, selectedId } = useStore();
  const isSelected = selectedId === obj.id;

  return (
    <div
      draggable
      onDragStart={e => { e.stopPropagation(); onDragStart(obj.id); }}
      onDragOver={e => { e.preventDefault(); onDragOver(obj.id); }}
      onDrop={e => { e.preventDefault(); onDrop(obj.id); }}
      onDragEnd={onDragEnd}
      onClick={() => setSelectedId(isSelected ? null : obj.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 10px',
        background: isSelected ? 'var(--accent-glow)' : isDragOver ? 'var(--bg-overlay)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent)' : isDragOver ? '2px solid var(--text-muted)' : '2px solid transparent',
        borderTop: isDragOver ? '1px solid var(--accent)' : '1px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.1s',
        userSelect: 'none',
      }}
    >
      <span style={{ color: 'var(--text-muted)', cursor: 'grab', flexShrink: 0 }}>
        <GripVertical size={11} />
      </span>
      <span style={{ color: isSelected ? TYPE_COLOR[obj.type] : 'var(--text-muted)', flexShrink: 0 }}>
        {TYPE_ICON[obj.type]}
      </span>
      <span style={{
        flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: obj.visible ? (isSelected ? 'var(--text-primary)' : 'var(--text-secondary)') : 'var(--text-muted)',
        fontWeight: isSelected ? 500 : 400,
        textDecoration: obj.visible ? 'none' : 'line-through',
      }}>
        {obj.label || obj.type}
      </span>

      {/* PPL/XPL tag for images */}
      {obj.type === 'image' && (
        <span
          className={`tag tag-${(obj as CanvasObject & { mode?: string }).mode?.toLowerCase() ?? 'ppl'}`}
          style={{ flexShrink: 0, fontSize: 9 }}
        >
          {(obj as CanvasObject & { mode?: string }).mode ?? 'PPL'}
        </span>
      )}

      <button
        className="btn-icon"
        style={{ padding: 2 }}
        title={obj.visible ? 'Hide' : 'Show'}
        onClick={e => { e.stopPropagation(); updateObject(obj.id, { visible: !obj.visible }); }}
      >
        {obj.visible ? <Eye size={11} /> : <EyeOff size={11} style={{ opacity: 0.4 }} />}
      </button>
      <button
        className="btn-icon"
        style={{ padding: 2 }}
        title={obj.locked ? 'Unlock' : 'Lock'}
        onClick={e => { e.stopPropagation(); updateObject(obj.id, { locked: !obj.locked }); }}
      >
        {obj.locked
          ? <Lock size={11} style={{ color: 'var(--warning)' }} />
          : <Unlock size={11} />}
      </button>
    </div>
  );
}

export default function LayersPanel() {
  const { showLayersPanel, toggleLayersPanel, doc, reorderObjects, insets } = useStore();
  const [dragId,   setDragId]   = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  if (!showLayersPanel) return null;

  // Objects shown top-first (visual top = highest z-index = last in array)
  const topFirst = [...doc.objects].reverse();

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    // doc.objects is bottom-to-top order; topFirst is reversed
    const ids = doc.objects.map(o => o.id); // bottom-to-top
    const fromIdx = ids.indexOf(dragId);
    const toIdx   = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const newIds = [...ids];
    newIds.splice(fromIdx, 1);
    newIds.splice(toIdx, 0, dragId);
    reorderObjects(newIds);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 44,
      right: 260,
      width: 230,
      maxHeight: 'calc(100vh - 60px)',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '9px 12px',
        borderBottom: '1px solid var(--border-muted)',
        flexShrink: 0,
      }}>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>Layers</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 8 }}>
          {doc.objects.length} obj{doc.objects.length !== 1 ? 's' : ''}
          {insets.length > 0 && ` · ${insets.length} inset${insets.length !== 1 ? 's' : ''}`}
        </span>
        <button className="btn-icon" onClick={toggleLayersPanel}><X size={13} /></button>
      </div>

      {/* Layer hint */}
      <div style={{
        padding: '5px 12px',
        fontSize: 10,
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--border-muted)',
        flexShrink: 0,
      }}>
        Drag rows to reorder · top = front
      </div>

      {/* Layer list */}
      <div
        style={{ overflowY: 'auto', flex: 1 }}
        onDragOver={e => e.preventDefault()}
      >
        {topFirst.length === 0 && (
          <div style={{ padding: '20px 12px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
            No objects on canvas yet.<br />
            <span style={{ fontSize: 10 }}>Drag images from the library or use a draw tool.</span>
          </div>
        )}

        {topFirst.map(obj => (
          <LayerRow
            key={obj.id}
            obj={obj}
            isDragOver={dragOver === obj.id && dragId !== obj.id}
            onDragStart={id => setDragId(id)}
            onDragOver={id => setDragOver(id)}
            onDrop={handleDrop}
            onDragEnd={() => { setDragId(null); setDragOver(null); }}
          />
        ))}
      </div>

      {/* Inset connectors summary */}
      {insets.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-muted)', padding: '8px 12px', flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Inset Connections
          </div>
          {insets.map(pair => {
            const parent = doc.objects.find(o => o.id === pair.parentObjectId);
            const inset  = doc.objects.find(o => o.id === pair.insetObjectId);
            return (
              <div key={pair.id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                <Crop size={10} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <span style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {parent?.label ?? '?'} → {inset?.label ?? '?'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
