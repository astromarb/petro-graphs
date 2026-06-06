import React, { useState } from 'react';
import {
  MousePointer2, Type, Square, Ruler, Hand,
  Download, Layers, Info, ZoomIn, ZoomOut, Maximize2
} from 'lucide-react';
import { useStore } from '../store';
import type { Tool } from '../types';

const TOOLS: { id: Tool; icon: React.ReactNode; label: string }[] = [
  { id: 'select',   icon: <MousePointer2 size={14} />, label: 'Select (V)' },
  { id: 'pan',      icon: <Hand size={14} />,           label: 'Pan (H)' },
  { id: 'text',     icon: <Type size={14} />,           label: 'Text / LaTeX (T)' },
  { id: 'shape',    icon: <Square size={14} />,          label: 'Shape (S)' },
  { id: 'scalebar', icon: <Ruler size={14} />,           label: 'Scale Bar (B)' },
];

export default function Topbar() {
  const { tool, setTool, zoom, setZoom, doc, setDocMeta,
          toggleMetadataPanel, toggleLayersPanel } = useStore();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(doc.title);

  const commitTitle = () => {
    setDocMeta({ title: titleVal.trim() || 'Untitled Figure' });
    setEditingTitle(false);
  };

  return (
    <div className="topbar">
      {/* Logo */}
      <div className="topbar-logo">
        <div className="logo-mark">PF</div>
        <div>
          <div className="topbar-title">PetroFigure</div>
          <div className="topbar-sub">Thin Section Composer</div>
        </div>
      </div>

      <div className="sep" />

      {/* Title */}
      {editingTitle ? (
        <input
          className="input"
          style={{ width: 220, fontSize: 12 }}
          value={titleVal}
          onChange={e => setTitleVal(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
          autoFocus
        />
      ) : (
        <span
          style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', cursor: 'pointer', paddingInline: 4 }}
          onDoubleClick={() => { setTitleVal(doc.title); setEditingTitle(true); }}
          title="Double-click to rename"
        >
          {doc.title}
        </span>
      )}

      <div className="sep" />

      {/* Tool palette */}
      <div style={{ display: 'flex', gap: 2 }}>
        {TOOLS.map(t => (
          <button
            key={t.id}
            className={`btn-icon${tool === t.id ? ' active' : ''}`}
            title={t.label}
            onClick={() => setTool(t.id)}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <div className="sep" />

      {/* Zoom controls */}
      <button className="btn-icon" onClick={() => setZoom(zoom - 0.1)} title="Zoom out"><ZoomOut size={14} /></button>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 38, textAlign: 'center' }}>
        {Math.round(zoom * 100)}%
      </span>
      <button className="btn-icon" onClick={() => setZoom(zoom + 0.1)} title="Zoom in"><ZoomIn size={14} /></button>
      <button className="btn-icon" onClick={() => setZoom(1)} title="Reset zoom"><Maximize2 size={13} /></button>

      <div style={{ flex: 1 }} />

      {/* Right actions */}
      <button className="btn-icon" title="Layers" onClick={toggleLayersPanel}><Layers size={14} /></button>
      <button className="btn-icon" title="Document info / metadata" onClick={toggleMetadataPanel}><Info size={14} /></button>
      <button className="btn btn-primary" style={{ gap: 5 }} title="Export figure">
        <Download size={13} /> Export
      </button>
    </div>
  );
}
