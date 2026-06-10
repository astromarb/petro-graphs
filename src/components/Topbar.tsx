import React, { useState } from 'react';
import {
  MousePointer2, Type, Square, Ruler, Hand, Crop, Minus,
  Download, Layers, Info, ZoomIn, ZoomOut, Maximize2,
  Undo2, Redo2, FolderOpen, Save, LayoutGrid,
} from 'lucide-react';
import { useStore, saveProjectFile, openProjectFile } from '../store';
import type { Tool } from '../types';
import ExportModal from './ExportModal';
import GridDialog from './GridDialog';
import { sharedFabricRef } from '../fabricRef';
import { isDesktop, saveProject, saveProjectAs, openProject } from '../fileOps';
import { nanoid, niceScaleBar, UNIT_METERS, ptToPx } from '../utils';
import type { ScaleBarObject, ImageObject } from '../types';
import { version as APP_VERSION } from '../../package.json';

const TOOLS: { id: Tool; icon: React.ReactNode; name: string; label: string; sep?: boolean }[] = [
  { id: 'select',   icon: <MousePointer2 size={15} />, name: 'Select',   label: 'Select (V)' },
  { id: 'pan',      icon: <Hand size={15} />,           name: 'Pan',      label: 'Pan (H) · Space to temp-pan' },
  { id: 'text',     icon: <Type size={15} />,           name: 'Text',     label: 'Text / LaTeX (T)', sep: true },
  { id: 'shape',    icon: <Square size={15} />,          name: 'Shape',    label: 'Shape (S)' },
  { id: 'line',     icon: <Minus size={15} />,            name: 'Line',     label: 'Horizontal Line (L) — click and drag to draw' },
  { id: 'scalebar', icon: <Ruler size={15} />,           name: 'Scale Bar', label: 'Scale Bar (B) — click a calibrated image to place' },
  { id: 'inset',    icon: <Crop size={15} />,            name: 'Inset',    label: 'Inset (I)' },
];

