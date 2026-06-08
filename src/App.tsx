import { useEffect, useState } from 'react';
import Topbar from './components/Topbar';
import PageTabs from './components/PageTabs';
import LeftSidebar from './components/LeftSidebar';
import CanvasArea from './components/CanvasArea';
import RightSidebar from './components/RightSidebar';
import MetadataModal from './components/MetadataModal';
import LayersPanel from './components/LayersPanel';
import CalibrationModal from './components/CalibrationModal';
import { useStore, loadPersistedState } from './store';
import { isDesktop, saveProject, saveProjectAs, openProject } from './fileOps';
import type { Tool } from './types';

const KEY_TOOL_MAP: Record<string, Tool> = {
  v: 'select', h: 'pan', t: 'text', s: 'shape', b: 'scalebar', i: 'inset',
};

export default function App() {
  const {
    setTool, setZoom, zoom, fitView,
    selectedId, removeObject, duplicateObject,
    undo, redo, past, future, rehydrate,
    setCurrentFilePath,
  } = useStore();

  const [ready, setReady] = useState(false);

  // Rehydrate from IndexedDB before first render
  useEffect(() => {
    loadPersistedState().then(saved => {
      if (saved) rehydrate(saved);
      setReady(true);
    });
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

      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
        e.preventDefault();
        duplicateObject(selectedId);
      }

      // Native file ops (desktop only)
      if (isDesktop() && (e.ctrlKey || e.metaKey)) {
        if (e.key.toLowerCase() === 's') {
          e.preventDefault();
          const op = e.shiftKey ? saveProjectAs() : saveProject();
          op.then(p => { if (p) setCurrentFilePath(p); })
            .catch(err => console.error('[PetroGraphing] Save failed:', err));
          return;
        }
        if (e.key.toLowerCase() === 'o') {
          e.preventDefault();
          openProject().catch(err => console.error('[PetroGraphing] Open failed:', err));
          return;
        }
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
    </div>
  );
}
