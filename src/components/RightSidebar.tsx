import React, { useState, useEffect } from 'react';
import katex from 'katex';
import {
  Lock, Unlock, Eye, EyeOff, Trash2, Copy,
  ChevronDown, ChevronRight,
  AlignLeft, AlignCenter, AlignRight,
  FlipHorizontal, FlipVertical,
} from 'lucide-react';
import { useStore } from '../store';
import type {
  CanvasObject, ImageObject, TextObject, ShapeObject, ScaleBarObject,
  BorderStyle, ImageAdjustments, ScaleBarObject as SBO,
} from '../types';
// ScaleUnit referenced via ScaleBarObject['unit'] below
import { DEFAULT_ADJUSTMENTS } from '../types';
import { BORDER_COLORS as COLORS, niceScaleBar, UNIT_METERS, convertUnit } from '../utils';
import { nanoid } from '../utils';
import { Ruler } from 'lucide-react';

// ── KaTeX preview ────────────────────────────────────────────────────────
function LatexPreview({ latex }: { latex: string }) {
  const [html, setHtml] = useState('');
  const [err, setErr]   = useState('');

  useEffect(() => {
    try {
      setHtml(katex.renderToString(latex, { throwOnError: false, displayMode: false }));
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

// ── Accordion wrapper ────────────────────────────────────────────────────
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        className="panel-label"
        style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 5, marginBottom: open ? 8 : 0 }}
        onClick={() => setOpen(o => !o)}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        {title}
      </button>
      {open && children}
    </div>
  );
}

