import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import type {
  CanvasDoc, CanvasObject, ImageGroup, ThinSectionImage, Tool, InsetPair, ImageCalibration,
} from './types';

// ── Persistence ────────────────────────────────────────────────────────────
const IDB_KEY = 'petrofigure-state-v1';

interface PersistedState {
  doc:    CanvasDoc;
  groups: ImageGroup[];
  insets: InsetPair[];
}

/** Save serialisable state to IndexedDB (fire-and-forget). */
function persist(state: PersistedState) {
  if (typeof indexedDB === 'undefined') return; // jsdom / SSR guard
  idbSet(IDB_KEY, JSON.parse(JSON.stringify(state))).catch(() => {/* quota/private mode */});
}

/** Load previously saved state from IndexedDB. Returns null on first run or error. */
export async function loadPersistedState(): Promise<PersistedState | null> {
  try {
    const saved = await idbGet<PersistedState>(IDB_KEY);
    return saved ?? null;
  } catch {
    return null;
  }
}

type Snapshot = { objects: CanvasObject[]; insets: InsetPair[] };

function snap(objects: CanvasObject[], insets: InsetPair[]): Snapshot {
  return {
    objects: JSON.parse(JSON.stringify(objects)),
    insets:  JSON.parse(JSON.stringify(insets)),
  };
}

// Call inside immer `set` callback before any mutation
function pushHistory(s: {
  past: Snapshot[]; future: Snapshot[];
  doc: { objects: CanvasObject[] }; insets: InsetPair[];
}) {
  s.past.push(snap(s.doc.objects as CanvasObject[], s.insets as InsetPair[]));
  if (s.past.length > 60) s.past.shift();
  s.future = [];
}

export interface AppState {
  // Calibration queue — images waiting to be calibrated after upload
  calibrationQueue: { groupId: string; image: ThinSectionImage }[];
  pushCalibration:         (groupId: string, image: ThinSectionImage) => void;
  shiftCalibration:        () => void;
  updateImageCalibration:  (groupId: string, imageId: string, cal: ImageCalibration) => void;

  // Library
  groups: ImageGroup[];
  addGroup:              (group: ImageGroup) => void;
  updateGroup:           (id: string, patch: Partial<ImageGroup>) => void;
  removeGroup:           (id: string) => void;
  toggleGroupExpanded:   (id: string) => void;
  addImageToGroup:       (groupId: string, image: ThinSectionImage) => void;
  removeImageFromGroup:  (groupId: string, imageId: string) => void;

  // Document metadata
  doc: CanvasDoc;
  setDocMeta:     (patch: Partial<CanvasDoc>) => void;
  updateMetadata: (patch: Partial<CanvasDoc['metadata']>) => void;

  // Canvas objects
  addObject:       (obj: CanvasObject) => void;
  updateObject:    (id: string, patch: Partial<CanvasObject>) => void;
  removeObject:    (id: string) => void;
  reorderObjects:  (ids: string[]) => void;
  duplicateObject: (id: string) => void;
  batchUpdateObjects: (updates: { id: string; patch: Partial<CanvasObject> }[]) => void;

  // Inset pairs
  insets:     InsetPair[];
  addInset:   (pair: InsetPair) => void;
  removeInset:(id: string) => void;

  // Undo / redo
  past:    Snapshot[];
  future:  Snapshot[];
  undo:    () => void;
  redo:    () => void;

  // Selection
  selectedId:    string | null;
  setSelectedId: (id: string | null) => void;

  // Tool
  tool:    Tool;
  setTool: (t: Tool) => void;

  // Zoom / pan
  zoom:   number;
  setZoom:(z: number) => void;
  panX:   number;
  panY:   number;
  setPan: (x: number, y: number) => void;

  // UI
  showMetadataPanel:    boolean;
  toggleMetadataPanel:  () => void;
  showLayersPanel:      boolean;
  toggleLayersPanel:    () => void;
  showRulers:           boolean;
  toggleRulers:         () => void;

  /** Restore state from IndexedDB on app startup */
  rehydrate: (saved: PersistedState) => void;
}

const defaultDoc: CanvasDoc = {
  id: 'doc-1',
  title: 'Untitled Figure',
  width: 1200,
  height: 900,
  dpi: 300,
  background: '#ffffff',
  objects: [],
  metadata: {
    authors: '', affiliation: '', sampleInfo: '', locality: '', notes: '',
    date: new Date().toISOString().slice(0, 10),
  },
};

