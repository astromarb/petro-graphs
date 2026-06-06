import React, { useRef, useState, useCallback } from 'react';
import { Plus, FolderOpen, ChevronDown, ChevronRight, X, Trash2, Upload, FileImage, ArrowLeftRight } from 'lucide-react';
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
  if (lower.includes('xpl') || lower.includes('cross') || lower.includes('cx') || lower.includes('pol')) return 'XPL';
  return 'PPL';
}

// ── Page size presets ─────────────────────────────────────────────────────
interface PagePreset { label: string; w: number; h: number; dpi: number }
const PAGE_PRESETS: PagePreset[] = [
  // Journal single-column (89 mm @ 300 dpi)
  { label: 'Nature / Science — 1 col (89 mm)',  w: 1051, h:  788, dpi: 300 },
  // Journal double-column (183 mm @ 300 dpi)
  { label: 'Nature / Science — 2 col (183 mm)', w: 2165, h: 1624, dpi: 300 },
  // EPSL / GSA full width (190 mm @ 300 dpi)
  { label: 'EPSL / GSA — full (190 mm)',         w: 2244, h: 1683, dpi: 300 },
  // A4 portrait @ 300 dpi
  { label: 'A4 portrait (210 × 297 mm)',         w: 2480, h: 3508, dpi: 300 },
  // A4 landscape
  { label: 'A4 landscape (297 × 210 mm)',        w: 3508, h: 2480, dpi: 300 },
  // US Letter
  { label: 'US Letter (8.5 × 11 in)',            w: 2550, h: 3300, dpi: 300 },
  // 4K screen
  { label: '4K screen (3840 × 2160)',            w: 3840, h: 2160, dpi: 96  },
  // Presentation slide
  { label: 'Presentation (1920 × 1080)',         w: 1920, h: 1080, dpi: 96  },
];

// ── Image card in group ───────────────────────────────────────────────────
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
          style={{ position: 'absolute', top: 2, right: 2, padding: 2, background: 'rgba(0,0,0,0.6)' }}
          onClick={() => removeImageFromGroup(groupId, img.id)}
          title="Remove"
        >
          <X size={10} />
        </button>
      </div>
      <div style={{ padding: '3px 6px', fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {img.name}
      </div>
    </div>
  );
}

