import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { persistSave, persistLoad } from './persistence';
import type {
  CanvasDoc, CanvasObject, ImageGroup, ThinSectionImage, Tool, InsetPair, ImageCalibration,
} from './types';

// ── Persistence ────────────────────────────────────────────────────────────

export interface PageData {
  doc: CanvasDoc;
  insets: InsetPair[];
}

export interface PersistedState {
  pages: PageData[];
  activePageId: string;
  groups: ImageGroup[];
}

export async function loadPersistedState(): Promise<PersistedState | null> {
  return persistLoad();
}

type Snapshot = { objects: CanvasObject[]; insets: InsetPair[] };

function snap(objects: CanvasObject[], insets: InsetPair[]): Snapshot {
  return {
    objects: JSON.parse(JSON.stringify(objects)),
    insets:  JSON.parse(JSON.stringify(insets)),
  };
}

function pushHistory(s: {
  past: Snapshot[]; future: Snapshot[];
  doc: { objects: CanvasObject[] }; insets: InsetPair[];
}) {
  s.past.push(snap(s.doc.objects as CanvasObject[], s.insets as InsetPair[]));
  if (s.past.length > 60) s.past.shift();
  s.future = [];
}

export interface AppState {
  // Multi-page
  pages: PageData[];
  activePageId: string;
  addPage: () => void;
  removePage: (id: string) => void;
  setActivePageId: (id: string) => void;
  renamePage: (id: string, title: string) => void;

  // Calibration queue
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

  // Document (active page)
  doc: CanvasDoc;
  setDocMeta:        (patch: Partial<CanvasDoc>) => void;
  flipOrientation:   () => void;
  updateMetadata:    (patch: Partial<CanvasDoc['metadata']>) => void;

  // Canvas objects
  addObject:          (obj: CanvasObject) => void;
  addObjects:         (objs: CanvasObject[]) => void;
  updateObject:       (id: string, patch: Partial<CanvasObject>) => void;
  removeObject:       (id: string) => void;
  reorderObjects:     (ids: string[]) => void;
  bringToFront:       (id: string) => void;
  sendToBack:         (id: string) => void;
  bringForward:       (id: string) => void;
  sendBackward:       (id: string) => void;
  duplicateObject:    (id: string) => void;
  batchUpdateObjects: (updates: { id: string; patch: Partial<CanvasObject> }[]) => void;

  // Inset pairs (active page)
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
  fitViewRequest: number;
  fitView: () => void;

  // UI
  showMetadataPanel:    boolean;
  toggleMetadataPanel:  () => void;
  showLayersPanel:      boolean;
  toggleLayersPanel:    () => void;
  showRulers:           boolean;
  toggleRulers:         () => void;
  rulerUnit:            'px' | 'mm' | 'in';
  setRulerUnit:         (u: 'px' | 'mm' | 'in') => void;

  // Native file path (desktop only)
  currentFilePath: string | null;
  setCurrentFilePath: (path: string | null) => void;

  rehydrate: (saved: PersistedState) => void;
}