export const useStore = create<AppState>()(
  immer((set) => ({
    // ── Calibration queue ─────────────────────────────────────────────────
    calibrationQueue: [],
    pushCalibration: (groupId, image) => set((s) => {
      s.calibrationQueue.push({ groupId, image });
    }),
    shiftCalibration: () => set((s) => { s.calibrationQueue.shift(); }),
    updateImageCalibration: (groupId, imageId, cal) => set((s) => {
      const g = s.groups.find(g => g.id === groupId);
      if (!g) return;
      const img = g.images.find(i => i.id === imageId);
      if (img) img.calibration = cal;
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),

    rehydrate: (saved) => set((s) => {
      s.doc    = saved.doc    as typeof s.doc;
      s.groups = saved.groups as typeof s.groups;
      s.insets = saved.insets as typeof s.insets;
    }),

    // ── Library ──────────────────────────────────────────────────────────
    groups: [],
    addGroup: (group) => set((s) => {
      s.groups.push(group);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),
    updateGroup: (id, patch) => set((s) => {
      const i = s.groups.findIndex(g => g.id === id);
      if (i !== -1) Object.assign(s.groups[i], patch);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),
    removeGroup: (id) => set((s) => {
      s.groups = s.groups.filter(g => g.id !== id);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),
    toggleGroupExpanded: (id) => set((s) => {
      const i = s.groups.findIndex(g => g.id === id);
      if (i !== -1) s.groups[i].expanded = !s.groups[i].expanded;
      // No persist for UI-only state like expanded
    }),
    addImageToGroup: (groupId, image) => set((s) => {
      const i = s.groups.findIndex(g => g.id === groupId);
      if (i !== -1) s.groups[i].images.push(image);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),
    removeImageFromGroup: (groupId, imageId) => set((s) => {
      const i = s.groups.findIndex(g => g.id === groupId);
      if (i !== -1) s.groups[i].images = s.groups[i].images.filter(img => img.id !== imageId);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),

    // ── Document ──────────────────────────────────────────────────────────
    doc: defaultDoc,
    setDocMeta: (patch) => set((s) => {
      const oldW = s.doc.width;
      const oldH = s.doc.height;
      Object.assign(s.doc, patch);
      const newW = s.doc.width;
      const newH = s.doc.height;
      if ((newW !== oldW || newH !== oldH) && s.doc.objects.length > 0) {
        const sx = newW / oldW;
        const sy = newH / oldH;
        const s1 = Math.min(sx, sy);
        s.doc.objects.forEach(obj => {
          obj.x      = Math.round(obj.x      * sx);
          obj.y      = Math.round(obj.y      * sy);
          obj.width  = Math.round(obj.width  * s1);
          obj.height = Math.round(obj.height * s1);
          if (obj.type === 'scalebar') obj.length = Math.round(obj.length * s1);
        });
      }
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),
    updateMetadata: (patch) => set((s) => {
      Object.assign(s.doc.metadata, patch);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),

    // ── Canvas objects ────────────────────────────────────────────────────
    addObject: (obj) => set((s) => {
      pushHistory(s);
      s.doc.objects.push(obj);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),
    updateObject: (id, patch) => set((s) => {
      const structural = ['x','y','width','height','rotation'].some(k => k in patch);
      if (structural) pushHistory(s);
      const i = s.doc.objects.findIndex(o => o.id === id);
      if (i !== -1) Object.assign(s.doc.objects[i], patch);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),
    removeObject: (id) => set((s) => {
      pushHistory(s);
      s.doc.objects = s.doc.objects.filter(o => o.id !== id);
      s.insets = s.insets.filter(p => p.parentObjectId !== id && p.insetObjectId !== id);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),
    reorderObjects: (ids) => set((s) => {
      pushHistory(s);
      s.doc.objects = ids
        .map(id => s.doc.objects.find(o => o.id === id))
        .filter(Boolean) as typeof s.doc.objects;
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),
    batchUpdateObjects: (updates) => set((s) => {
      pushHistory(s);
      for (const { id, patch } of updates) {
        const i = s.doc.objects.findIndex(o => o.id === id);
        if (i !== -1) Object.assign(s.doc.objects[i], patch);
      }
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),

    duplicateObject: (id) => set((s) => {
      const obj = s.doc.objects.find(o => o.id === id);
      if (!obj) return;
      pushHistory(s);
      const clone = JSON.parse(JSON.stringify(obj));
      clone.id    = `obj-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      clone.x    += 20;
      clone.y    += 20;
      clone.label = clone.label + ' (copy)';
      s.doc.objects.push(clone);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),

    // ── Insets ────────────────────────────────────────────────────────────
    insets: [],
    addInset: (pair) => set((s) => {
      pushHistory(s);
      s.insets.push(pair);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),
    removeInset: (id) => set((s) => {
      pushHistory(s);
      s.insets = s.insets.filter(p => p.id !== id);
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),

    // ── Undo / redo ───────────────────────────────────────────────────────
    past:   [],
    future: [],

    undo: () => set((s) => {
      if (s.past.length === 0) return;
      const prev = s.past[s.past.length - 1];
      s.past.splice(s.past.length - 1, 1);
      s.future.push(snap(s.doc.objects as CanvasObject[], s.insets as InsetPair[]));
      if (s.future.length > 60) s.future.shift();
      s.doc.objects = prev.objects as typeof s.doc.objects;
      s.insets      = prev.insets  as typeof s.insets;
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),

    redo: () => set((s) => {
      if (s.future.length === 0) return;
      const next = s.future[s.future.length - 1];
      s.future.splice(s.future.length - 1, 1);
      s.past.push(snap(s.doc.objects as CanvasObject[], s.insets as InsetPair[]));
      if (s.past.length > 60) s.past.shift();
      s.doc.objects = next.objects as typeof s.doc.objects;
      s.insets      = next.insets  as typeof s.insets;
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),

    // ── Selection / tool / zoom ───────────────────────────────────────────
    selectedId: null,
    setSelectedId: (id) => set((s) => { s.selectedId = id; }),

    tool: 'select',
    setTool: (t) => set((s) => { s.tool = t; }),

    zoom: 1,
    setZoom: (z) => set((s) => { s.zoom = Math.max(0.1, Math.min(4, z)); }),
    panX: 0, panY: 0,
    setPan: (x, y) => set((s) => { s.panX = x; s.panY = y; }),

    showMetadataPanel: false,
    toggleMetadataPanel: () => set((s) => { s.showMetadataPanel = !s.showMetadataPanel; }),
    showLayersPanel: false,
    toggleLayersPanel: () => set((s) => { s.showLayersPanel = !s.showLayersPanel; }),
    showRulers: false,
    toggleRulers: () => set((s) => { s.showRulers = !s.showRulers; }),
  }))
);
