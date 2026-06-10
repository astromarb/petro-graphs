import { useEffect, useState } from 'react';
import Topbar from './components/Topbar';
import PageTabs from './components/PageTabs';
import LeftSidebar from './components/LeftSidebar';
import CanvasArea from './components/CanvasArea';
import RightSidebar from './components/RightSidebar';
import MetadataModal from './components/MetadataModal';
import LayersPanel from './components/LayersPanel';
import CalibrationModal from './components/CalibrationModal';
import UpdateNotifier from './components/UpdateNotifier';
import { useStore, loadPersistedState, saveProjectFile, openProjectFile } from './store';
import { isDesktop, saveProject, saveProjectAs, openProject } from './fileOps';
import type { Tool } from './types';

const KEY_TOOL_MAP: Record<string, Tool> = {
  v: 'select', h: 'pan', t: 'text', s: 'shape', l: 'line', b: 'scalebar', i: 'inset',
};

export default function App() {
  const {
    setTool, setZoom, zoom, fitView,
    selectedId, removeObject, duplicateObject,
    undo, redo, past, future, rehydrate,
    setCurrentFilePath,
  } = useStore();

  const [ready, setReady] = useState(false);

  // Rehydrate from IndexedDB — show UI immediately, apply saved state in background
  useEffect(() => {
    setReady(true);
    loadPersistedState().then(saved => {
      if (saved) rehydrate(saved);
    });
  }, []);

  // Warn before tab close if there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const { hasUnsavedChanges } = useStore.getState();
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = ''; // triggers browser's generic "Leave site?" dialog
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

      // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y — always handle, even in inputs
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (future.length > 0) redo();
        } else {
          if (past.length > 0) undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (future.length > 0) redo();
        return;
      }

      if (isEditing) return;

      const t = KEY_TOOL_MAP[e.key.toLowerCase()];
      if (t) { setTool(t); return; }

      if (e.key === '=' || e.key === '+') setZoom(zoom + 0.1);
      if (e.key === '-') setZoom(zoom - 0.1);
      if (e.key === '0') fitView();

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        removeObject(selectedId);
      }

      // Arrow key nudge — 1 px normally, 10 px with Shift
      if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) && selectedId) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0;
        const { doc: d, updateObject: uo } = useStore.getState();
        const o = d.objects.find(ob => ob.id === selectedId);
        if (o) uo(selectedId, { x: o.x + dx, y: o.y + dy });
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
        e.preventDefault();
        duplicateObject(selectedId);
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDesktop()) {
          const op = e.shiftKey ? saveProjectAs() : saveProject();
          op.then(p => { if (p) setCurrentFilePath(p); })
            .catch(err => console.error('[PetroGraphing] Save failed:', err));
        } else {
          saveProjectFile();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        if (isDesktop()) {
          openProject().catch(err => console.error('[PetroGraphing] Open failed:', err));
        } else {
          openProjectFile().catch(() => {});
        }
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoom, selectedId, past, future]);

  if (!ready) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0d0b08', color: 'var(--text-muted)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Topbar />
      <PageTabs />
      <LeftSidebar />
      <CanvasArea />
      <RightSidebar />
      <MetadataModal />
      <LayersPanel />
      <CalibrationModal />
      <UpdateNotifier />
    </div>
  );
}
