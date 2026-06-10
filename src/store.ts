import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { get as idbGet, set as idbSet } from 'idb-keyval';
import type {
  CanvasDoc, CanvasObject, ImageGroup, ThinSectionImage, Tool, InsetPair, ImageCalibration, CanvasSlot, PendingGrid,
} from './types';

export const MAX_CANVAS_SLOTS = 5;

// ── Persistence ────────────────────────────────────────────────────────────
const IDB_KEY = 'petrofigure-state-v1';

export interface PersistedState {
  doc:    CanvasDoc;
  groups: ImageGroup[];
  insets: InsetPair[];
  /** File format version for forward-compat */
  version?: number;
}

const CURRENT_VERSION = 1;

let _persistTimer: ReturnType<typeof setTimeout> | null = null;

/** Save serialisable state to IndexedDB — debounced 400 ms to avoid write-per-keystroke. */
function persist(state: PersistedState) {
  if (typeof indexedDB === 'undefined') return; // jsdom / SSR guard
  if (_persistTimer) clearTimeout(_persistTimer);
  const snapshot = JSON.parse(JSON.stringify(state));
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    idbSet(IDB_KEY, snapshot).catch(() => {/* quota/private mode */});
  }, 400);
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

/** Download the current project as a .petrofig JSON file. */
export function saveProjectFile() {
  const { doc, groups, insets } = useStore.getState();
  const payload: PersistedState = { doc, groups, insets, version: CURRENT_VERSION };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const safe = doc.title.replace(/[^a-z0-9_-]/gi, '_') || 'project';
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

  // ── Grid placement ────────────────────────────────────────────────────────
  /** Set when GridDialog confirms; cleared by CanvasArea after placement. */
  pendingGrid: PendingGrid | null;
  setPendingGrid: (g: PendingGrid | null) => void;

  // ── Multi-canvas slot management (up to MAX_CANVAS_SLOTS) ────────────────
  /** All currently open canvas slots (at least 1 — the default slot). */
  canvasSlots: CanvasSlot[];
  /** ID of the slot currently displayed in the canvas area. */
  activeSlotId: string;
  /**
   * Open a new empty canvas slot. Returns 'full' if MAX_CANVAS_SLOTS reached
   * (caller should prompt user to close a slot first).
   */
  openCanvasSlot: () => 'opened' | 'full';
  /** Close a canvas slot by id. Switches active slot if the closed one was active. */
  closeCanvasSlot: (id: string) => void;
  /** Make the slot with the given id the active canvas. NOT YET WIRED to CanvasArea. */
  switchToCanvasSlot: (id: string) => void;
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
      // Merge doc to preserve any new fields added since the file was saved
      Object.assign(s.doc, saved.doc);
      // Guard against older file formats that may omit these arrays
      if (!Array.isArray(s.doc.objects)) s.doc.objects = [];
      s.groups = (saved.groups ?? []) as typeof s.groups;
      s.insets  = (saved.insets  ?? []) as typeof s.insets;
      // Keep the active slot's snapshot in sync so slot-switching restores correctly
      const activeSlot = s.canvasSlots.find(sl => sl.id === s.activeSlotId);
      if (activeSlot) {
        activeSlot.doc    = JSON.parse(JSON.stringify(s.doc));
        activeSlot.groups = JSON.parse(JSON.stringify(s.groups));
        activeSlot.insets = JSON.parse(JSON.stringify(s.insets));
      }
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
    addObjects: (objs) => set((s) => {
      if (objs.length === 0) return;
      pushHistory(s);
      for (const obj of objs) s.doc.objects.push(obj);
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

    pendingGrid: null,
    setPendingGrid: (g) => set((s) => { s.pendingGrid = g; }),

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
      persist({ doc: s.doc as CanvasDoc, groups: s.groups as ImageGroup[], insets: s.insets as InsetPair[] });
    }),

    // ── Multi-canvas slots ────────────────────────────────────────────────
    // Each slot owns its own doc/groups/insets snapshot.  The top-level
    // doc/groups/insets are always the ACTIVE slot's live data.  On slot
    // switch we snapshot the current state into the leaving slot and restore
    // the target slot's snapshot, so each page is fully independent.
    canvasSlots: [
      { id: 'slot-default', filePath: null, doc: defaultDoc, groups: [], insets: [] },
    ] as CanvasSlot[],
    activeSlotId: 'slot-default',

    openCanvasSlot: () => {
      let result: 'opened' | 'full' = 'full';
      set((s) => {
        if (s.canvasSlots.length >= MAX_CANVAS_SLOTS) return;

        // Snapshot current live state into the currently active slot
        const cur = s.canvasSlots.find(sl => sl.id === s.activeSlotId);
        if (cur) {
          cur.doc    = JSON.parse(JSON.stringify(s.doc));
          cur.groups = JSON.parse(JSON.stringify(s.groups));
          cur.insets = JSON.parse(JSON.stringify(s.insets));
        }

        const id = `slot-${Date.now()}`;
        const newDoc: CanvasDoc = {
          ...defaultDoc,
          id: `doc-${id}`,
          title: 'Untitled Figure',
          objects: [],
          metadata: { ...defaultDoc.metadata },
        };
        const newSlot: CanvasSlot = { id, filePath: null, doc: newDoc, groups: [], insets: [] };
        s.canvasSlots.push(newSlot);

        // Switch live state to the new empty slot
        s.doc    = newDoc as typeof s.doc;
        s.groups = [] as typeof s.groups;
        s.insets = [] as typeof s.insets;
        s.activeSlotId = id;

        result = 'opened';
      });
      return result;
    },

    closeCanvasSlot: (id) => set((s) => {
      if (s.canvasSlots.length <= 1) return; // always keep at least one
      const wasActive = s.activeSlotId === id;
      s.canvasSlots = s.canvasSlots.filter(sl => sl.id !== id);
      if (wasActive) {
        const next = s.canvasSlots[s.canvasSlots.length - 1];
        s.activeSlotId = next.id;
        s.doc    = JSON.parse(JSON.stringify(next.doc));
        s.groups = JSON.parse(JSON.stringify(next.groups));
        s.insets = JSON.parse(JSON.stringify(next.insets));
      }
    }),

    switchToCanvasSlot: (id) => set((s) => {
      if (!s.canvasSlots.some(sl => sl.id === id)) return;
      if (id === s.activeSlotId) return;

      // Save current live state into the leaving slot
      const cur = s.canvasSlots.find(sl => sl.id === s.activeSlotId);
      if (cur) {
        cur.doc    = JSON.parse(JSON.stringify(s.doc));
        cur.groups = JSON.parse(JSON.stringify(s.groups));
        cur.insets = JSON.parse(JSON.stringify(s.insets));
      }

      // Restore target slot's snapshot
      const target = s.canvasSlots.find(sl => sl.id === id)!;
      s.doc    = JSON.parse(JSON.stringify(target.doc));
      s.groups = JSON.parse(JSON.stringify(target.groups));
      s.insets = JSON.parse(JSON.stringify(target.insets));
      s.activeSlotId = id;
    }),
  }))
);

// Expose the store in dev builds for debugging and E2E testing.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __store?: typeof useStore }).__store = useStore;
}