export default function Topbar() {
  const {
    tool, setTool, zoom, setZoom, fitView,
    doc, setDocMeta,
    past, future, undo, redo,
    toggleMetadataPanel, toggleLayersPanel,
    showRulers, toggleRulers, rulerUnit, setRulerUnit,
    currentFilePath, setCurrentFilePath,
    addObject, selectedId,
  } = useStore();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(doc.title);
  const [showExport, setShowExport] = useState(false);
  const [showGrid, setShowGrid]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');

  const desktop = isDesktop();
  const fileName = currentFilePath
    ? currentFilePath.split(/[\\/]/).pop()!
    : null;

  const showSaved = () => {
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2200);
  };

  const showSaveError = (msg: string) => {
    setSaveError(msg);
    setSaveStatus('error');
    setTimeout(() => setSaveStatus('idle'), 5000);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const path = await saveProject();
      if (path) { setCurrentFilePath(path); showSaved(); }
    } catch (e) {
      showSaveError((e as Error).message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const path = await saveProjectAs();
      if (path) { setCurrentFilePath(path); showSaved(); }
    } catch (e) {
      showSaveError((e as Error).message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async () => {
    try {
      await openProject();
    } catch (e) {
      showSaveError(`Open failed: ${(e as Error).message ?? String(e)}`);
    }
  };

  // Auto-place a scale bar on the selected calibrated image (matches sidebar behavior).
  // Returns true if placed, false if no calibrated image is selected.
  const tryAutoPlaceScaleBar = (): boolean => {
    const state = useStore.getState();
    const imgObj = state.doc.objects.find(o => o.id === selectedId && o.type === 'image') as ImageObject | undefined;
    if (!imgObj) return false;
    const srcGrp = state.groups.find(g => g.id === imgObj.groupId);
    const srcImg = srcGrp?.images.find(i => i.id === imgObj.imageId);
    if (!srcImg?.calibration) return false;
    const cal = srcImg.calibration;
    const { realLength, unit, canvasPx } = niceScaleBar(srcImg.width, imgObj.width, cal);
    const canvasUnitsPerPx  = cal.unitsPerPixel * (srcImg.width / imgObj.width);
    const metersPerCanvasPx = canvasUnitsPerPx * (UNIT_METERS[cal.unit] ?? 1e-6);
    const sb: ScaleBarObject = {
      id: nanoid(), type: 'scalebar',
      x: imgObj.x + imgObj.width - canvasPx - 10,
      y: imgObj.y + 10,
      width: canvasPx, height: 36,
      rotation: 0, locked: false, visible: true,
      label: `${realLength} ${unit}`,
      length: canvasPx, realLength, unit,
      color: '#000000', labelColor: '#000000', thickness: 4,
      fontSize: ptToPx(8, state.doc.dpi),
      metersPerCanvasPx,
      parentImageId: imgObj.id,
    };
    addObject(sb);
    return true;
  };

  const commitTitle = () => {
    setDocMeta({ title: titleVal.trim() || 'Untitled Figure' });
    setEditingTitle(false);
  };

  return (
    <>
      <div className="topbar">
        {/* Logo */}
        <div className="topbar-logo">
          <img src="/favicon.svg" alt="Petro Graphs" className="logo-mark" />
          <div>
            <div className="topbar-title">Petro Graphs</div>
            <div className="topbar-sub">Version {APP_VERSION}</div>
          </div>
        </div>

        <div className="sep" />

        {/* Native file ops — desktop only */}
        {desktop && (
          <>
            <button className="btn-icon" title="Open project (Ctrl+O)" onClick={handleOpen}>
              <FolderOpen size={14} />
            </button>
            <button
              className="btn-icon"
              title={currentFilePath ? `Save (Ctrl+S) — ${fileName}` : 'Save As… (Ctrl+S)'}
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={14} />
            </button>
            {fileName && (
              <span
                style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }}
                title={`Saved: ${currentFilePath}\nClick to Save As…`}
                onClick={handleSaveAs}
              >
                {fileName}
              </span>
            )}
            {saveStatus === 'saved' && (
              <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 500 }}>✓ Saved</span>
            )}
            {saveStatus === 'error' && (
              <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 500, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={saveError}>
                ✗ {saveError}
              </span>
            )}
            <div className="sep" />
          </>
        )}

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
                className={`btn-tool${tool === t.id ? ' active' : ''}`}
                title={t.label}
                onClick={() => {
                  if (t.id === 'scalebar') {
                    // If a calibrated image is selected, auto-place immediately (same as sidebar)
                    if (!tryAutoPlaceScaleBar()) setTool('scalebar');
                  } else {
                    setTool(t.id);
                  }
                }}
              >
                {t.icon}
                <span>{t.name}</span>
              </button>
            </React.Fragment>
          ))}
        </div>

        <div className="sep" />

        {/* Grid layout */}
        <button
          className="btn-tool"
          title="Place images as grid"
          onClick={() => setShowGrid(true)}
        >
          <LayoutGrid size={15} />
          <span>Grid</span>
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
        <button className="btn-tool" onClick={fitView} title="Fit to screen (0)">
          <Maximize2 size={15} />
          <span>Fit</span>
        </button>

        <div style={{ flex: 1 }} />

        <button
          className={`btn-tool${showRulers ? ' active' : ''}`}
          title="Toggle rulers (R)"
          onClick={toggleRulers}
          style={{ opacity: showRulers ? 1 : 0.6 }}
        >
          <Ruler size={15} />
          <span>Rulers</span>
        </button>
        {showRulers && (
          <button
            className="btn-icon"
            title="Cycle ruler units: in → cm → mm"
            onClick={() => setRulerUnit(rulerUnit === 'in' ? 'cm' : rulerUnit === 'cm' ? 'mm' : 'in')}
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
              minWidth: 26, padding: '2px 5px',
              color: 'var(--accent)', opacity: 1,
            }}
          >
            {rulerUnit}
          </button>
        )}
        <button className="btn-tool" title="Layers" onClick={toggleLayersPanel}>
          <Layers size={15} />
          <span>Layers</span>
        </button>
        <button className="btn-tool" title="Document metadata" onClick={toggleMetadataPanel}>
          <Info size={15} />
          <span>Info</span>
        </button>

        {/* Browser fallback Save/Open — shown on non-desktop only (desktop has native file ops above) */}
        {!desktop && (
          <>
            <div className="sep" />
            <button
              className="btn btn-ghost"
              title="Open project (Ctrl+O)"
              style={{ fontSize: 12 }}
              onClick={() => openProjectFile().catch(e => alert(`Could not open file: ${(e as Error).message}`))}
            >
              <FolderOpen size={13} /> Open
            </button>
            <button
              className="btn btn-ghost"
              title="Save project (Ctrl+S)"
              style={{ fontSize: 12 }}
              onClick={saveProjectFile}
            >
              <Save size={13} /> Save
            </button>
          </>
        )}

        <div className="sep" />

        <button
          className="btn btn-primary"
          title="Export figure"
          onClick={() => setShowExport(true)}
        >
          <Download size={13} /> Export
        </button>
      </div>

      {showExport && (
        <ExportModal
          fabricCanvasRef={sharedFabricRef}
          onClose={() => setShowExport(false)}
        />
      )}
      {showGrid && <GridDialog onClose={() => setShowGrid(false)} />}
    </>
  );
}
