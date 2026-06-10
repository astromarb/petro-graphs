import { useState, useRef, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { useStore, MAX_CANVAS_SLOTS } from '../store';

export default function PageTabs() {
  const canvases       = useStore(s => s.canvases);
  const activeCanvasId = useStore(s => s.activeCanvasId);
  const addCanvas      = useStore(s => s.addCanvas);
  const removeCanvas   = useStore(s => s.removeCanvas);
  const switchCanvas   = useStore(s => s.switchCanvas);
  const renameCanvas   = useStore(s => s.renameCanvas);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal,   setEditVal]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.select();
  }, [editingId]);

  const startRename = (id: string, currentTitle: string) => {
    setEditVal(currentTitle);
    setEditingId(id);
  };

  const commitRename = () => {
    if (editingId) renameCanvas(editingId, editVal.trim() || 'Untitled Figure');
    setEditingId(null);
  };

  return (
    <div className="page-tabs">
      <div className="page-tabs-inner">
        {canvases.map(c => {
          const isActive  = c.id === activeCanvasId;
          const isEditing = editingId === c.id;
          return (
            <div
              key={c.id}
              className={`page-tab${isActive ? ' active' : ''}`}
              onClick={() => { if (!isEditing) switchCanvas(c.id); }}
            >
              {isEditing ? (
                <input
                  ref={inputRef}
                  className="page-tab-input"
                  value={editVal}
                  autoFocus
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  commitRename();
                    if (e.key === 'Escape') setEditingId(null);
                    e.stopPropagation();
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="page-tab-title"
                  onDoubleClick={e => { e.stopPropagation(); startRename(c.id, c.doc.title); }}
                  title="Double-click to rename"
                >
                  {c.doc.title}
                </span>
              )}
              {canvases.length > 1 && (
                <button
                  className="page-tab-close"
                  title="Close figure"
                  onClick={e => { e.stopPropagation(); removeCanvas(c.id); }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}

        {canvases.length < MAX_CANVAS_SLOTS && (
          <button
            className="page-tab-add"
            title={`Add figure (max ${MAX_CANVAS_SLOTS})`}
            onClick={addCanvas}
          >
            <Plus size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
