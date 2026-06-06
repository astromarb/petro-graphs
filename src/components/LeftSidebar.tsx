import React, { useRef, useState, useCallback } from 'react';
import { Plus, FolderOpen, ChevronDown, ChevronRight, X, Trash2, Upload } from 'lucide-react';
import { useStore } from '../store';
import type { ImageGroup, ThinSectionImage, ImageMode } from '../types';
import { nanoid } from '../utils';

function readFileAsDataUrl(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      const img = new Image();
      img.onload = () => resolve({ dataUrl, w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function detectMode(filename: string): ImageMode {
  const lower = filename.toLowerCase();
  if (lower.includes('xpl') || lower.includes('cross') || lower.includes('cx')) return 'XPL';
  return 'PPL';
}

function ImageCard({ img, groupId }: { img: ThinSectionImage; groupId: string }) {
  const { removeImageFromGroup } = useStore();

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/petro-image', JSON.stringify({ imageId: img.id, groupId }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="image-card" draggable onDragStart={handleDragStart} title={`Drag onto canvas\n${img.name}`}>
      <div style={{ position: 'relative', aspectRatio: '4/3', background: '#111' }}>
        <img
          src={img.dataUrl}
          alt={img.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          draggable={false}
        />
        <div style={{ position: 'absolute', top: 4, left: 4 }}>
          <span className={`tag tag-${img.mode.toLowerCase()}`}>{img.mode}</span>
        </div>
        <button
          className="btn-icon"
          style={{ position: 'absolute', top: 2, right: 2, padding: 2, background: 'rgba(0,0,0,0.5)' }}
          onClick={() => removeImageFromGroup(groupId, img.id)}
          title="Remove image"
        >
          <X size={10} />
        </button>
      </div>
      <div style={{ padding: '4px 6px', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {img.name}
      </div>
    </div>
  );
}

function GroupCard({ group }: { group: ImageGroup }) {
  const { toggleGroupExpanded, updateGroup, removeGroup, addImageToGroup } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(group.name);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    for (const file of arr) {
      try {
        const { dataUrl, w, h } = await readFileAsDataUrl(file);
        const img: ThinSectionImage = {
          id: nanoid(),
          mode: detectMode(file.name),
          name: file.name,
          dataUrl,
          width: w,
          height: h,
        };
        addImageToGroup(group.id, img);
      } catch { /* skip bad files */ }
    }
  }, [group.id, addImageToGroup]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const pplImages = group.images.filter(i => i.mode === 'PPL');
  const xplImages = group.images.filter(i => i.mode === 'XPL');

  return (
    <div className={`group-card${group.expanded ? ' expanded' : ''}`}>
      <div className="group-header" onClick={() => toggleGroupExpanded(group.id)}>
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {group.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        {editName ? (
          <input
            className="input"
            style={{ flex: 1, fontSize: 11 }}
            value={nameVal}
            onClick={e => e.stopPropagation()}
            onChange={e => setNameVal(e.target.value)}
            onBlur={() => { updateGroup(group.id, { name: nameVal || group.name }); setEditName(false); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { updateGroup(group.id, { name: nameVal || group.name }); setEditName(false); } }}
            autoFocus
          />
        ) : (
          <span
            style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onDoubleClick={e => { e.stopPropagation(); setEditName(true); }}
          >
            {group.name}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{group.images.length}</span>
        <button className="btn-icon" style={{ padding: 2 }} onClick={e => { e.stopPropagation(); removeGroup(group.id); }} title="Delete group">
          <Trash2 size={11} />
        </button>
      </div>

      {group.expanded && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Sample label */}
          <input
            className="input"
            placeholder="Sample ID / label"
            value={group.sample}
            onChange={e => updateGroup(group.id, { sample: e.target.value })}
            style={{ fontSize: 11 }}
          />

          {/* Drop zone */}
          <div
            className={`drop-zone${dragOver ? ' drag-over' : ''}`}
            style={{ padding: '10px 8px' }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14} style={{ margin: '0 auto 4px', display: 'block' }} />
            <div style={{ fontSize: 11 }}>Drop images or click to upload</div>
            <div style={{ fontSize: 10, marginTop: 2, color: 'var(--text-muted)' }}>PPL / XPL — auto-detected by filename</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => e.target.files && processFiles(e.target.files)} />

          {/* PPL row */}
          {pplImages.length > 0 && (
            <div>
              <div className="panel-label" style={{ marginBottom: 5 }}>PPL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {pplImages.map(img => <ImageCard key={img.id} img={img} groupId={group.id} />)}
              </div>
            </div>
          )}

          {/* XPL row */}
          {xplImages.length > 0 && (
            <div>
              <div className="panel-label" style={{ marginBottom: 5 }}>XPL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {xplImages.map(img => <ImageCard key={img.id} img={img} groupId={group.id} />)}
              </div>
            </div>
          )}

          {group.images.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0' }}>
              No images yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LeftSidebar() {
  const { groups, addGroup, doc, setDocMeta } = useStore();
  const [canvasW, setCanvasW] = useState(String(doc.width));
  const [canvasH, setCanvasH] = useState(String(doc.height));

  const createGroup = () => {
    const g: ImageGroup = {
      id: nanoid(),
      name: `Group ${groups.length + 1}`,
      sample: '',
      images: [],
      expanded: true,
    };
    addGroup(g);
  };

  const applyCanvasSize = () => {
    const w = parseInt(canvasW);
    const h = parseInt(canvasH);
    if (w > 0 && h > 0) setDocMeta({ width: w, height: h });
  };

  const PRESETS = [
    { label: '1-col (3.5×2.5 in)', w: 1050, h: 750 },
    { label: '2-col (7×5 in)', w: 2100, h: 1500 },
    { label: 'Full page (7×9 in)', w: 2100, h: 2700 },
    { label: '4K (3840×2160)', w: 3840, h: 2160 },
  ];

  return (
    <div className="sidebar sidebar-left">
      {/* Canvas size */}
      <div className="panel-section">
        <div className="panel-label"><FolderOpen size={11} /> Canvas</div>
        <div style={{ display: 'flex', gap: 5, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div className="input-label">W (px)</div>
            <input className="input" value={canvasW} onChange={e => setCanvasW(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="input-label">H (px)</div>
            <input className="input" value={canvasH} onChange={e => setCanvasH(e.target.value)} />
          </div>
        </div>
        <select className="select" style={{ marginBottom: 6, fontSize: 11 }}
          onChange={e => {
            const p = PRESETS[parseInt(e.target.value)];
            if (p) { setCanvasW(String(p.w)); setCanvasH(String(p.h)); }
          }}
          defaultValue=""
        >
          <option value="" disabled>Preset sizes…</option>
          {PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }} onClick={applyCanvasSize}>Apply</button>
          <div style={{ flex: 1 }}>
            <div className="input-label">DPI</div>
            <input className="input" value={doc.dpi} onChange={e => setDocMeta({ dpi: parseInt(e.target.value) || 300 })} />
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="input-label">Background</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={doc.background}
              onChange={e => setDocMeta({ background: e.target.value })}
              style={{ width: 32, height: 26, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }} />
            <input className="input" value={doc.background} onChange={e => setDocMeta({ background: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Image groups */}
      <div className="panel-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 }}>
        <div className="panel-label" style={{ margin: 0 }}>Image Library</div>
        <button className="btn btn-primary" style={{ padding: '4px 9px', fontSize: 11 }} onClick={createGroup}>
          <Plus size={11} /> New Group
        </button>
      </div>

      <div className="scroll-area" style={{ padding: '8px 10px' }}>
        {groups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 11 }}>
            <p style={{ margin: 0 }}>No image groups yet.</p>
            <p style={{ margin: '4px 0 0' }}>Click <strong>New Group</strong> to start.</p>
          </div>
        )}
        {groups.map(g => <GroupCard key={g.id} group={g} />)}
      </div>
    </div>
  );
}
