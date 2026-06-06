import React from 'react';
import { X, Eye, EyeOff, Lock, Unlock, Image, Type, Square, Ruler, GripVertical } from 'lucide-react';
import { useStore } from '../store';
import type { CanvasObject } from '../types';

const ICONS: Record<CanvasObject['type'], React.ReactNode> = {
  image: <Image size={12} />,
  text: <Type size={12} />,
  shape: <Square size={12} />,
  scalebar: <Ruler size={12} />,
};

function LayerRow({ obj }: { obj: CanvasObject }) {
  const { updateObject, setSelectedId, selectedId } = useStore();
  const isSelected = selectedId === obj.id;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px',
        background: isSelected ? 'var(--accent-glow)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
      onClick={() => setSelectedId(isSelected ? null : obj.id)}
    >
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}><GripVertical size={11} /></span>
      <span style={{ color: isSelected ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>
        {ICONS[obj.type]}
      </span>
      <span style={{
        flex: 1, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
        fontWeight: isSelected ? 500 : 400,
      }}>
        {obj.label || obj.type}
      </span>
      {obj.type === 'image' && (
        <span className={`tag tag-${(obj as CanvasObject & { mode?: string }).mode?.toLowerCase() ?? 'ppl'}`}
          style={{ flexShrink: 0, fontSize: 9 }}>
          {(obj as CanvasObject & { mode?: string }).mode ?? 'PPL'}
        </span>
      )}
      <button className="btn-icon" style={{ padding: 2 }}
        onClick={e => { e.stopPropagation(); updateObject(obj.id, { visible: !obj.visible }); }}>
        {obj.visible ? <Eye size={11} /> : <EyeOff size={11} style={{ opacity: 0.4 }} />}
      </button>
      <button className="btn-icon" style={{ padding: 2 }}
        onClick={e => { e.stopPropagation(); updateObject(obj.id, { locked: !obj.locked }); }}>
        {obj.locked ? <Lock size={11} style={{ color: 'var(--warning)' }} /> : <Unlock size={11} />}
      </button>
    </div>
  );
}

export default function LayersPanel() {
  const { showLayersPanel, toggleLayersPanel, doc } = useStore();
  if (!showLayersPanel) return null;

  const reversed = [...doc.objects].reverse();

  return (
    <div style={{
      position: 'fixed', top: 44, right: 260, width: 220, maxHeight: 'calc(100vh - 80px)',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 8, zIndex: 200, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', borderBottom: '1px solid var(--border-muted)' }}>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>Layers</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 8 }}>{doc.objects.length} objects</span>
        <button className="btn-icon" onClick={toggleLayersPanel}><X size={13} /></button>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {reversed.length === 0 && (
          <div style={{ padding: '16px', fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
            No objects yet
          </div>
        )}
        {reversed.map(obj => <LayerRow key={obj.id} obj={obj} />)}
      </div>
    </div>
  );
}
