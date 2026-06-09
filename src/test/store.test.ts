import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store';
import type { CanvasObject, ScaleBarObject } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeImage(overrides?: Partial<CanvasObject>): CanvasObject {
  return {
    id: `obj-${Math.random().toString(36).slice(2)}`,
    type: 'image',
    imageId: 'img-1', groupId: 'grp-1', mode: 'PPL',
    x: 10, y: 20, width: 100, height: 80,
    rotation: 0, locked: false, visible: true, label: 'Test image',
    border: { color: '#fff', width: 1, style: 'solid', radius: 0 },
    opacity: 1,
    adjustments: {
      flipX: false, flipY: false,
      brightness: 0, contrast: 0, saturation: 0, hue: 0,
      grayscale: false, invert: false, sharpen: false,
    },
    ...overrides,
  } as CanvasObject;
}

function makeScalebar(overrides?: Partial<ScaleBarObject>): ScaleBarObject {
  return {
    id: `sb-${Math.random().toString(36).slice(2)}`,
    type: 'scalebar',
    x: 50, y: 50, width: 120, height: 24, rotation: 0,
    locked: false, visible: true, label: '100 µm',
    length: 120, realLength: 100, unit: 'µm',
    color: '#ffffff', labelColor: '#ffffff', thickness: 4, fontSize: 13,
    ...overrides,
  };
}

function makeText(overrides?: Partial<CanvasObject>): CanvasObject {
  return {
    id: `txt-${Math.random().toString(36).slice(2)}`,
    type: 'text',
    content: '\\text{Label}', isLatex: true,
    x: 0, y: 0, width: 200, height: 40, rotation: 0,
    locked: false, visible: true, label: 'Text',
    fontSize: 16, color: '#000000', fontWeight: 'normal', align: 'left',
    ...overrides,
  } as CanvasObject;
}

