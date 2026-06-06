import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useStore } from '../store';

export default function PageTabs() {
  const { pages, activePageId, addPage, removePage, setActivePageId, renamePage } = useStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal,   setEditVal]   = useState('');

  const startRename = (id: string, currentTitle: string) => {
    setEditVal(currentTitle);
    setEditingId(id);
  };

  const commitRename = (id: string) => {
    renamePage(id, editVal.trim() || 'Untitled Figure');
    setEditingId(null);
  };

  return (
    <div className="page-tabs">
      <div className="page-tabs-inner">
        {pages.map((pg) => {
          const isActive  = pg.doc.id === activePageId;
          const isEditing = editingId === pg.doc.id;

          return (
            <div
              key={pg.doc.id}
              className={`page-tab${isActive ? ' active' : ''}`}
              onClick={() => { if (!isActive) setActivePageId(pg.doc.id); }}
            >
              {isEditing ? (
                <input
                  className="page-tab-input"
                  value={editVal}
                  autoFocus
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={() => commitRename(pg.doc.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  commitRename(pg.doc.id);
                    if (e.key === 'Escape') setEditingId(null);
                    e.stopPropagation();
                  }}
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span
                  className="page-tab-title"
                  onDoubleClick={e => { e.stopPropagation(); startRename(pg.doc.id, pg.doc.title); }}
                  title="Double-click to rename"
                >
                  {pg.doc.title}
                </span>
              )}

              {pages.length > 1 && (
                <button
                  className="page-tab-close"
                  title="Close page"
                  onClick={e => { e.stopPropagation(); removePage(pg.doc.id); }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}

        {pages.length < 5 && (
          <button
            className="page-tab-add"
            title="New page (max 5)"
            onClick={addPage}
          >
            <Plus size={12} />
          </button>
        )}
      </div>
    </div>
  );
}