// ── Group card ────────────────────────────────────────────────────────────
function GroupCard({ group }: { group: ImageGroup }) {
  const { toggleGroupExpanded, updateGroup, removeGroup, addImageToGroup } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const { dataUrl, w, h } = await readFileAsDataUrl(file);
        addImageToGroup(group.id, {
          id: nanoid(),
          mode: detectMode(file.name),
          name: file.name,
          dataUrl, width: w, height: h,
        });
      } catch { /* skip bad files */ }
    }
  }, [group.id, addImageToGroup]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const ppl = group.images.filter(i => i.mode === 'PPL');
  const xpl = group.images.filter(i => i.mode === 'XPL');

  return (
    <div className={`group-card${group.expanded ? ' expanded' : ''}`}>
      {/* Header */}
      <div
        className="group-header"
        onClick={e => {
          // Don't toggle if clicking the delete button or the rename input
          if ((e.target as HTMLElement).closest('button, input')) return;
          toggleGroupExpanded(group.id);
        }}
      >
        <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          {group.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>

        <span
          style={{
            flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {group.name}
        </span>

        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
          {group.images.length}
        </span>
        <button
          className="btn-icon"
          style={{ padding: 2 }}
          onClick={e => { e.stopPropagation(); removeGroup(group.id); }}
          title="Delete group"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Body */}
      {group.expanded && (
        <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div>
            <div className="input-label">Group name</div>
            <input
              className="input"
              value={group.name}
              onChange={e => updateGroup(group.id, { name: e.target.value || 'Untitled Group' })}
              style={{ fontSize: 11 }}
            />
          </div>
          <input
            className="input"
            placeholder="Sample ID / label"
            value={group.sample}
            onChange={e => updateGroup(group.id, { sample: e.target.value })}
            style={{ fontSize: 11 }}
          />

          <div
            className={`drop-zone${dragOver ? ' drag-over' : ''}`}
            style={{ padding: '9px 8px' }}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={13} style={{ margin: '0 auto 3px', display: 'block' }} />
            <div style={{ fontSize: 11 }}>Drop or click to upload</div>
            <div style={{ fontSize: 10, marginTop: 1, color: 'var(--text-muted)' }}>
              PPL/XPL auto-detected from filename
            </div>
          </div>
          <input
            ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => e.target.files && processFiles(e.target.files)}
          />

          {ppl.length > 0 && (
            <div>
              <div className="panel-label" style={{ marginBottom: 4 }}>PPL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {ppl.map(img => <ImageCard key={img.id} img={img} groupId={group.id} />)}
              </div>
            </div>
          )}

          {xpl.length > 0 && (
            <div>
              <div className="panel-label" style={{ marginBottom: 4 }}>XPL</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                {xpl.map(img => <ImageCard key={img.id} img={img} groupId={group.id} />)}
              </div>
            </div>
          )}

          {group.images.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
              No images yet
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Left sidebar ──────────────────────────────────────────────────────────
export default function LeftSidebar() {
  const { groups, addGroup, doc, setDocMeta } = useStore();
  const [canvasW, setCanvasW] = useState(String(doc.width));
  const [canvasH, setCanvasH] = useState(String(doc.height));

  const applySize = () => {
    const w = parseInt(canvasW);
    const h = parseInt(canvasH);
    if (w > 0 && h > 0) setDocMeta({ width: w, height: h });
  };

  const applyPreset = (p: PagePreset) => {
    setCanvasW(String(p.w));
    setCanvasH(String(p.h));
    setDocMeta({ width: p.w, height: p.h, dpi: p.dpi });
  };

  const createGroup = () => {
    addGroup({
      id: nanoid(),
      name: `Group ${groups.length + 1}`,
      sample: '',
      images: [],
      expanded: true,
    });
  };

  return (
    <div className="sidebar sidebar-left">
      {/* Canvas size */}
      <div className="panel-section">
        <div className="panel-label"><FolderOpen size={11} /> Canvas</div>

        <div style={{ display: 'flex', gap: 5, marginBottom: 6, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <div className="input-label">W (px)</div>
            <input className="input" value={canvasW} onChange={e => setCanvasW(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applySize()} />
          </div>
          {/* Flip orientation */}
          <button
            className="btn-icon"
            style={{ marginBottom: 1, flexShrink: 0 }}
            title="Flip orientation (swap W ↔ H)"
            onClick={() => {
              setCanvasW(canvasH);
              setCanvasH(canvasW);
              setDocMeta({ width: parseInt(canvasH) || doc.height, height: parseInt(canvasW) || doc.width });
            }}
          >
            <ArrowLeftRight size={13} />
          </button>
          <div style={{ flex: 1 }}>
            <div className="input-label">H (px)</div>
            <input className="input" value={canvasH} onChange={e => setCanvasH(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applySize()} />
          </div>
        </div>

        {/* Page presets */}
        <div className="input-label">Page preset</div>
        <select
          className="select"
          style={{ marginBottom: 6, fontSize: 11 }}
          defaultValue=""
          onChange={e => {
            const idx = parseInt(e.target.value);
            if (!isNaN(idx)) applyPreset(PAGE_PRESETS[idx]);
            e.target.value = '';
          }}
        >
          <option value="" disabled>Choose a preset…</option>
          {PAGE_PRESETS.map((p, i) => (
            <option key={i} value={i}>{p.label}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }} onClick={applySize}>
            Apply size
          </button>
          <div style={{ flex: 1 }}>
            <div className="input-label">DPI</div>
            <input className="input" type="number" value={doc.dpi}
              onChange={e => setDocMeta({ dpi: parseInt(e.target.value) || 300 })} />
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <div className="input-label">Background</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="color" value={doc.background}
              onChange={e => setDocMeta({ background: e.target.value })}
              style={{ width: 30, height: 26, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }}
            />
            <input className="input" value={doc.background}
              onChange={e => setDocMeta({ background: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Image groups header */}
      <div className="panel-section" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="panel-label" style={{ margin: 0 }}>
          <FileImage size={11} /> Image Library
        </div>
        <button className="btn btn-primary" style={{ padding: '4px 9px', fontSize: 11 }} onClick={createGroup}>
          <Plus size={11} /> New Group
        </button>
      </div>

      <div className="scroll-area" style={{ padding: '8px 10px' }}>
        {groups.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 11 }}>
            <p style={{ margin: 0 }}>No image groups yet.</p>
            <p style={{ margin: '4px 0 0' }}>Click <strong>New Group</strong> to start.</p>
          </div>
        )}
        {groups.map(g => <GroupCard key={g.id} group={g} />)}
      </div>
    </div>
  );
}
