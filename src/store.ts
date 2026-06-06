import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  CanvasDoc, CanvasObject, ImageGroup, ThinSectionImage, Tool, InsetPair,
} from './types';

export interface AppState {
  // Groups / library
  groups: ImageGroup[];
  addGroup: (group: ImageGroup) => void;
  updateGroup: (id: string, patch: Partial<ImageGroup>) => void;
  removeGroup: (id: string) => void;
  toggleGroupExpanded: (id: string) => void;
  addImageToGroup: (groupId: string, image: ThinSectionImage) => void;
  removeImageFromGroup: (groupId: string, imageId: string) => void;

  // Canvas document
  doc: CanvasDoc;
  setDocMeta: (patch: Partial<CanvasDoc>) => void;
  updateMetadata: (patch: Partial<CanvasDoc['metadata']>) => void;

  // Objects on canvas
  addObject: (obj: CanvasObject) => void;
  updateObject: (id: string, patch: Partial<CanvasObject>) => void;
  removeObject: (id: string) => void;
  reorderObjects: (ids: string[]) => void;
  duplicateObject: (id: string) => void;

  // Inset pairs
  insets: InsetPair[];
  addInset: (pair: InsetPair) => void;
  removeInset: (id: string) => void;

  // Selection
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;

  // Active tool
  tool: Tool;
  setTool: (t: Tool) => void;

  // Zoom / pan
  zoom: number;
  setZoom: (z: number) => void;
  panX: number;
  panY: number;
  setPan: (x: number, y: number) => void;

  // UI state
  showMetadataPanel: boolean;
  toggleMetadataPanel: () => void;
  showLayersPanel: boolean;
  toggleLayersPanel: () => void;
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
    authors: '',
    affiliation: '',
    sampleInfo: '',
    locality: '',
    notes: '',
    date: new Date().toISOString().slice(0, 10),
  },
};

export const useStore = create<AppState>()(
  immer((set) => ({
    groups: [],
    addGroup: (group) => set((s) => { s.groups.push(group); }),
    updateGroup: (id, patch) => set((s) => {
      const idx = s.groups.findIndex(g => g.id === id);
      if (idx !== -1) Object.assign(s.groups[idx], patch);
    }),
    removeGroup: (id) => set((s) => { s.groups = s.groups.filter(g => g.id !== id); }),
    toggleGroupExpanded: (id) => set((s) => {
      const idx = s.groups.findIndex(g => g.id === id);
      if (idx !== -1) s.groups[idx].expanded = !s.groups[idx].expanded;
    }),
    addImageToGroup: (groupId, image) => set((s) => {
      const idx = s.groups.findIndex(g => g.id === groupId);
      if (idx !== -1) s.groups[idx].images.push(image);
    }),
    removeImageFromGroup: (groupId, imageId) => set((s) => {
      const idx = s.groups.findIndex(g => g.id === groupId);
      if (idx !== -1) s.groups[idx].images = s.groups[idx].images.filter(i => i.id !== imageId);
    }),

    doc: defaultDoc,
    setDocMeta: (patch) => set((s) => { Object.assign(s.doc, patch); }),
    updateMetadata: (patch) => set((s) => { Object.assign(s.doc.metadata, patch); }),

    addObject: (obj) => set((s) => { s.doc.objects.push(obj); }),
    updateObject: (id, patch) => set((s) => {
      const idx = s.doc.objects.findIndex(o => o.id === id);
      if (idx !== -1) Object.assign(s.doc.objects[idx], patch);
    }),
    removeObject: (id) => set((s) => { s.doc.objects = s.doc.objects.filter(o => o.id !== id); }),
    reorderObjects: (ids) => set((s) => {
      s.doc.objects = ids.map(id => s.doc.objects.find(o => o.id === id)!).filter(Boolean);
    }),
    duplicateObject: (id) => set((s) => {
      const obj = s.doc.objects.find(o => o.id === id);
      if (!obj) return;
      const clone = JSON.parse(JSON.stringify(obj));
      clone.id = `obj-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      clone.x += 20;
      clone.y += 20;
      clone.label = clone.label + ' (copy)';
      s.doc.objects.push(clone);
    }),

    insets: [],
    addInset: (pair) => set((s) => { s.insets.push(pair); }),
    removeInset: (id) => set((s) => { s.insets = s.insets.filter(p => p.id !== id); }),

    selectedId: null,
    setSelectedId: (id) => set((s) => { s.selectedId = id; }),

    tool: 'select',
    setTool: (t) => set((s) => { s.tool = t; }),

    zoom: 1,
    setZoom: (z) => set((s) => { s.zoom = Math.max(0.1, Math.min(4, z)); }),
    panX: 0,
    panY: 0,
    setPan: (x, y) => set((s) => { s.panX = x; s.panY = y; }),

    showMetadataPanel: false,
    toggleMetadataPanel: () => set((s) => { s.showMetadataPanel = !s.showMetadataPanel; }),
    showLayersPanel: false,
    toggleLayersPanel: () => set((s) => { s.showLayersPanel = !s.showLayersPanel; }),
  }))
);
