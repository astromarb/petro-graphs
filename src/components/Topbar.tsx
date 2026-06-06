import React, { useState } from 'react';
import {
  MousePointer2, Type, Square, Ruler, Hand, Crop,
  Download, Layers, Info, ZoomIn, ZoomOut, Maximize2,
  Undo2, Redo2, Grid3x3,
} from 'lucide-react';
import { useStore } from '../store';
import type { Tool } from '../types';
import GridLayoutModal from './GridLayoutModal';
import ExportModal from './ExportModal';
import { sharedFabricRef } from '../fabricRef';

const TOOLS: { id: Tool; icon: React.ReactNode; label: string; sep?: boolean }[] = [
  { id: 'select',   icon: <MousePointer2 size={14} />, label: 'Select (V)' },
  { id: 'pan',      icon: <Hand size={14} />,           label: 'Pan (H) · Space to temp-pan' },
  { id: 'text',     icon: <Type size={14} />,           label: 'Text / LaTeX (T)', sep: true },
  { id: 'shape',    icon: <Square size={14} />,          label: 'Shape (S)' },
  { id: 'scalebar', icon: <Ruler size={14} />,           label: 'Scale Bar (B) — select calibrated image first' },
  { id: 'inset',    icon: <Crop size={14} />,            label: 'Inset (I)' },
];

export default function Topbar() {
  const {
    tool, setTool, zoom, setZoom,
    doc, setDocMeta,
    past, future, undo, redo,
    toggleMetadataPanel, toggleLayersPanel,
    showRulers, toggleRulers,
  } = useStore();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(doc.title);
  const [showGrid,   setShowGrid]   = useState(false);
  const [showExport, setShowExport] = useState(false);

  const commitTitle = () => {
    setDocMeta({ title: titleVal.trim() || 'Untitled Figure' });
    setEditingTitle(false);
  };

  return (
    <>
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

        {/* Doc title */}
        {editingTitle ? (
          <input
            className="input"
            style={{ width: 200, fontSize: 12 }}
            value={titleVal}
            onChange={e => setTitleVal(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => {
              if (e.key === 'Enter')  commitTitle();
              if (e.key === 'Escape') setEditingTitle(false);
            }}
            autoFocus
          />
        ) : (
          <span
            style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', cursor: 'text', padding: '2px 4px', borderRadius: 4 }}
            onDoubleClick={() => { setTitleVal(doc.title); setEditingTitle(true); }}
            title="Double-click to rename"
          >
            {doc.title}
          </span>
        )}

        <div className="sep" />

        {/* Undo / Redo */}
        <button
          className="btn-icon"
          onClick={undo}
          disabled={past.length === 0}
          title={`Undo (Ctrl+Z)${past.length ? ` · ${past.length} steps` : ''}`}
          style={{ opacity: past.length === 0 ? 0.35 : 1 }}
        >
          <Undo2 size={14} />
        </button>
        <button
          className="btn-icon"
          onClick={redo}
          disabled={future.length === 0}
          title={`Redo (Ctrl+Shift+Z)${future.length ? ` · ${future.length} steps` : ''}`}
          style={{ opacity: future.length === 0 ? 0.35 : 1 }}
        >
          <Redo2 size={14} />
        </button>

        <div className="sep" />

        {/* Tool palette */}
        <div style={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {TOOLS.map((t) => (
            <React.Fragment key={t.id}>
              {t.sep && <div className="sep" />}
              <button
                className={`btn-icon${tool === t.id ? ' active' : ''}`}
                title={t.label}
                onClick={() => setTool(t.id)}
              >
                {t.icon}
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="sep" />

        {/* Grid layout */}
        <button
          className="btn-icon"
          title="Grid layout — arrange images in a uniform grid"
          onClick={() => setShowGrid(true)}
        >
          <Grid3x3 size={14} />
        </button>

        <div className="sep" />

        {/* Zoom */}
        <button className="btn-icon" onClick={() => setZoom(zoom - 0.1)} title="Zoom out (-)">
          <ZoomOut size={14} />
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
        <button className="btn-icon" onClick={() => setZoom(zoom + 0.1)} title="Zoom in (+)">
          <ZoomIn size={14} />
        </button>
        <button className="btn-icon" onClick={() => setZoom(1)} title="Reset zoom (0)">
          <Maximize2 size={13} />
        </button>

        <div style={{ flex: 1 }} />

        <button
          className={`btn-icon${showRulers ? ' active' : ''}`}
          title="Toggle rulers (R)"
          onClick={toggleRulers}
          style={{ opacity: showRulers ? 1 : 0.6 }}
        >
          <Ruler size={14} />
        </button>
        <button className="btn-icon" title="Layers" onClick={toggleLayersPanel}>
          <Layers size={14} />
        </button>
        <button className="btn-icon" title="Document metadata" onClick={toggleMetadataPanel}>
          <Info size={14} />
        </button>
        <button
          className="btn btn-primary"
          title="Export figure"
          onClick={() => setShowExport(true)}
        >
          <Download size={13} /> Export
        </button>
      </div>

      {showGrid   && <GridLayoutModal onClose={() => setShowGrid(false)} />}
      {showExport && (
        <ExportModal
          fabricCanvasRef={sharedFabricRef}
          onClose={() => setShowExport(false)}
        />
      )}
    </>
  );
}
