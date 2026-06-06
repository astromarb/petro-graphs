import { useEffect } from 'react';
import Topbar from './components/Topbar';
import LeftSidebar from './components/LeftSidebar';
import CanvasArea from './components/CanvasArea';
import RightSidebar from './components/RightSidebar';
import MetadataModal from './components/MetadataModal';
import LayersPanel from './components/LayersPanel';
import { useStore } from './store';
import type { Tool } from './types';

const KEY_TOOL_MAP: Record<string, Tool> = {
  v: 'select', h: 'pan', t: 'text', s: 'shape', b: 'scalebar', i: 'inset',
};

export default function App() {
  const { setTool, setZoom, zoom, selectedId, removeObject, duplicateObject } = useStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;

      const t = KEY_TOOL_MAP[e.key.toLowerCase()];
      if (t) { setTool(t); return; }

      if (e.key === '=' || e.key === '+') setZoom(zoom + 0.1);
      if (e.key === '-') setZoom(zoom - 0.1);
      if (e.key === '0') setZoom(1);

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        removeObject(selectedId);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedId) {
        e.preventDefault();
        duplicateObject(selectedId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoom, selectedId]);

  return (
    <div className="app-shell">
      <Topbar />
      <LeftSidebar />
      <CanvasArea />
      <RightSidebar />
      <MetadataModal />
      <LayersPanel />
    </div>
  );
}