// ── Border editor ────────────────────────────────────────────────────────
function BorderEditor({ border, onChange }: { border: BorderStyle; onChange: (b: Partial<BorderStyle>) => void }) {
  return (
    <Section title="Border">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div className="input-label">Style</div>
          <div className="segmented">
            {(['none', 'solid', 'dashed', 'dotted'] as BorderStyle['style'][]).map(s => (
              <button key={s} className={`segmented-btn${border.style === s ? ' active' : ''}`}
                onClick={() => onChange({ style: s })}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {border.style !== 'none' && <>
          <div>
            <div className="input-label">Color</div>
            <div className="swatch-row" style={{ marginBottom: 5 }}>
              {COLORS.map(c => (
                <div key={c}
                  className={`color-dot${border.color === c ? ' selected' : ''}`}
                  style={{ background: c, outline: c === '#ffffff' ? '1px solid #555' : undefined }}
                  onClick={() => onChange({ color: c })}
                />
              ))}
            </div>
            <div className="input-row">
              <input type="color" value={border.color} onChange={e => onChange({ color: e.target.value })}
                style={{ width: 28, height: 24, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }} />
              <input className="input" value={border.color} onChange={e => onChange({ color: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Thickness</span>
              <span style={{ color: 'var(--text-primary)' }}>{border.width}px</span>
            </div>
            <input type="range" min={1} max={20} value={border.width}
              onChange={e => onChange({ width: +e.target.value })} style={{ width: '100%' }} />
          </div>

          <div>
            <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Corner radius</span>
              <span style={{ color: 'var(--text-primary)' }}>{border.radius}px</span>
            </div>
            <input type="range" min={0} max={80} value={border.radius}
              onChange={e => onChange({ radius: +e.target.value })} style={{ width: '100%' }} />
          </div>
        </>}
      </div>
    </Section>
  );
}

// ── Image adjustments panel ──────────────────────────────────────────────
function AdjustmentsPanel({ adj, onChange }: {
  adj: ImageAdjustments;
  onChange: (a: Partial<ImageAdjustments>) => void;
}) {
  const sliders: { key: keyof ImageAdjustments; label: string; min: number; max: number; step: number }[] = [
    { key: 'brightness', label: 'Brightness', min: -1, max: 1, step: 0.01 },
    { key: 'contrast',   label: 'Contrast',   min: -1, max: 1, step: 0.01 },
    { key: 'saturation', label: 'Saturation', min: -1, max: 1, step: 0.01 },
    { key: 'hue',        label: 'Hue shift',  min: -1, max: 1, step: 0.01 },
  ];

  const resetAll = () => onChange({ ...DEFAULT_ADJUSTMENTS });

  return (
    <Section title="Image Adjustments" defaultOpen={false}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

        {/* Flip buttons */}
        <div>
          <div className="input-label">Flip</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className={`btn btn-ghost${adj.flipX ? ' active' : ''}`}
              style={{ flex: 1, fontSize: 11, gap: 4, background: adj.flipX ? 'var(--accent-glow)' : undefined, borderColor: adj.flipX ? 'var(--accent)' : undefined }}
              onClick={() => onChange({ flipX: !adj.flipX })}
            >
              <FlipHorizontal size={12} /> Horizontal
            </button>
            <button
              className={`btn btn-ghost${adj.flipY ? ' active' : ''}`}
              style={{ flex: 1, fontSize: 11, gap: 4, background: adj.flipY ? 'var(--accent-glow)' : undefined, borderColor: adj.flipY ? 'var(--accent)' : undefined }}
              onClick={() => onChange({ flipY: !adj.flipY })}
            >
              <FlipVertical size={12} /> Vertical
            </button>
          </div>
        </div>

        {/* Sliders */}
        {sliders.map(({ key, label, min, max, step }) => {
          const val = adj[key] as number;
          return (
            <div key={key}>
              <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{label}</span>
                <span style={{ color: val === 0 ? 'var(--text-muted)' : 'var(--text-primary)', fontFamily: 'var(--mono)', fontSize: 10 }}>
                  {val > 0 ? '+' : ''}{val.toFixed(2)}
                </span>
              </div>
              <input
                type="range" min={min} max={max} step={step} value={val}
                onChange={e => onChange({ [key]: +e.target.value })}
                style={{ width: '100%' }}
              />
            </div>
          );
        })}

        {/* Toggle filters */}
        <div>
          <div className="input-label">Filters</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {([
              { key: 'grayscale', label: 'Grayscale' },
              { key: 'invert',    label: 'Invert' },
              { key: 'sharpen',   label: 'Sharpen' },
            ] as { key: keyof ImageAdjustments; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                className={`btn btn-ghost`}
                style={{
                  fontSize: 11, padding: '3px 8px',
                  background: adj[key] ? 'var(--accent-glow)' : undefined,
                  borderColor: adj[key] ? 'var(--accent)' : undefined,
                  color: adj[key] ? 'var(--accent)' : undefined,
                }}
                onClick={() => onChange({ [key]: !adj[key] })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Reset */}
        <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={resetAll}>
          Reset all adjustments
        </button>
      </div>
    </Section>
  );
}

// ── Image object panel ───────────────────────────────────────────────────
function ImagePanel({ obj, update }: { obj: ImageObject; update: (p: Partial<ImageObject>) => void }) {
  const { groups, addObject, pushCalibration } = useStore();
  const srcImg = groups.flatMap(g => g.images).find(i => i.id === obj.imageId);
  const cal = srcImg?.calibration;
  const adj = obj.adjustments ?? { ...DEFAULT_ADJUSTMENTS };

  const generateScaleBar = () => {
    if (!srcImg || !cal) return;
    const { realLength, unit, canvasPx } = niceScaleBar(srcImg.width, obj.width, cal);
    const canvasUnitsPerPx  = cal.unitsPerPixel * (srcImg.width / obj.width);
    const metersPerCanvasPx = canvasUnitsPerPx * (UNIT_METERS[cal.unit] ?? 1e-6);
    const sb: SBO = {
      id: nanoid(), type: 'scalebar',
      x: obj.x + 10, y: obj.y + obj.height - 40,
      width: canvasPx + 20, height: 36,
      rotation: 0, locked: false, visible: true,
      label: `${realLength} ${unit}`,
      length: canvasPx, realLength, unit,
      color: '#ffffff', labelColor: '#ffffff', thickness: 4, fontSize: 13,
      metersPerCanvasPx,
    };
    addObject(sb);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Section title="Size & Opacity">
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div className="input-label">W (px)</div>
            <input className="input" type="number" value={Math.round(obj.width)}
              onChange={e => { const v = +e.target.value; if (v > 0) update({ width: v }); }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="input-label">H (px)</div>
            <input className="input" type="number" value={Math.round(obj.height)}
              onChange={e => { const v = +e.target.value; if (v > 0) update({ height: v }); }} />
          </div>
        </div>
        <div>
          <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Opacity</span>
            <span style={{ color: 'var(--text-primary)' }}>{Math.round(obj.opacity * 100)}%</span>
          </div>
          <input type="range" min={0} max={100} value={Math.round(obj.opacity * 100)}
            onChange={e => update({ opacity: +e.target.value / 100 })} style={{ width: '100%' }} />
        </div>
      </Section>

      <Section title="Mode Tag" defaultOpen={false}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="input-label" style={{ margin: 0 }}>Visible</span>
            <button className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => update({ showModeTag: !obj.showModeTag })}>
              {obj.showModeTag ? 'On' : 'Off'}
            </button>
          </div>
          {obj.showModeTag && (
            <div>
              <div className="input-label">Position</div>
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
        </div>
      </Section>

      <AdjustmentsPanel adj={adj} onChange={patch => update({ adjustments: { ...adj, ...patch } })} />

      <BorderEditor border={obj.border} onChange={patch => update({ border: { ...obj.border, ...patch } })} />

      <Section title="Scale Calibration" defaultOpen={true}>
        {cal ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <Ruler size={11} style={{ display: 'inline', marginRight: 4, color: '#3ecf8e' }} />
              {cal.refRealLength} {cal.unit} / {Math.round(cal.refPixelDistance)} px
              &nbsp;({(cal.unitsPerPixel).toExponential(3)} {cal.unit}/px)
            </div>
            <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={generateScaleBar}>
              <Ruler size={11} /> Generate scale bar
            </button>
            {srcImg && (
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => pushCalibration(obj.groupId, srcImg)}>
                Re-calibrate
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Not calibrated. Set scale to enable scale bar generation.
            </div>
            {srcImg && (
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => pushCalibration(obj.groupId, srcImg)}>
                <Ruler size={11} /> Set calibration
              </button>
            )}
          </div>
        )}
      </Section>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
            <input type="checkbox" checked={obj.isLatex} onChange={e => update({ isLatex: e.target.checked })} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>LaTeX mode</span>
          </label>
        </div>
        <textarea
          className="textarea"
          value={obj.content}
          onChange={e => update({ content: e.target.value })}
          placeholder={obj.isLatex ? '\\text{My label}\nor: \\frac{SiO_2}{Al_2O_3}' : 'Plain text'}
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
        <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Font size</span>
          <span style={{ color: 'var(--text-primary)' }}>{obj.fontSize}px</span>
        </div>
        <input type="range" min={8} max={96} value={obj.fontSize}
          onChange={e => update({ fontSize: +e.target.value })} style={{ width: '100%' }} />
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
        <div className="input-label">Alignment</div>
        <div className="segmented">
          {[
            { v: 'left',   icon: <AlignLeft size={12} /> },
            { v: 'center', icon: <AlignCenter size={12} /> },
            { v: 'right',  icon: <AlignRight size={12} /> },
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

// ── Shape panel ───────────────────────────────────────────────────────────
function ShapePanel({ obj, update }: { obj: ShapeObject; update: (p: Partial<ShapeObject>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <div className="input-label">Shape</div>
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
          onChange={e => update({ fillOpacity: +e.target.value / 100 })} style={{ width: '100%' }} />
      </div>
      <BorderEditor border={obj.border} onChange={patch => update({ border: { ...obj.border, ...patch } })} />
    </div>
  );
}

// ── Scale bar panel ───────────────────────────────────────────────────────
const SCALE_UNITS_SIDEBAR = ['µm', 'nm', 'mm', 'cm', 'm', 'km', 'Å'] as const;

function ScaleBarPanel({ obj, update }: { obj: ScaleBarObject; update: (p: Partial<ScaleBarObject>) => void }) {
  const hasCal = obj.metersPerCanvasPx != null;

  const handleLengthChange = (newLen: number) => {
    if (newLen <= 0) return;
    const patch: Partial<ScaleBarObject> = { length: newLen, width: newLen };
    if (hasCal) {
      const newReal = parseFloat(
        (newLen * obj.metersPerCanvasPx! / (UNIT_METERS[obj.unit] ?? 1e-6)).toPrecision(4)
      );
      patch.realLength = newReal;
      patch.label      = `${newReal} ${obj.unit}`;
    }
    update(patch);
  };

  const handleUnitChange = (newUnit: ScaleBarObject['unit']) => {
    let newReal: number;
    if (hasCal) {
      newReal = parseFloat(
        (obj.length * obj.metersPerCanvasPx! / (UNIT_METERS[newUnit] ?? 1e-6)).toPrecision(4)
      );
    } else {
      newReal = parseFloat(convertUnit(obj.realLength, obj.unit, newUnit).toPrecision(4));
    }
    update({ unit: newUnit, realLength: newReal, label: `${newReal} ${newUnit}` });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {hasCal && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Ruler size={10} color="#3ecf8e" /> Calibrated — length and units update automatically
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ flex: 2 }}>
          <div className="input-label">Real length</div>
          <input className="input" type="number" value={obj.realLength}
            onChange={e => {
              const v = +e.target.value || 1;
              update({ realLength: v, label: `${v} ${obj.unit}` });
            }} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="input-label">Unit</div>
          <select className="select" value={obj.unit ?? 'µm'}
            onChange={e => handleUnitChange(e.target.value as ScaleBarObject['unit'])}>
            {SCALE_UNITS_SIDEBAR.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      <div>
        <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Extent (canvas px)</span>
          <span style={{ color: 'var(--text-primary)' }}>{obj.length} px</span>
        </div>
        <input type="range" min={20} max={1200} value={obj.length}
          onChange={e => handleLengthChange(+e.target.value)} style={{ width: '100%' }} />
        <input className="input" type="number" value={obj.length}
          onChange={e => handleLengthChange(+e.target.value || obj.length)}
          style={{ marginTop: 4, fontSize: 11 }} />
      </div>

      <div>
        <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Thickness</span>
          <span style={{ color: 'var(--text-primary)' }}>{obj.thickness}px</span>
        </div>
        <input type="range" min={1} max={16} value={obj.thickness}
          onChange={e => update({ thickness: +e.target.value })} style={{ width: '100%' }} />
      </div>
      <div>
        <div className="input-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Label font size</span>
          <span style={{ color: 'var(--text-primary)' }}>{obj.fontSize ?? 13}px</span>
        </div>
        <input type="range" min={8} max={32} value={obj.fontSize ?? 13}
          onChange={e => update({ fontSize: +e.target.value })} style={{ width: '100%' }} />
      </div>
      <div>
        <div className="input-label">Color</div>
        <div className="input-row">
          <input type="color" value={obj.color} onChange={e => update({ color: e.target.value, labelColor: e.target.value })}
            style={{ width: 28, height: 24, border: '1px solid var(--border)', borderRadius: 4, padding: 1, background: 'none', cursor: 'pointer' }} />
          <input className="input" value={obj.color} onChange={e => update({ color: e.target.value, labelColor: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

// ── Transform panel ───────────────────────────────────────────────────────
function TransformPanel({ obj, update }: { obj: CanvasObject; update: (p: Partial<CanvasObject>) => void }) {
  return (
    <Section title="Transform" defaultOpen={false}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {(['x','y','width','height','rotation'] as const).map(field => (
          <div key={field} style={field === 'rotation' ? { gridColumn: 'span 2' } : {}}>
            <div className="input-label">{field === 'rotation' ? 'Rotation (°)' : `${field.toUpperCase()} (px)`}</div>
            <input className="input" type="number"
              value={Math.round((obj as unknown as Record<string, number>)[field])}
              onChange={e => update({ [field]: parseFloat(e.target.value) } as Partial<CanvasObject>)} />
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Main right sidebar ────────────────────────────────────────────────────
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
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', lineHeight: 1.5 }}>
            Select an object on the canvas to edit its properties.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sidebar sidebar-right">
      {/* Object header bar */}
      <div className="panel-section" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ flex: 1 }}>
          <input className="input" value={obj.label}
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
        <button className="btn-icon" title="Duplicate (Ctrl+D)"
          onClick={() => duplicateObject(obj.id)}>
          <Copy size={13} />
        </button>
        <button className="btn-icon btn-danger" title="Delete (Del)"
          onClick={() => removeObject(obj.id)}>
          <Trash2 size={13} />
        </button>
      </div>

      <div className="scroll-area">
        <div className="panel-section">
          {obj.type === 'image'    && <ImagePanel    obj={obj} update={p => update(p as Partial<CanvasObject>)} />}
          {obj.type === 'text'     && <TextPanel     obj={obj} update={p => update(p as Partial<CanvasObject>)} />}
          {obj.type === 'shape'    && <ShapePanel    obj={obj} update={p => update(p as Partial<CanvasObject>)} />}
          {obj.type === 'scalebar' && <ScaleBarPanel obj={obj} update={p => update(p as Partial<CanvasObject>)} />}
        </div>

        <div className="panel-section">
          <TransformPanel obj={obj} update={update} />
        </div>
      </div>
    </div>
  );
}
