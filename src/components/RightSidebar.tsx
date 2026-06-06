import { useState, useEffect } from 'react';
import katex from 'katex';
import { Lock, Unlock, Eye, EyeOff, Trash2, Copy, ChevronDown, ChevronRight, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { useStore } from '../store';
import type { CanvasObject, ImageObject, TextObject, ShapeObject, ScaleBarObject, BorderStyle } from '../types';
import { BORDER_COLORS } from '../utils';

// ── KaTeX preview ────────────────────────────────────────────────────────
function LatexPreview({ latex }: { latex: string }) {
  const [html, setHtml] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    try {
      const rendered = katex.renderToString(latex, {
        throwOnError: false,
        displayMode: false,
        trust: true,
      });
      setHtml(rendered);
      setErr('');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Parse error');
    }
  }, [latex]);

  return (
    <div className="katex-preview">
      {err
        ? <span style={{ fontSize: 11, color: 'var(--danger)' }}>{err}</span>
        : <span dangerouslySetInnerHTML={{ __html: html }} />
      }
    </div>
  );
}

// ── Border editor ────────────────────────────────────────────────────────
function BorderEditor({ border, onChange }: { border: BorderStyle; onChange: (b: Partial<BorderStyle>) => void }) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button className="panel-label" style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 5 }}
        onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Border
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {/* Style */}
          <div>
            <div className="input-label">Style</div>
            <div className="segmented">
              {(['none','solid','dashed','dotted'] as BorderStyle['style'][]).map(s => (
                <button key={s} className={`segmented-btn${border.style === s ? ' active' : ''}`}
                  onClick={() => onChange({ style: s })}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {border.style !== 'none' && (
            <>
              {/* Color swatches */}
              <div>
                <div className="input-label">Color</div>
                <div className="swatch-row" style={{ marginBottom: 5 }}>
                  {BORDER_COLORS.map(c => (
                    <div key={c} className={`color-dot${border.color === c ? ' selected' : ''}`}
                      style={{ background: c, border: c === '#ffffff' ? '1px solid #555' : undefined }}
                      onClick={() => onChange({ color: c })} />
                  ))}
                </div>
                <div className="input-row">
                  <input type="color" value={border.color} onChange={e => onChange({ color: e.target.value })}
                    style={{ width: 28, height: 24, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }} />
                  <input className="input" value={border.color} onChange={e => onChange({ color: e.target.value })} />
                </div>
              </div>

              {/* Width */}
              <div>
                <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Thickness</span>
                  <span style={{ color: 'var(--text-primary)' }}>{border.width}px</span>
                </div>
                <input type="range" min={1} max={20} value={border.width}
                  onChange={e => onChange({ width: parseInt(e.target.value) })} style={{ width: '100%' }} />
              </div>

              {/* Radius */}
              <div>
                <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Corner radius</span>
                  <span style={{ color: 'var(--text-primary)' }}>{border.radius}px</span>
                </div>
                <input type="range" min={0} max={50} value={border.radius}
                  onChange={e => onChange({ radius: parseInt(e.target.value) })} style={{ width: '100%' }} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Image object panel ───────────────────────────────────────────────────
function ImagePanel({ obj, update }: { obj: ImageObject; update: (p: Partial<ImageObject>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="input-label">Width (px)</div>
        <input className="input" type="number" value={Math.round(obj.width)}
          onChange={e => { const v = parseInt(e.target.value); if (v > 0) update({ width: v }); }} />
      </div>
      <div>
        <div className="input-label">Height (px)</div>
        <input className="input" type="number" value={Math.round(obj.height)}
          onChange={e => { const v = parseInt(e.target.value); if (v > 0) update({ height: v }); }} />
      </div>
      <div>
        <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Opacity</span>
          <span style={{ color: 'var(--text-primary)' }}>{Math.round(obj.opacity * 100)}%</span>
        </div>
        <input type="range" min={0} max={100} value={Math.round(obj.opacity * 100)}
          onChange={e => update({ opacity: parseInt(e.target.value) / 100 })} style={{ width: '100%' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="input-label" style={{ margin: 0 }}>Show mode tag</span>
        <button className={`btn btn-ghost`} style={{ padding: '3px 8px', fontSize: 11 }}
          onClick={() => update({ showModeTag: !obj.showModeTag })}>
          {obj.showModeTag ? 'On' : 'Off'}
        </button>
      </div>

      {obj.showModeTag && (
        <div>
          <div className="input-label">Tag position</div>
          <div className="segmented">
            {(['tl','tr','bl','br'] as ImageObject['tagPosition'][]).map(p => (
              <button key={p} className={`segmented-btn${obj.tagPosition === p ? ' active' : ''}`}
                onClick={() => update({ tagPosition: p })} style={{ fontSize: 10 }}>
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="input-label">Mode override</div>
        <div className="segmented">
          {(['PPL','XPL'] as const).map(m => (
            <button key={m} className={`segmented-btn${obj.mode === m ? ' active' : ''}`}
              onClick={() => update({ mode: m })}>
              {m}
            </button>
          ))}
        </div>
      </div>

      <BorderEditor border={obj.border} onChange={patch => update({ border: { ...obj.border, ...patch } })} />
    </div>
  );
}

// ── Text object panel ────────────────────────────────────────────────────
function TextPanel({ obj, update }: { obj: TextObject; update: (p: Partial<TextObject>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div className="input-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>LaTeX expression</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={obj.isLatex} onChange={e => update({ isLatex: e.target.checked })} />
            <span>LaTeX</span>
          </label>
        </div>
        <textarea
          className="textarea"
          value={obj.content}
          onChange={e => update({ content: e.target.value })}
          placeholder={obj.isLatex ? '\\text{My label}' : 'Plain text'}
          rows={3}
        />
      </div>

      {obj.isLatex && (
        <div>
          <div className="input-label">Preview</div>
          <LatexPreview latex={obj.content} />
        </div>
      )}

      <div>
        <div className="input-label">Font size</div>
        <div className="input-row">
          <input type="range" min={8} max={72} value={obj.fontSize}
            onChange={e => update({ fontSize: parseInt(e.target.value) })} style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 26 }}>{obj.fontSize}</span>
        </div>
      </div>

      <div>
        <div className="input-label">Color</div>
        <div className="input-row">
          <input type="color" value={obj.color} onChange={e => update({ color: e.target.value })}
            style={{ width: 28, height: 24, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }} />
          <input className="input" value={obj.color} onChange={e => update({ color: e.target.value })} />
        </div>
      </div>

      <div>
        <div className="input-label">Align</div>
        <div className="segmented">
          {[
            { v: 'left', icon: <AlignLeft size={12} /> },
            { v: 'center', icon: <AlignCenter size={12} /> },
            { v: 'right', icon: <AlignRight size={12} /> },
          ].map(({ v, icon }) => (
            <button key={v} className={`segmented-btn${obj.align === v ? ' active' : ''}`}
              onClick={() => update({ align: v as TextObject['align'] })}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="input-label">Weight</div>
        <div className="segmented">
          {(['normal','bold'] as const).map(w => (
            <button key={w} className={`segmented-btn${obj.fontWeight === w ? ' active' : ''}`}
              onClick={() => update({ fontWeight: w })}>
              {w}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Shape object panel ───────────────────────────────────────────────────
function ShapePanel({ obj, update }: { obj: ShapeObject; update: (p: Partial<ShapeObject>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div className="input-label">Shape type</div>
        <div className="segmented">
          {(['rect','ellipse'] as const).map(s => (
            <button key={s} className={`segmented-btn${obj.shape === s ? ' active' : ''}`}
              onClick={() => update({ shape: s })}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="input-label">Fill color</div>
        <div className="input-row">
          <input type="color" value={obj.fill} onChange={e => update({ fill: e.target.value })}
            style={{ width: 28, height: 24, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }} />
          <input className="input" value={obj.fill} onChange={e => update({ fill: e.target.value })} />
        </div>
      </div>

      <div>
        <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Fill opacity</span>
          <span style={{ color: 'var(--text-primary)' }}>{Math.round(obj.fillOpacity * 100)}%</span>
        </div>
        <input type="range" min={0} max={100} value={Math.round(obj.fillOpacity * 100)}
          onChange={e => update({ fillOpacity: parseInt(e.target.value) / 100 })} style={{ width: '100%' }} />
      </div>

      <BorderEditor border={obj.border} onChange={patch => update({ border: { ...obj.border, ...patch } })} />
    </div>
  );
}

// ── Scale bar panel ──────────────────────────────────────────────────────
function ScaleBarPanel({ obj, update }: { obj: ScaleBarObject; update: (p: Partial<ScaleBarObject>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div className="input-label">Canvas length (px)</div>
        <input className="input" type="number" value={obj.length}
          onChange={e => update({ length: parseInt(e.target.value) || 100 })} />
      </div>
      <div>
        <div className="input-label">Real length (µm)</div>
        <input className="input" type="number" value={obj.realLength}
          onChange={e => update({ realLength: parseInt(e.target.value) || 100 })} />
      </div>
      <div>
        <div className="input-label">Bar thickness (px)</div>
        <input type="range" min={1} max={12} value={obj.thickness}
          onChange={e => update({ thickness: parseInt(e.target.value) })} style={{ width: '100%' }} />
      </div>
      <div>
        <div className="input-label">Bar color</div>
        <div className="input-row">
          <input type="color" value={obj.color} onChange={e => update({ color: e.target.value })}
            style={{ width: 28, height: 24, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }} />
          <input className="input" value={obj.color} onChange={e => update({ color: e.target.value })} />
        </div>
      </div>
      <div>
        <div className="input-label">Label color</div>
        <div className="input-row">
          <input type="color" value={obj.labelColor} onChange={e => update({ labelColor: e.target.value })}
            style={{ width: 28, height: 24, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }} />
          <input className="input" value={obj.labelColor} onChange={e => update({ labelColor: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

// ── Transform controls ───────────────────────────────────────────────────
function TransformPanel({ obj, update }: { obj: CanvasObject; update: (p: Partial<CanvasObject>) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className="panel-label" style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 5 }}
        onClick={() => setOpen(o => !o)}>
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        Transform
      </button>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(['x','y','width','height','rotation'] as const).map(field => (
            <div key={field}>
              <div className="input-label">{field === 'rotation' ? 'Rotation (°)' : `${field.toUpperCase()} (px)`}</div>
              <input className="input" type="number"
                value={Math.round((obj as unknown as Record<string, number>)[field])}
                onChange={e => update({ [field]: parseFloat(e.target.value) } as Partial<CanvasObject>)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main right sidebar ───────────────────────────────────────────────────
export default function RightSidebar() {
  const { selectedId, doc, updateObject, removeObject, duplicateObject } = useStore();
  const obj = doc.objects.find(o => o.id === selectedId);

  const update = (patch: Partial<CanvasObject>) => {
    if (obj) updateObject(obj.id, patch);
  };

  if (!obj) {
    return (
      <div className="sidebar sidebar-right">
        <div className="panel-section">
          <div className="panel-label">Properties</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
            Select an object on the canvas to edit its properties.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar sidebar-right">
      {/* Object header */}
      <div className="panel-section" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <input
            className="input"
            value={obj.label}
            onChange={e => update({ label: e.target.value })}
            style={{ fontSize: 12, fontWeight: 500 }}
            placeholder="Object label"
          />
        </div>
        <button className="btn-icon" title={obj.visible ? 'Hide' : 'Show'}
          onClick={() => update({ visible: !obj.visible })}>
          {obj.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <button className="btn-icon" title={obj.locked ? 'Unlock' : 'Lock'}
          onClick={() => update({ locked: !obj.locked })}>
          {obj.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
        <button className="btn-icon" title="Duplicate" onClick={() => duplicateObject(obj.id)}>
          <Copy size={13} />
        </button>
        <button className="btn-icon btn-danger" title="Delete" onClick={() => removeObject(obj.id)}>
          <Trash2 size={13} />
        </button>
      </div>

      <div className="scroll-area">
        <div className="panel-section">
          {obj.type === 'image' && <ImagePanel obj={obj} update={p => update(p as Partial<CanvasObject>)} />}
          {obj.type === 'text' && <TextPanel obj={obj} update={p => update(p as Partial<CanvasObject>)} />}
          {obj.type === 'shape' && <ShapePanel obj={obj} update={p => update(p as Partial<CanvasObject>)} />}
          {obj.type === 'scalebar' && <ScaleBarPanel obj={obj} update={p => update(p as Partial<CanvasObject>)} />}
        </div>

        <div className="panel-section">
          <TransformPanel obj={obj} update={update} />
        </div>
      </div>
    </div>
  );
}
