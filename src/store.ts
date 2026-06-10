import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import type {
  CanvasDoc, CanvasObject, ImageGroup, ThinSectionImage, Tool, InsetPair, ImageCalibration,
} from './types';

// ── Multi-canvas ───────────────────────────────────────────────────────────
export const MAX_CANVAS_SLOTS = 10;

export interface CanvasSlot {
  id:      string;
  doc:     CanvasDoc;
  insets:  InsetPair[];
  past:    { objects: CanvasObject[]; insets: InsetPair[] }[];
  future:  { objects: CanvasObject[]; insets: InsetPair[] }[];
}

// ── Persistence ────────────────────────────────────────────────────────────
const IDB_KEY = 'petrofigure-state-v2';
const IDB_KEY_V1 = 'petrofigure-state-v1';

export interface PersistedState {
  doc:    CanvasDoc;
  groups: ImageGroup[];
  insets: InsetPair[];
  /** File format version for forward-compat */
  version?: number;
  /** v2: all open canvases */
  canvases?:      CanvasSlot[];
  activeCanvasId?: string;
}

const CURRENT_VERSION = 1;

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Save serialisable state to IndexedDB — debounced 400 ms to avoid write-per-keystroke. */
function persist(state: PersistedState) {
  if (typeof indexedDB === 'undefined') return; // jsdom / SSR guard
  if (_persistTimer) clearTimeout(_persistTimer);
  // Don't JSON.parse/stringify here — that blocks on large image data; Immer state is frozen
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    idbSet(IDB_KEY, JSON.parse(JSON.stringify(state))).catch(() => {/* quota/private mode */});
  }, 400);
}

/** Load previously saved state from IndexedDB. Returns null on first run or error. */
export async function loadPersistedState(): Promise<PersistedState | null> {
  try {
    const saved = await idbGet<PersistedState>(IDB_KEY);
    if (saved) return saved;
    // Migrate from v1 (single-canvas)
    const v1 = await idbGet<PersistedState>(IDB_KEY_V1);
    return v1 ?? null;
  } catch {
    return null;
  }
}

/** Download the current project as a .petrofig JSON file. */
export function saveProjectFile() {
  const state = useStore.getState();
  const payload: PersistedState = buildPersist(state);
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const safe = state.doc.title.replace(/[^a-z0-9_-]/gi, '_') || 'project';
  a.href     = url;
  a.download = `${safe}.petrofig`;
  a.click();
  URL.revokeObjectURL(url);
  useStore.getState().markSaved();
}

/** Open a .petrofig file and rehydrate the store from it. */
export function openProjectFile(): Promise<void> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = '.petrofig,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(); return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text) as PersistedState;
        if (!data.doc || !Array.isArray(data.groups)) throw new Error('Invalid project file');
        useStore.getState().rehydrate(data);
        useStore.getState().markSaved();
        // Also persist to IDB so it survives refresh
        persist({ doc: data.doc, groups: data.groups, insets: data.insets ?? [] });
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    input.click();
  });
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
  addObjects:      (objs: CanvasObject[]) => void;
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
  fitView: () => void;
  fitViewRequest: number;

  // UI
  showMetadataPanel:    boolean;
  toggleMetadataPanel:  () => void;
  showLayersPanel:      boolean;
  toggleLayersPanel:    () => void;
  showRulers:           boolean;
  toggleRulers:         () => void;
  rulerUnit:            'in' | 'cm' | 'mm';
  setRulerUnit:         (unit: 'in' | 'cm' | 'mm') => void;
  toggleRulerUnit:      () => void;

  /** Restore state from IndexedDB on app startup */
  rehydrate: (saved: PersistedState) => void;

  /** Track whether there are unsaved changes since last explicit file save */
  savedVersion:     number;
  markSaved:        () => void;
  hasUnsavedChanges: () => boolean;

  /** Path of the currently open .petro file (desktop only) */
  currentFilePath:    string | null;
  setCurrentFilePath: (path: string | null) => void;

  /** Swap canvas width ↔ height and reposition all objects proportionally */
  flipOrientation: () => void;

  // ── Multi-canvas ─────────────────────────────────────────────────────────
  canvases:       CanvasSlot[];
  activeCanvasId: string;
  addCanvas:      () => void;
  removeCanvas:   (id: string) => void;
  switchCanvas:   (id: string) => void;
  renameCanvas:   (id: string, title: string) => void;
}