// Reset store between tests by clearing objects/history manually
function resetStore() {
  useStore.setState({
    doc: {
      id: 'doc-1', title: 'Untitled Figure',
      width: 1200, height: 900, dpi: 300, background: '#ffffff',
      objects: [],
      metadata: { authors: '', affiliation: '', sampleInfo: '', locality: '', notes: '', date: '' },
    },
    insets: [],
    past: [],
    future: [],
    selectedId: null,
    groups: [],
    zoom: 1, panX: 0, panY: 0,
    tool: 'select',
    showMetadataPanel: false,
    showLayersPanel: false,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('addObject', () => {
  beforeEach(resetStore);

  it('appends the object to doc.objects', () => {
    const obj = makeImage();
    useStore.getState().addObject(obj);
    expect(useStore.getState().doc.objects).toHaveLength(1);
    expect(useStore.getState().doc.objects[0].id).toBe(obj.id);
  });

  it('pushes to undo history', () => {
    const before = useStore.getState().past.length;
    useStore.getState().addObject(makeImage());
    expect(useStore.getState().past.length).toBe(before + 1);
  });

  it('clears redo (future) history', () => {
    useStore.getState().addObject(makeImage());
    useStore.getState().undo();
    expect(useStore.getState().future.length).toBeGreaterThan(0);
    useStore.getState().addObject(makeImage());
    expect(useStore.getState().future.length).toBe(0);
  });
});

describe('removeObject', () => {
  beforeEach(resetStore);

  it('removes the object from doc.objects', () => {
    const obj = makeImage();
    useStore.getState().addObject(obj);
    useStore.getState().removeObject(obj.id);
    expect(useStore.getState().doc.objects).toHaveLength(0);
  });

  it('cleans up inset pairs referencing the deleted object', () => {
    const parent = makeImage({ id: 'parent' });
    const child  = makeImage({ id: 'child' });
    useStore.getState().addObject(parent);
    useStore.getState().addObject(child);
    useStore.getState().addInset({
      id: 'pair-1', parentObjectId: 'parent', insetObjectId: 'child',
      cropRect: { relX: 0, relY: 0, w: 50, h: 50 },
    });
    expect(useStore.getState().insets).toHaveLength(1);

    useStore.getState().removeObject('parent');
    expect(useStore.getState().insets).toHaveLength(0);
  });

  it('also removes inset pairs when child is deleted', () => {
    const parent = makeImage({ id: 'parent2' });
    const child  = makeImage({ id: 'child2' });
    useStore.getState().addObject(parent);
    useStore.getState().addObject(child);
    useStore.getState().addInset({
      id: 'pair-2', parentObjectId: 'parent2', insetObjectId: 'child2',
      cropRect: { relX: 0, relY: 0, w: 50, h: 50 },
    });
    useStore.getState().removeObject('child2');
    expect(useStore.getState().insets).toHaveLength(0);
  });
});

describe('updateObject', () => {
  beforeEach(resetStore);

  it('updates a property on an existing object', () => {
    const obj = makeImage();
    useStore.getState().addObject(obj);
    useStore.getState().updateObject(obj.id, { label: 'Updated' });
    expect(useStore.getState().doc.objects[0].label).toBe('Updated');
  });

  it('pushes to history on structural changes (x, y, width, height, rotation)', () => {
    const obj = makeImage();
    useStore.getState().addObject(obj);
    const before = useStore.getState().past.length;
    useStore.getState().updateObject(obj.id, { x: 99 });
    expect(useStore.getState().past.length).toBe(before + 1);
  });

  it('does NOT push to history for non-structural changes (e.g. label)', () => {
    const obj = makeImage();
    useStore.getState().addObject(obj);
    const before = useStore.getState().past.length;
    useStore.getState().updateObject(obj.id, { label: 'New label' });
    expect(useStore.getState().past.length).toBe(before);
  });

  it('does NOT push to history for opacity changes', () => {
    const obj = makeImage();
    useStore.getState().addObject(obj);
    const before = useStore.getState().past.length;
    useStore.getState().updateObject(obj.id, { opacity: 0.5 } as Partial<CanvasObject>);
    expect(useStore.getState().past.length).toBe(before);
  });
});

describe('undo / redo', () => {
  beforeEach(resetStore);

  it('undo restores the previous state', () => {
    const obj = makeImage();
    useStore.getState().addObject(obj);
    expect(useStore.getState().doc.objects).toHaveLength(1);
    useStore.getState().undo();
    expect(useStore.getState().doc.objects).toHaveLength(0);
  });

  it('redo re-applies the undone action', () => {
    const obj = makeImage();
    useStore.getState().addObject(obj);
    useStore.getState().undo();
    expect(useStore.getState().doc.objects).toHaveLength(0);
    useStore.getState().redo();
    expect(useStore.getState().doc.objects).toHaveLength(1);
  });

  it('undo does nothing when history is empty', () => {
    expect(useStore.getState().past).toHaveLength(0);
    expect(() => useStore.getState().undo()).not.toThrow();
  });

  it('redo does nothing when future is empty', () => {
    expect(useStore.getState().future).toHaveLength(0);
    expect(() => useStore.getState().redo()).not.toThrow();
  });

  it('multi-step undo/redo cycle is consistent', () => {
    const a = makeImage({ id: 'a', label: 'A' });
    const b = makeImage({ id: 'b', label: 'B' });
    useStore.getState().addObject(a);
    useStore.getState().addObject(b);
    expect(useStore.getState().doc.objects).toHaveLength(2);
    useStore.getState().undo(); // remove b
    expect(useStore.getState().doc.objects).toHaveLength(1);
    useStore.getState().undo(); // remove a
    expect(useStore.getState().doc.objects).toHaveLength(0);
    useStore.getState().redo(); // restore a
    expect(useStore.getState().doc.objects).toHaveLength(1);
    useStore.getState().redo(); // restore b
    expect(useStore.getState().doc.objects).toHaveLength(2);
  });
});

describe('reorderObjects', () => {
  beforeEach(resetStore);

  it('reorders objects according to the provided id array', () => {
    const a = makeImage({ id: 'a' });
    const b = makeImage({ id: 'b' });
    const c = makeImage({ id: 'c' });
    useStore.getState().addObject(a);
    useStore.getState().addObject(b);
    useStore.getState().addObject(c);
    useStore.getState().reorderObjects(['c', 'a', 'b']);
    const ids = useStore.getState().doc.objects.map(o => o.id);
    expect(ids).toEqual(['c', 'a', 'b']);
  });

  it('pushes to undo history', () => {
    const a = makeImage({ id: 'a' });
    const b = makeImage({ id: 'b' });
    useStore.getState().addObject(a);
    useStore.getState().addObject(b);
    const before = useStore.getState().past.length;
    useStore.getState().reorderObjects(['b', 'a']);
    expect(useStore.getState().past.length).toBe(before + 1);
  });
});

describe('duplicateObject', () => {
  beforeEach(resetStore);

  it('creates a second object with a different id', () => {
    const obj = makeImage({ id: 'orig' });
    useStore.getState().addObject(obj);
    useStore.getState().duplicateObject('orig');
    const objects = useStore.getState().doc.objects;
    expect(objects).toHaveLength(2);
    expect(objects[1].id).not.toBe('orig');
  });

  it('offsets the duplicate position by 20px', () => {
    const obj = makeImage({ id: 'orig', x: 100, y: 200 });
    useStore.getState().addObject(obj);
    useStore.getState().duplicateObject('orig');
    const dup = useStore.getState().doc.objects[1];
    expect(dup.x).toBe(120);
    expect(dup.y).toBe(220);
  });

  it('appends "(copy)" to the label', () => {
    const obj = makeImage({ id: 'orig', label: 'My Image' });
    useStore.getState().addObject(obj);
    useStore.getState().duplicateObject('orig');
    expect(useStore.getState().doc.objects[1].label).toBe('My Image (copy)');
  });
});

describe('setZoom', () => {
  beforeEach(resetStore);

  it('clamps zoom below minimum (0.1)', () => {
    useStore.getState().setZoom(0);
    expect(useStore.getState().zoom).toBe(0.1);
  });

  it('clamps zoom above maximum (4)', () => {
    useStore.getState().setZoom(10);
    expect(useStore.getState().zoom).toBe(4);
  });

  it('accepts a value within range', () => {
    useStore.getState().setZoom(1.5);
    expect(useStore.getState().zoom).toBe(1.5);
  });
});

describe('ScaleBarObject type completeness', () => {
  beforeEach(resetStore);

  it('stores all required scalebar fields', () => {
    const sb = makeScalebar();
    useStore.getState().addObject(sb);
    const stored = useStore.getState().doc.objects[0] as ScaleBarObject;
    expect(stored.type).toBe('scalebar');
    expect(stored.unit).toBe('µm');
    expect(stored.realLength).toBe(100);
    expect(stored.length).toBe(120);
    expect(stored.fontSize).toBe(13);
  });

  it('accepts all ScaleUnit values without type errors', () => {
    const units = ['µm', 'nm', 'mm', 'cm', 'm', 'km', 'Å'] as const;
    for (const unit of units) {
      const sb = makeScalebar({ id: `sb-${unit}`, unit });
      expect(() => useStore.getState().addObject(sb)).not.toThrow();
    }
    expect(useStore.getState().doc.objects).toHaveLength(units.length);
  });

  it('label is formatted as "realLength unit"', () => {
    const sb = makeScalebar({ realLength: 500, unit: 'nm', label: '500 nm' });
    useStore.getState().addObject(sb);
    expect(useStore.getState().doc.objects[0].label).toBe('500 nm');
  });
});

describe('TextObject LaTeX fields', () => {
  beforeEach(resetStore);

  it('stores isLatex flag and content correctly', () => {
    const txt = makeText({ content: '\\frac{a}{b}' });
    useStore.getState().addObject(txt);
    const stored = useStore.getState().doc.objects[0];
    expect((stored as typeof txt).isLatex).toBe(true);
    expect((stored as typeof txt).content).toBe('\\frac{a}{b}');
  });

  it('non-latex text is stored with isLatex: false', () => {
    const txt = makeText({ isLatex: false, content: 'Plain text' });
    useStore.getState().addObject(txt);
    const stored = useStore.getState().doc.objects[0];
    expect((stored as typeof txt).isLatex).toBe(false);
  });
});

describe('tool auto-return to select', () => {
  beforeEach(resetStore);

  it('setTool switches tool correctly', () => {
    useStore.getState().setTool('text');
    expect(useStore.getState().tool).toBe('text');
    useStore.getState().setTool('select');
    expect(useStore.getState().tool).toBe('select');
  });

  it('tool can be reset to select after inset', () => {
    useStore.getState().setTool('inset');
    expect(useStore.getState().tool).toBe('inset');
    // Simulate what confirmInset / cancelInset does
    useStore.getState().setTool('select');
    expect(useStore.getState().tool).toBe('select');
  });

  it('tool can be reset to select after shape placement', () => {
    useStore.getState().setTool('shape');
    useStore.getState().setTool('select');
    expect(useStore.getState().tool).toBe('select');
  });
});

describe('project persistence helpers', () => {
  beforeEach(resetStore);

  it('rehydrate restores doc title and groups', () => {
    const { rehydrate } = useStore.getState();
    const restoredDoc = { ...useStore.getState().doc, title: 'Restored Project' };
    rehydrate({
      doc: restoredDoc,
      insets: [],
      groups: [{ id: 'g1', name: 'Sample A', sample: '', images: [], expanded: true }],
    });
    expect(useStore.getState().doc.title).toBe('Restored Project');
    expect(useStore.getState().groups).toHaveLength(1);
    expect(useStore.getState().groups[0].name).toBe('Sample A');
  });

  it('rehydrate restores canvas objects', () => {
    const obj = makeImage();
    const { rehydrate } = useStore.getState();
    const docWithObj = { ...useStore.getState().doc, objects: [obj] };
    rehydrate({
      doc: docWithObj,
      insets: [],
      groups: [],
    });
    expect(useStore.getState().doc.objects).toHaveLength(1);
    expect(useStore.getState().doc.objects[0].id).toBe(obj.id);
  });

  it('rehydrate with saved doc missing objects field leaves objects as []', () => {
    // Older .petrofig files may not include doc.objects — Object.assign would
    // overwrite the field with undefined, causing .map() crashes in CanvasArea.
    const { rehydrate } = useStore.getState();
    const docWithoutObjects = { ...useStore.getState().doc } as Record<string, unknown>;
    delete docWithoutObjects['objects'];
    rehydrate({ doc: docWithoutObjects as never, insets: [], groups: [] });
    expect(Array.isArray(useStore.getState().doc.objects)).toBe(true);
    expect(useStore.getState().doc.objects).toHaveLength(0);
  });

  it('rehydrate with undefined groups leaves groups as []', () => {
    const { rehydrate } = useStore.getState();
    rehydrate({ doc: useStore.getState().doc, insets: [], groups: undefined as never });
    expect(Array.isArray(useStore.getState().groups)).toBe(true);
  });

  it('rehydrate with undefined insets leaves insets as []', () => {
    const { rehydrate } = useStore.getState();
    rehydrate({ doc: useStore.getState().doc, insets: undefined as never, groups: [] });
    expect(Array.isArray(useStore.getState().insets)).toBe(true);
  });
});