const defaultDoc: CanvasDoc = {
  id: 'doc-1',
  title: 'Figure 1',
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

const initialPage: PageData = { doc: defaultDoc, insets: [] };

export const useStore = create<AppState>()(
  immer((set) => ({
    // ── Multi-page ────────────────────────────────────────────────────────
    pages: [initialPage],
    activePageId: defaultDoc.id,

    addPage: () => set((s) => {
      if (s.pages.length >= 5) return;
      const ai = s.pages.findIndex(p => p.doc.id === s.activePageId);
      if (ai !== -1) {
        s.pages[ai].doc    = s.doc    as CanvasDoc;
        s.pages[ai].insets = s.insets as InsetPair[];
      }
      const newId  = `page-${Date.now()}`;
      const newDoc: CanvasDoc = {
        id: newId,
        title: `Figure ${s.pages.length + 1}`,
        width: s.doc.width, height: s.doc.height,
        dpi: s.doc.dpi, background: s.doc.background,
        objects: [],
        metadata: JSON.parse(JSON.stringify(s.doc.metadata)),
      };
      const newPage: PageData = { doc: newDoc, insets: [] };
      s.pages.push(newPage);
      s.activePageId = newId;
      s.doc    = newDoc   as typeof s.doc;
      s.insets = []       as typeof s.insets;
      s.selectedId = null;
      s.past = []; s.future = [];
    }),

    removePage: (id) => set((s) => {
      if (s.pages.length <= 1) return;
      const idx = s.pages.findIndex(p => p.doc.id === id);
      if (idx === -1) return;
      const isActive = id === s.activePageId;
      if (isActive) {
        const newIdx = idx > 0 ? idx - 1 : 1;
        const newPg  = s.pages[newIdx];
        s.activePageId = newPg.doc.id;
        s.doc    = newPg.doc    as typeof s.doc;
        s.insets = newPg.insets as typeof s.insets;
        s.selectedId = null;
        s.past = []; s.future = [];
      }
      s.pages.splice(idx, 1);
    }),

    setActivePageId: (id) => set((s) => {
      if (id === s.activePageId) return;
      const ci = s.pages.findIndex(p => p.doc.id === s.activePageId);
      if (ci !== -1) {
        s.pages[ci].doc    = s.doc    as CanvasDoc;
        s.pages[ci].insets = s.insets as InsetPair[];
      }
      const newPg = s.pages.find(p => p.doc.id === id);
      if (!newPg) return;
      s.activePageId = id;
      s.doc    = newPg.doc    as typeof s.doc;
      s.insets = newPg.insets as typeof s.insets;
      s.selectedId = null;
      s.past = []; s.future = [];
    }),

    renamePage: (id, title) => set((s) => {
      const pg = s.pages.find(p => p.doc.id === id);
      if (pg) pg.doc.title = title;
      if (id === s.activePageId) s.doc.title = title;
    }),

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
    }),

    rehydrate: (saved) => set((s) => {
      s.pages        = saved.pages        as typeof s.pages;
      s.activePageId = saved.activePageId;
      s.groups       = saved.groups       as typeof s.groups;
      const activePg = saved.pages.find(p => p.doc.id === saved.activePageId) ?? saved.pages[0];
      s.doc    = activePg.doc    as typeof s.doc;
      s.insets = activePg.insets as typeof s.insets;
    }),

    // ── Library ──────────────────────────────────────────────────────────
    groups: [],
    addGroup: (group) => set((s) => {
      s.groups.push(group);
    }),
    updateGroup: (id, patch) => set((s) => {
      const i = s.groups.findIndex(g => g.id === id);
      if (i !== -1) Object.assign(s.groups[i], patch);
    }),
    removeGroup: (id) => set((s) => {
      s.groups = s.groups.filter(g => g.id !== id);
    }),
    toggleGroupExpanded: (id) => set((s) => {
      const i = s.groups.findIndex(g => g.id === id);
      if (i !== -1) s.groups[i].expanded = !s.groups[i].expanded;
    }),
    addImageToGroup: (groupId, image) => set((s) => {
      const i = s.groups.findIndex(g => g.id === groupId);
      if (i !== -1) s.groups[i].images.push(image);
    }),
    removeImageFromGroup: (groupId, imageId) => set((s) => {
      const i = s.groups.findIndex(g => g.id === groupId);
      if (i !== -1) s.groups[i].images = s.groups[i].images.filter(img => img.id !== imageId);
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
    }),

    flipOrientation: () => set((s) => {
      const w = s.doc.width;
      s.doc.width  = s.doc.height;
      s.doc.height = w;
      (s.pages as PageData[]).forEach(p => {
        const pw = p.doc.width;
        p.doc.width  = p.doc.height;
        p.doc.height = pw;
      });
    }),

    updateMetadata: (patch) => set((s) => {
      Object.assign(s.doc.metadata, patch);
    }),

    // ── Canvas objects ────────────────────────────────────────────────────
    addObject: (obj) => set((s) => {
      pushHistory(s);
      s.doc.objects.push(obj);
    }),
    addObjects: (objs) => set((s) => {
      pushHistory(s);
      s.doc.objects.push(...objs);
    }),
    updateObject: (id, patch) => set((s) => {
      const structural = ['x','y','width','height','rotation'].some(k => k in patch);
      if (structural) pushHistory(s);
      const i = s.doc.objects.findIndex(o => o.id === id);
      if (i !== -1) Object.assign(s.doc.objects[i], patch);
    }),
    removeObject: (id) => set((s) => {
      pushHistory(s);
      s.doc.objects = s.doc.objects.filter(o => o.id !== id);
      s.insets = s.insets.filter(p => p.parentObjectId !== id && p.insetObjectId !== id);
    }),
    reorderObjects: (ids) => set((s) => {
      pushHistory(s);
      s.doc.objects = ids
        .map(id => s.doc.objects.find(o => o.id === id))
        .filter(Boolean) as typeof s.doc.objects;
    }),
    bringToFront: (id) => set((s) => {
      const i = s.doc.objects.findIndex(o => o.id === id);
      if (i < 0 || i === s.doc.objects.length - 1) return;
      pushHistory(s);
      const obj = s.doc.objects[i];
      s.doc.objects.splice(i, 1);
      s.doc.objects.push(obj);
    }),
    sendToBack: (id) => set((s) => {
      const i = s.doc.objects.findIndex(o => o.id === id);
      if (i <= 0) return;
      pushHistory(s);
      const obj = s.doc.objects[i];
      s.doc.objects.splice(i, 1);
      s.doc.objects.unshift(obj);
    }),
    bringForward: (id) => set((s) => {
      const i = s.doc.objects.findIndex(o => o.id === id);
      if (i < 0 || i === s.doc.objects.length - 1) return;
      pushHistory(s);
      const tmp = s.doc.objects[i + 1];
      s.doc.objects[i + 1] = s.doc.objects[i];
      s.doc.objects[i] = tmp;
    }),
    sendBackward: (id) => set((s) => {
      const i = s.doc.objects.findIndex(o => o.id === id);
      if (i <= 0) return;
      pushHistory(s);
      const tmp = s.doc.objects[i - 1];
      s.doc.objects[i - 1] = s.doc.objects[i];
      s.doc.objects[i] = tmp;
    }),
    batchUpdateObjects: (updates) => set((s) => {
      pushHistory(s);
      for (const { id, patch } of updates) {
        const i = s.doc.objects.findIndex(o => o.id === id);
        if (i !== -1) Object.assign(s.doc.objects[i], patch);
      }
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
    }),

    // ── Insets ────────────────────────────────────────────────────────────
    insets: [],
    addInset: (pair) => set((s) => {
      pushHistory(s);
      s.insets.push(pair);
    }),
    removeInset: (id) => set((s) => {
      pushHistory(s);
      s.insets = s.insets.filter(p => p.id !== id);
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
    }),
    redo: () => set((s) => {
      if (s.future.length === 0) return;
      const next = s.future[s.future.length - 1];
      s.future.splice(s.future.length - 1, 1);
      s.past.push(snap(s.doc.objects as CanvasObject[], s.insets as InsetPair[]));
      if (s.past.length > 60) s.past.shift();
      s.doc.objects = next.objects as typeof s.doc.objects;
      s.insets      = next.insets  as typeof s.insets;
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
    fitViewRequest: 0,
    fitView: () => set((s) => { s.fitViewRequest = s.fitViewRequest + 1; }),

    showMetadataPanel: false,
    toggleMetadataPanel: () => set((s) => { s.showMetadataPanel = !s.showMetadataPanel; }),
    showLayersPanel: false,
    toggleLayersPanel: () => set((s) => { s.showLayersPanel = !s.showLayersPanel; }),
    showRulers: false,
    toggleRulers: () => set((s) => { s.showRulers = !s.showRulers; }),
    rulerUnit: 'mm',
    setRulerUnit: (u) => set((s) => { s.rulerUnit = u; }),

    currentFilePath: null,
    setCurrentFilePath: (path) => set((s) => { s.currentFilePath = path; }),
  }))
);

// ── Persistence subscriber ────────────────────────────────────────────────
//
// Fires after EVERY Zustand state update (after Immer finalization), so `state`
// here is a plain frozen object — NOT an Immer draft proxy. This means we can
// safely defer the serialization to a setTimeout without risk of reading a
// revoked Immer proxy. This is the correct place to call persistSave; never
// call it from inside a set() callback where the state is still a draft.

useStore.subscribe((state, prevState) => {
  if (
    state.doc        === prevState.doc        &&
    state.pages      === prevState.pages      &&
    state.groups     === prevState.groups     &&
    state.insets     === prevState.insets     &&
    state.activePageId === prevState.activePageId
  ) return;

  const { pages, activePageId, groups, doc, insets } = state;
  const pagesOut: PageData[] = pages.map(p =>
    p.doc.id === activePageId
      ? { doc: doc as CanvasDoc, insets: insets as InsetPair[] }
      : p
  );
  persistSave({ pages: pagesOut, activePageId, groups: groups as ImageGroup[] });
});