function makeDefaultDoc(id = 'doc-1', title = 'Untitled Figure'): CanvasDoc {
  return {
    id,
    title,
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
}

const defaultDoc = makeDefaultDoc();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPersist(s: any): PersistedState {
  // Sync active canvas into the canvases array before persisting
  const canvases: CanvasSlot[] = (s.canvases as CanvasSlot[]).map(c =>
    c.id === s.activeCanvasId
      ? { ...c, doc: s.doc as CanvasDoc, insets: s.insets as InsetPair[], past: s.past as Snapshot[], future: s.future as Snapshot[] }
      : c
  );
  return {
    doc: s.doc as CanvasDoc,
    groups: s.groups as ImageGroup[],
    insets: s.insets as InsetPair[],
    version: CURRENT_VERSION,
    canvases,
    activeCanvasId: s.activeCanvasId as string,
  };
}

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
      persist(buildPersist(s));
    }),

    rehydrate: (saved) => set((s) => {
      s.groups = (saved.groups ?? []) as typeof s.groups;

      if (saved.canvases && saved.canvases.length > 0) {
        // v2 format: restore multi-canvas state
        s.canvases = saved.canvases as typeof s.canvases;
        s.activeCanvasId = saved.activeCanvasId ?? saved.canvases[0].id;
        const active = saved.canvases.find(c => c.id === s.activeCanvasId) ?? saved.canvases[0];
        Object.assign(s.doc, active.doc);
        if (!Array.isArray(s.doc.objects)) s.doc.objects = [];
        s.insets  = (active.insets  ?? []) as typeof s.insets;
        s.past    = (active.past    ?? []) as typeof s.past;
        s.future  = (active.future  ?? []) as typeof s.future;
      } else {
        // v1 format: single canvas
        Object.assign(s.doc, saved.doc);
        if (!Array.isArray(s.doc.objects)) s.doc.objects = [];
        s.insets = (saved.insets ?? []) as typeof s.insets;
        s.canvases = [{ id: s.doc.id, doc: s.doc as CanvasDoc, insets: s.insets as InsetPair[], past: [], future: [] }];
        s.activeCanvasId = s.doc.id;
      }
    }),

    // ── Multi-canvas ─────────────────────────────────────────────────────
    canvases: [{ id: defaultDoc.id, doc: defaultDoc, insets: [], past: [], future: [] }] as CanvasSlot[],
    activeCanvasId: defaultDoc.id,

    addCanvas: () => set((s) => {
      if (s.canvases.length >= MAX_CANVAS_SLOTS) return;
      // Save active canvas first
      const idx = s.canvases.findIndex(c => c.id === s.activeCanvasId);
      if (idx !== -1) {
        s.canvases[idx].doc     = s.doc as CanvasDoc;
        s.canvases[idx].insets  = s.insets as InsetPair[];
        s.canvases[idx].past    = s.past as Snapshot[];
        s.canvases[idx].future  = s.future as Snapshot[];
      }
      const newId = `doc-${Date.now()}`;
      const newDoc = makeDefaultDoc(newId, `Figure ${s.canvases.length + 1}`);
      const newSlot: CanvasSlot = { id: newId, doc: newDoc, insets: [], past: [], future: [] };
      s.canvases.push(newSlot);
      // Switch to the new canvas
      s.activeCanvasId = newId;
      s.doc    = newDoc as typeof s.doc;
      s.insets = [] as typeof s.insets;
      s.past   = [] as typeof s.past;
      s.future = [] as typeof s.future;
      s.selectedId = null;
      persist(buildPersist(s));
    }),

    removeCanvas: (id) => set((s) => {
      if (s.canvases.length <= 1) return; // always keep at least one
      const newCanvases = s.canvases.filter(c => c.id !== id);
      s.canvases = newCanvases as typeof s.canvases;
      if (s.activeCanvasId === id) {
        const target = newCanvases[newCanvases.length - 1];
        s.activeCanvasId = target.id;
        s.doc    = target.doc as typeof s.doc;
        s.insets = (target.insets ?? []) as typeof s.insets;
        s.past   = (target.past   ?? []) as typeof s.past;
        s.future = (target.future ?? []) as typeof s.future;
        s.selectedId = null;
      }
      persist(buildPersist(s));
    }),

    switchCanvas: (id) => set((s) => {
      if (id === s.activeCanvasId) return;
      // Save current canvas
      const curIdx = s.canvases.findIndex(c => c.id === s.activeCanvasId);
      if (curIdx !== -1) {
        s.canvases[curIdx].doc     = s.doc as CanvasDoc;
        s.canvases[curIdx].insets  = s.insets as InsetPair[];
        s.canvases[curIdx].past    = s.past as Snapshot[];
        s.canvases[curIdx].future  = s.future as Snapshot[];
      }
      // Load target canvas
      const target = s.canvases.find(c => c.id === id);
      if (!target) return;
      s.activeCanvasId = id;
      s.doc    = target.doc as typeof s.doc;
      s.insets = (target.insets ?? []) as typeof s.insets;
      s.past   = (target.past   ?? []) as typeof s.past;
      s.future = (target.future ?? []) as typeof s.future;
      s.selectedId = null;
    }),

    renameCanvas: (id, title) => set((s) => {
      const slot = s.canvases.find(c => c.id === id);
      if (slot) slot.doc.title = title;
      if (id === s.activeCanvasId) s.doc.title = title;
      persist(buildPersist(s));
    }),

    // ── Library ──────────────────────────────────────────────────────────
    groups: [],
    addGroup: (group) => set((s) => {
      s.groups.push(group);
      persist(buildPersist(s));
    }),
    updateGroup: (id, patch) => set((s) => {
      const i = s.groups.findIndex(g => g.id === id);
      if (i !== -1) Object.assign(s.groups[i], patch);
      persist(buildPersist(s));
    }),
    removeGroup: (id) => set((s) => {
      s.groups = s.groups.filter(g => g.id !== id);
      persist(buildPersist(s));
    }),
    toggleGroupExpanded: (id) => set((s) => {
      const i = s.groups.findIndex(g => g.id === id);
      if (i !== -1) s.groups[i].expanded = !s.groups[i].expanded;
      // No persist for UI-only state like expanded
    }),
    addImageToGroup: (groupId, image) => set((s) => {
      const i = s.groups.findIndex(g => g.id === groupId);
      if (i !== -1) s.groups[i].images.push(image);
      persist(buildPersist(s));
    }),
    removeImageFromGroup: (groupId, imageId) => set((s) => {
      const i = s.groups.findIndex(g => g.id === groupId);
      if (i !== -1) s.groups[i].images = s.groups[i].images.filter(img => img.id !== imageId);
      persist(buildPersist(s));
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
      persist(buildPersist(s));
    }),
    updateMetadata: (patch) => set((s) => {
      Object.assign(s.doc.metadata, patch);
      persist(buildPersist(s));
    }),

    // ── Canvas objects ────────────────────────────────────────────────────
    addObject: (obj) => set((s) => {
      pushHistory(s);
      s.doc.objects.push(obj);
      persist(buildPersist(s));
    }),
    addObjects: (objs) => set((s) => {
      if (objs.length === 0) return;
      pushHistory(s);
      for (const obj of objs) s.doc.objects.push(obj);
      persist(buildPersist(s));
    }),
    updateObject: (id, patch) => set((s) => {
      const structural = ['x','y','width','height','rotation'].some(k => k in patch);
      if (structural) pushHistory(s);
      const i = s.doc.objects.findIndex(o => o.id === id);
      if (i !== -1) Object.assign(s.doc.objects[i], patch);
      persist(buildPersist(s));
    }),
    removeObject: (id) => set((s) => {
      pushHistory(s);
      s.doc.objects = s.doc.objects.filter(o => o.id !== id);
      s.insets = s.insets.filter(p => p.parentObjectId !== id && p.insetObjectId !== id);
      persist(buildPersist(s));
    }),
    reorderObjects: (ids) => set((s) => {
      pushHistory(s);
      s.doc.objects = ids
        .map(id => s.doc.objects.find(o => o.id === id))
        .filter(Boolean) as typeof s.doc.objects;
      persist(buildPersist(s));
    }),
    batchUpdateObjects: (updates) => set((s) => {
      pushHistory(s);
      for (const { id, patch } of updates) {
        const i = s.doc.objects.findIndex(o => o.id === id);
        if (i !== -1) Object.assign(s.doc.objects[i], patch);
      }
      persist(buildPersist(s));
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
      persist(buildPersist(s));
    }),

    // ── Insets ────────────────────────────────────────────────────────────
    insets: [],
    addInset: (pair) => set((s) => {
      pushHistory(s);
      s.insets.push(pair);
      persist(buildPersist(s));
    }),
    removeInset: (id) => set((s) => {
      pushHistory(s);
      s.insets = s.insets.filter(p => p.id !== id);
      persist(buildPersist(s));
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
      persist(buildPersist(s));
    }),

    redo: () => set((s) => {
      if (s.future.length === 0) return;
      const next = s.future[s.future.length - 1];
      s.future.splice(s.future.length - 1, 1);
      s.past.push(snap(s.doc.objects as CanvasObject[], s.insets as InsetPair[]));
      if (s.past.length > 60) s.past.shift();
      s.doc.objects = next.objects as typeof s.doc.objects;
      s.insets      = next.insets  as typeof s.insets;
      persist(buildPersist(s));
    }),

    // ── Selection / tool / zoom ───────────────────────────────────────────
    selectedId: null,
    setSelectedId: (id) => set((s) => { s.selectedId = id; }),

    tool: 'select' as Tool,
    setTool: (t) => set((s) => { s.tool = t; }),

    zoom: 1,
    setZoom: (z) => set((s) => { s.zoom = Math.max(0.1, Math.min(4, z)); }),
    panX: 0, panY: 0,
    setPan: (x, y) => set((s) => { s.panX = x; s.panY = y; }),
    fitViewRequest: 0,
    fitView: () => set((s) => { s.fitViewRequest = s.fitViewRequest + 1; }),

    showMetadataPanel: false,
    toggleMetadataPanel: () => set((s) => { s.showMetadataPanel = !s.showMetadataPanel; }),
    showLayersPanel: false,
    toggleLayersPanel: () => set((s) => { s.showLayersPanel = !s.showLayersPanel; }),
    showRulers: false,
    toggleRulers: () => set((s) => { s.showRulers = !s.showRulers; }),
    rulerUnit: 'mm' as 'in' | 'cm' | 'mm',
    setRulerUnit: (unit) => set((s) => { s.rulerUnit = unit; }),
    toggleRulerUnit: () => set((s) => {
      s.rulerUnit = s.rulerUnit === 'in' ? 'cm' : s.rulerUnit === 'cm' ? 'mm' : 'in';
    }),

    savedVersion: 0,
    markSaved: () => set((s) => { s.savedVersion = s.past.length; }),
    hasUnsavedChanges: (): boolean => {
      const s = useStore.getState() as AppState;
      return s.past.length !== s.savedVersion || s.doc.objects.length > 0 || s.groups.length > 0;
    },

    currentFilePath: null,
    setCurrentFilePath: (path: string | null) => set((s) => { s.currentFilePath = path; }),

    flipOrientation: () => set((s) => {
      const oldW = s.doc.width;
      const oldH = s.doc.height;
      s.doc.width  = oldH;
      s.doc.height = oldW;
      const s1 = Math.min(oldH / oldW, oldW / oldH);
      s.doc.objects.forEach(obj => {
        obj.x      = Math.round(obj.x      * (oldH / oldW));
        obj.y      = Math.round(obj.y      * (oldW / oldH));
        obj.width  = Math.round(obj.width  * s1);
        obj.height = Math.round(obj.height * s1);
        if (obj.type === 'scalebar') obj.length = Math.round(obj.length * s1);
      });
      persist(buildPersist(s));
    }),
  }))
);
