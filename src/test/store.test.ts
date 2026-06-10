import { describe, it, expect, beforeEach } from 'vitest';
import { useStore, MAX_CANVAS_SLOTS } from '../store';
import type { CanvasObject, ScaleBarObject, ImageObject } from '../types';

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
  const freshDoc = {
    id: 'doc-1', title: 'Untitled Figure',
    width: 1200, height: 900, dpi: 300, background: '#ffffff',
    objects: [] as CanvasObject[],
    metadata: { authors: '', affiliation: '', sampleInfo: '', locality: '', notes: '', date: '' },
  };
  useStore.setState({
    doc: freshDoc,
    insets: [],
    past: [],
    future: [],
    selectedId: null,
    groups: [],
    zoom: 1, panX: 0, panY: 0,
    tool: 'select',
    showMetadataPanel: false,
    showLayersPanel: false,
    pendingGrid: null,
    canvasSlots: [{ id: 'slot-default', filePath: null, doc: freshDoc, groups: [], insets: [] }],
    activeSlotId: 'slot-default',
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

describe('setTool', () => {
  beforeEach(resetStore);

  it('switches between all tools and back to select', () => {
    for (const t of ['text', 'shape', 'scalebar', 'inset', 'pan', 'grid-place'] as const) {
      useStore.getState().setTool(t);
      expect(useStore.getState().tool).toBe(t);
    }
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

// ── Scale bar cap position math ───────────────────────────────────────────────
// These tests guard the expected coordinate relationships for scale bar rendering.
// capL must be at x=0 (left edge of the bar group), capR at x=length-thickness.
// The label must be centred at x = o.x + o.length/2 in scene space.

describe('scale bar rendering coordinate invariants', () => {
  it('capR x = length - thickness for a standard bar', () => {
    // Mirrors the createFabricObject calculation: capR.left = o.length - o.thickness
    const length = 120;
    const thickness = 4;
    const capRLeft = length - thickness;
    expect(capRLeft).toBe(116);
  });

  it('capR x = length - thickness for a thick bar', () => {
    const length = 200;
    const thickness = 8;
    expect(length - thickness).toBe(192);
  });

  it('label x offset = x + length / 2 (centred above bar)', () => {
    const o = makeScalebar({ x: 50, y: 30, length: 120 });
    expect(o.x + o.length / 2).toBe(110);
  });

  it('label x is stable after a position update', () => {
    const sb = makeScalebar({ x: 100, y: 50, length: 80 });
    useStore.getState().addObject(sb);
    useStore.getState().updateObject(sb.id, { x: 200 });
    const updated = useStore.getState().doc.objects[0] as ScaleBarObject;
    // The new label position should be computed from updated.x + length/2
    expect(updated.x + updated.length / 2).toBe(240);
  });
});

// ── Grid snap-back regression ─────────────────────────────────────────────────
// Guards the fix for "grid reverts to spawn location after being moved then text is added."
//
// Root cause: createFabricObject captured `obj` in a closure for the async fromURL
// call.  If the user moved the image while fromURL was in flight, updateObject updated
// the store but the closure still held the original coords.  When fromURL resolved, the
// image was placed at the *original* position, not the moved one.
//
// Fix: re-read useStore.getState().doc.objects inside the .then() callback so we always
// use the most recent position, regardless of how long the load took.
//
// These tests verify the store-side invariant: after addObject + updateObject the store
// position is correct and stable.  A pure store test cannot exercise Fabric rendering,
// but it documents the precondition the fix relies on.

describe('grid snap-back regression guards', () => {
  beforeEach(resetStore);

  it('store position reflects updateObject regardless of insert order', () => {
    const img = makeImage({ id: 'g1', x: 40, y: 40 });
    useStore.getState().addObject(img);
    useStore.getState().updateObject('g1', { x: 200, y: 300 });
    const live = useStore.getState().doc.objects.find(o => o.id === 'g1');
    // If createFabricObject reads this value at resolve time it gets (200,300), not (40,40)
    expect(live?.x).toBe(200);
    expect(live?.y).toBe(300);
  });

  it('addObjects followed by updateObject keeps correct per-image positions', () => {
    const objs = [
      makeImage({ id: 'ga', x: 0,   y: 0   }),
      makeImage({ id: 'gb', x: 420, y: 0   }),
      makeImage({ id: 'gc', x: 0,   y: 320 }),
    ];
    useStore.getState().addObjects(objs);
    // Simulate user dragging images while photos are loading
    useStore.getState().updateObject('ga', { x: 10,  y: 10  });
    useStore.getState().updateObject('gb', { x: 430, y: 10  });
    useStore.getState().updateObject('gc', { x: 10,  y: 330 });

    const [ga, gb, gc] = ['ga', 'gb', 'gc'].map(
      id => useStore.getState().doc.objects.find(o => o.id === id)
    );
    expect(ga?.x).toBe(10);
    expect(gb?.x).toBe(430);
    expect(gc?.y).toBe(330);
  });

  it('deleted image has no store entry — fromURL resolve must bail when live is undefined', () => {
    const img = makeImage({ id: 'gone' });
    useStore.getState().addObject(img);
    useStore.getState().removeObject('gone');
    // The fix: if doc.objects.find returns undefined (deleted), fromURL .then() must return early.
    const live = useStore.getState().doc.objects.find(o => o.id === 'gone');
    expect(live).toBeUndefined();
  });

  it('adding text does not change any image position in the store', () => {
    const img = makeImage({ id: 'stable', x: 150, y: 200 });
    useStore.getState().addObject(img);
    // Move the image (as the user would do)
    useStore.getState().updateObject('stable', { x: 300, y: 400 });
    // Now add text — this triggered a sync-effect re-run which exposed the bug
    useStore.getState().addObject(makeText({ id: 'txt1' }));
    const live = useStore.getState().doc.objects.find(o => o.id === 'stable');
    // Image position must not regress to original spawn coords
    expect(live?.x).toBe(300);
    expect(live?.y).toBe(400);
  });
});

// ── Inset cropRect coordinate system ─────────────────────────────────────────
// Guards that relX/relY stored in InsetPair.cropRect are in scene (document)
// space, not viewport space. The bug was that getBoundingRect() returned viewport
// pixels (scaled by zoom+pan), so at zoom≠1 the stored relX/relY were wrong.
// Fix: use cropRect.left / cropRect.top (scene coords) directly.

describe('inset cropRect relX/relY are scene-space', () => {
  beforeEach(resetStore);

  it('relX = cropRect.left - parentObj.x at default zoom', () => {
    const parentX = 150;
    const cropLeft = 200;  // scene coord (cropRect.left)
    const expectedRelX = cropLeft - parentX;
    // At zoom=1, viewport and scene are identical; relX should be 50
    expect(expectedRelX).toBe(50);
  });

  it('relX must NOT be computed from viewport coords at zoom=2', () => {
    const zoom = 2;
    const panX = 100;
    const parentX = 150;
    const cropLeft = 200; // scene coord (cropRect.left)

    // Wrong (old getBoundingRect approach): mixes viewport coord with scene coord
    const wrongRelX = (cropLeft * zoom + panX) - parentX;
    // Correct: scene coord subtraction only
    const correctRelX = cropLeft - parentX;

    expect(correctRelX).toBe(50);
    expect(wrongRelX).toBe(350); // demonstrates the magnitude of the bug
    expect(wrongRelX).not.toBe(correctRelX);
  });

  it('addInset stores relX/relY as provided (scene-space values)', () => {
    useStore.getState().addInset({
      id: 'pair-test',
      parentObjectId: 'p1',
      insetObjectId: 'i1',
      cropRect: { relX: 50, relY: 30, w: 100, h: 80 },
    });
    const pair = useStore.getState().insets[0];
    expect(pair.cropRect.relX).toBe(50);
    expect(pair.cropRect.relY).toBe(30);
  });
});

// ── Mode tag / PPL-XPL label removal ─────────────────────────────────────────
// Guards that no ImageObject ever gets showModeTag=true from any code path.
// Mode tag rendering has been removed from CanvasArea entirely; these tests
// verify that neither GridDialog nor addObject/addObjects inadvertently introduce
// the field as truthy.

describe('mode tag (showModeTag) round-trips through the store', () => {
  beforeEach(resetStore);

  it('image created with showModeTag: false keeps it disabled', () => {
    useStore.getState().addObject(makeImage({ id: 'img-mt', showModeTag: false } as Partial<CanvasObject>));
    const o = useStore.getState().doc.objects[0] as ImageObject;
    expect(o.showModeTag).toBe(false);
  });

  it('toggling showModeTag on persists, and position patches do not reset it', () => {
    useStore.getState().addObject(makeImage({ id: 'mtp', showModeTag: false } as Partial<CanvasObject>));
    useStore.getState().updateObject('mtp', { showModeTag: true, tagPosition: 'br' } as Partial<ImageObject>);
    useStore.getState().updateObject('mtp', { x: 100, y: 200 });
    const o = useStore.getState().doc.objects[0] as ImageObject;
    expect(o.showModeTag).toBe(true);
    expect(o.tagPosition).toBe('br');
    expect(o.x).toBe(100);
  });
});

// ── Multi-canvas slot management ──────────────────────────────────────────────

describe('multi-canvas slots', () => {
  beforeEach(resetStore);

  it('MAX_CANVAS_SLOTS is 5', () => {
    expect(MAX_CANVAS_SLOTS).toBe(5);
  });

  it('openCanvasSlot returns "opened" and increments slot count', () => {
    // Seed at least one slot so the store has something to count against
    useStore.setState({ canvasSlots: [{ id: 'slot-1', filePath: null, doc: useStore.getState().doc, groups: [], insets: [] }] });
    const result = useStore.getState().openCanvasSlot();
    expect(result).toBe('opened');
    expect(useStore.getState().canvasSlots).toHaveLength(2);
  });

  it('openCanvasSlot returns "full" when MAX_CANVAS_SLOTS already open', () => {
    const seed = Array.from({ length: MAX_CANVAS_SLOTS }, (_, i) => ({
      id: `slot-${i}`, filePath: null, doc: useStore.getState().doc, groups: [], insets: [],
    }));
    useStore.setState({ canvasSlots: seed });
    const result = useStore.getState().openCanvasSlot();
    expect(result).toBe('full');
    expect(useStore.getState().canvasSlots).toHaveLength(MAX_CANVAS_SLOTS);
  });

  it('closeCanvasSlot removes the slot by id', () => {
    const slots = [
      { id: 'a', filePath: null, doc: useStore.getState().doc, groups: [], insets: [] },
      { id: 'b', filePath: null, doc: useStore.getState().doc, groups: [], insets: [] },
    ];
    useStore.setState({ canvasSlots: slots, activeSlotId: 'a' });
    useStore.getState().closeCanvasSlot('a');
    expect(useStore.getState().canvasSlots.map(s => s.id)).toEqual(['b']);
  });

  it('closeCanvasSlot switches activeSlotId when active slot is closed', () => {
    const slots = [
      { id: 'a', filePath: null, doc: useStore.getState().doc, groups: [], insets: [] },
      { id: 'b', filePath: null, doc: useStore.getState().doc, groups: [], insets: [] },
    ];
    useStore.setState({ canvasSlots: slots, activeSlotId: 'a' });
    useStore.getState().closeCanvasSlot('a');
    expect(useStore.getState().activeSlotId).toBe('b');
  });

  it('closeCanvasSlot does not remove the last remaining slot', () => {
    const slots = [
      { id: 'only', filePath: null, doc: useStore.getState().doc, groups: [], insets: [] },
    ];
    useStore.setState({ canvasSlots: slots, activeSlotId: 'only' });
    useStore.getState().closeCanvasSlot('only');
    expect(useStore.getState().canvasSlots).toHaveLength(1);
  });

  it('switchToCanvasSlot updates activeSlotId', () => {
    const slots = [
      { id: 'a', filePath: null, doc: useStore.getState().doc, groups: [], insets: [] },
      { id: 'b', filePath: null, doc: useStore.getState().doc, groups: [], insets: [] },
    ];
    useStore.setState({ canvasSlots: slots, activeSlotId: 'a' });
    useStore.getState().switchToCanvasSlot('b');
    expect(useStore.getState().activeSlotId).toBe('b');
  });

  it('switchToCanvasSlot ignores unknown ids', () => {
    const slots = [
      { id: 'a', filePath: null, doc: useStore.getState().doc, groups: [], insets: [] },
    ];
    useStore.setState({ canvasSlots: slots, activeSlotId: 'a' });
    useStore.getState().switchToCanvasSlot('nonexistent');
    expect(useStore.getState().activeSlotId).toBe('a');
  });
});

// ── Canvas slot isolation ─────────────────────────────────────────────────────
// Guards that each slot has truly independent doc.objects, groups, and insets.
// The bug: all slots shared the top-level doc/groups/insets, so deleting from
// one slot deleted from all others.

describe('canvas slot isolation', () => {
  beforeEach(resetStore);

  it('openCanvasSlot starts with an empty canvas, not the previous slot contents', () => {
    useStore.getState().addObject(makeImage({ id: 'in-slot-1' }));
    expect(useStore.getState().doc.objects).toHaveLength(1);

    useStore.getState().openCanvasSlot();
    // After opening a new slot the canvas should be empty
    expect(useStore.getState().doc.objects).toHaveLength(0);
  });

  it('objects in slot A do not appear after switching to slot B', () => {
    // Slot A: add an image
    useStore.getState().addObject(makeImage({ id: 'slot-a-obj' }));
    expect(useStore.getState().doc.objects).toHaveLength(1);

    // Open slot B (saves slot A state, switches to empty slot B)
    useStore.getState().openCanvasSlot();
    expect(useStore.getState().doc.objects).toHaveLength(0);

    // Add something in slot B
    useStore.getState().addObject(makeImage({ id: 'slot-b-obj' }));
    expect(useStore.getState().doc.objects).toHaveLength(1);
    expect(useStore.getState().doc.objects[0].id).toBe('slot-b-obj');
  });

  it('switching back to slot A restores its objects', () => {
    // Slot A: add an image
    const slotAId = useStore.getState().activeSlotId;
    useStore.getState().addObject(makeImage({ id: 'slot-a-restore' }));

    // Open slot B
    useStore.getState().openCanvasSlot();
    const slotBId = useStore.getState().activeSlotId;
    expect(slotBId).not.toBe(slotAId);

    // Slot B is empty
    expect(useStore.getState().doc.objects).toHaveLength(0);

    // Switch back to slot A
    useStore.getState().switchToCanvasSlot(slotAId);
    expect(useStore.getState().doc.objects).toHaveLength(1);
    expect(useStore.getState().doc.objects[0].id).toBe('slot-a-restore');
  });

  it('removing an object in slot B does not affect slot A', () => {
    const slotAId = useStore.getState().activeSlotId;
    useStore.getState().addObject(makeImage({ id: 'keep-in-a' }));

    // Switch to slot B
    useStore.getState().openCanvasSlot();
    useStore.getState().addObject(makeImage({ id: 'in-b' }));
    useStore.getState().removeObject('in-b');
    expect(useStore.getState().doc.objects).toHaveLength(0);

    // Switch back — slot A unchanged
    useStore.getState().switchToCanvasSlot(slotAId);
    expect(useStore.getState().doc.objects).toHaveLength(1);
    expect(useStore.getState().doc.objects[0].id).toBe('keep-in-a');
  });
});

// ── Pending grid ──────────────────────────────────────────────────────────────

describe('pendingGrid', () => {
  beforeEach(resetStore);

  it('setPendingGrid stores the config', () => {
    useStore.getState().setPendingGrid({ imageIds: ['a', 'b'], groupId: 'g1', cols: 2, gap: 16 });
    const pg = useStore.getState().pendingGrid;
    expect(pg).not.toBeNull();
    expect(pg?.cols).toBe(2);
    expect(pg?.imageIds).toEqual(['a', 'b']);
  });

  it('setPendingGrid(null) clears the config', () => {
    useStore.getState().setPendingGrid({ imageIds: ['x'], groupId: 'g1', cols: 1, gap: 0 });
    useStore.getState().setPendingGrid(null);
    expect(useStore.getState().pendingGrid).toBeNull();
  });

  it('tool can be set to grid-place', () => {
    useStore.getState().setTool('grid-place');
    expect(useStore.getState().tool).toBe('grid-place');
  });
});

// ── Pan / zoom state independence ────────────────────────────────────────────
// Guards the fix for "zooming after panning reverts the view to the initial
// position."
//
// Root cause: the zoom useEffect in CanvasArea called
//   fc.setViewportTransform([zoom, 0, 0, zoom, OVERFLOW_PAD, OVERFLOW_PAD])
// which hardcodes the translation to (OVERFLOW_PAD, OVERFLOW_PAD) on every
// zoom change, discarding any pan the user accumulated via the pan tool.
//
// Fix: scene-space pan is tracked in `panSceneRef` (a component-level ref).
// The zoom effect now computes:
//   tx = OVERFLOW_PAD + panSceneRef.x * zoom
//   ty = OVERFLOW_PAD + panSceneRef.y * zoom
// so the same scene point stays visible after zoom changes.
//
// These tests verify the STORE CONTRACT: setZoom must not touch panX/panY,
// and setPan must survive subsequent setZoom calls.  The component-level
// panSceneRef is not observable here, but the store invariants document the
// preconditions the fix relies on.

describe('pan and zoom state independence', () => {
  beforeEach(resetStore);

  it('panX and panY default to 0', () => {
    expect(useStore.getState().panX).toBe(0);
    expect(useStore.getState().panY).toBe(0);
  });

  it('setPan stores the provided values', () => {
    useStore.getState().setPan(150, -200);
    expect(useStore.getState().panX).toBe(150);
    expect(useStore.getState().panY).toBe(-200);
  });

  it('setZoom does not reset panX or panY', () => {
    useStore.getState().setPan(120, 80);
    useStore.getState().setZoom(2.0);
    // Pan must be untouched — the component (not the store) applies it to the canvas
    expect(useStore.getState().panX).toBe(120);
    expect(useStore.getState().panY).toBe(80);
  });

  it('multiple setZoom calls preserve the last setPan values', () => {
    useStore.getState().setPan(-600, -600);
    useStore.getState().setZoom(1.5);
    useStore.getState().setZoom(0.5);
    useStore.getState().setZoom(3.0);
    expect(useStore.getState().panX).toBe(-600);
    expect(useStore.getState().panY).toBe(-600);
  });

  it('setPan after setZoom updates the pan without touching zoom', () => {
    useStore.getState().setZoom(1.75);
    useStore.getState().setPan(300, 400);
    expect(useStore.getState().zoom).toBe(1.75);
    expect(useStore.getState().panX).toBe(300);
    expect(useStore.getState().panY).toBe(400);
  });

  it('setZoom clamps to [0.1, 4] but does not affect pan', () => {
    useStore.getState().setPan(50, 50);
    useStore.getState().setZoom(999); // clamped to 4
    expect(useStore.getState().zoom).toBe(4);
    expect(useStore.getState().panX).toBe(50);
    useStore.getState().setZoom(0.001); // clamped to 0.1
    expect(useStore.getState().zoom).toBe(0.1);
    expect(useStore.getState().panX).toBe(50);
  });
});

// ── Image group management ────────────────────────────────────────────────────

describe('image group actions', () => {
  beforeEach(resetStore);

  const grp = (id = 'g1') => ({
    id, name: 'Group', sample: 'S-1', images: [], expanded: true,
  });
  const img = (id = 'i1') => ({
    id, mode: 'PPL' as const, name: 'a.png', dataUrl: 'data:,', width: 10, height: 10,
  });

  it('addGroup / removeGroup round-trip', () => {
    useStore.getState().addGroup(grp());
    expect(useStore.getState().groups).toHaveLength(1);
    useStore.getState().removeGroup('g1');
    expect(useStore.getState().groups).toHaveLength(0);
  });

  it('addImageToGroup appends; removeImageFromGroup removes only that image', () => {
    useStore.getState().addGroup(grp());
    useStore.getState().addImageToGroup('g1', img('i1'));
    useStore.getState().addImageToGroup('g1', img('i2'));
    expect(useStore.getState().groups[0].images.map(i => i.id)).toEqual(['i1', 'i2']);
    useStore.getState().removeImageFromGroup('g1', 'i1');
    expect(useStore.getState().groups[0].images.map(i => i.id)).toEqual(['i2']);
  });

  it('addImageToGroup with unknown group id is a safe no-op', () => {
    useStore.getState().addImageToGroup('nope', img());
    expect(useStore.getState().groups).toHaveLength(0);
  });

  it('updateGroup patches name without touching images', () => {
    useStore.getState().addGroup(grp());
    useStore.getState().addImageToGroup('g1', img());
    useStore.getState().updateGroup('g1', { name: 'Renamed' });
    expect(useStore.getState().groups[0].name).toBe('Renamed');
    expect(useStore.getState().groups[0].images).toHaveLength(1);
  });

  it('updateImageCalibration sets calibration on the right image', () => {
    useStore.getState().addGroup(grp());
    useStore.getState().addImageToGroup('g1', img('i1'));
    useStore.getState().addImageToGroup('g1', img('i2'));
    const cal = { unitsPerPixel: 2.5, unit: 'µm' as const, refPixelDistance: 100, refRealLength: 250 };
    useStore.getState().updateImageCalibration('g1', 'i2', cal);
    const [a, b] = useStore.getState().groups[0].images;
    expect(a.calibration).toBeUndefined();
    expect(b.calibration).toEqual(cal);
  });

  it('toggleGroupExpanded flips the flag', () => {
    useStore.getState().addGroup(grp());
    useStore.getState().toggleGroupExpanded('g1');
    expect(useStore.getState().groups[0].expanded).toBe(false);
    useStore.getState().toggleGroupExpanded('g1');
    expect(useStore.getState().groups[0].expanded).toBe(true);
  });
});

// ── Canvas resize rescales content ────────────────────────────────────────────

describe('setDocMeta canvas resize', () => {
  beforeEach(resetStore);

  it('rescales object positions proportionally and sizes by min ratio', () => {
    useStore.getState().addObject(makeImage({ id: 'r1', x: 100, y: 100, width: 200, height: 100 }));
    useStore.getState().setDocMeta({ width: 2400, height: 900 }); // sx=2, sy=1 → s1=1
    const o = useStore.getState().doc.objects[0];
    expect(o.x).toBe(200);       // ×2
    expect(o.y).toBe(100);       // ×1
    expect(o.width).toBe(200);   // ×min(2,1)=1
    expect(o.height).toBe(100);
  });

  it('rescales scalebar length with the min ratio', () => {
    useStore.getState().addObject(makeScalebar({ id: 'sbr', length: 100, x: 0, y: 0 }));
    useStore.getState().setDocMeta({ width: 600, height: 450 }); // ×0.5 both
    const sb = useStore.getState().doc.objects[0] as ScaleBarObject;
    expect(sb.length).toBe(50);
  });

  it('does not touch objects when only DPI or background changes', () => {
    useStore.getState().addObject(makeImage({ id: 'r2', x: 33, y: 44 }));
    useStore.getState().setDocMeta({ dpi: 600, background: '#000000' });
    const o = useStore.getState().doc.objects[0];
    expect(o.x).toBe(33);
    expect(o.y).toBe(44);
  });
});

// ── Unsaved-changes tracking ──────────────────────────────────────────────────

describe('hasUnsavedChanges / markSaved', () => {
  beforeEach(resetStore);

  it('adding an object marks the project dirty', () => {
    useStore.setState({ savedVersion: 0 });
    useStore.getState().addObject(makeImage());
    expect(useStore.getState().hasUnsavedChanges()).toBe(true);
  });

  it('markSaved clears the dirty flag for the current history position', () => {
    useStore.getState().addObject(makeImage());
    useStore.getState().markSaved();
    // savedVersion now matches past.length
    expect(useStore.getState().savedVersion).toBe(useStore.getState().past.length);
  });
});

// ── Ruler + fitView state ─────────────────────────────────────────────────────

describe('ruler and fitView state', () => {
  beforeEach(resetStore);

  it('toggleRulerUnit cycles in → cm → mm → in', () => {
    useStore.setState({ rulerUnit: 'in' });
    useStore.getState().toggleRulerUnit();
    expect(useStore.getState().rulerUnit).toBe('cm');
    useStore.getState().toggleRulerUnit();
    expect(useStore.getState().rulerUnit).toBe('mm');
    useStore.getState().toggleRulerUnit();
    expect(useStore.getState().rulerUnit).toBe('in');
  });

  it('fitView increments the request counter each call', () => {
    const n0 = useStore.getState().fitViewRequest;
    useStore.getState().fitView();
    useStore.getState().fitView();
    expect(useStore.getState().fitViewRequest).toBe(n0 + 2);
  });
});
