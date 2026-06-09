import { useState } from 'react';
import { useStore } from '../store';

export default function PageTabs() {
  const doc        = useStore(s => s.doc);
  const setDocMeta = useStore(s => s.setDocMeta);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVal,   setEditVal]   = useState('');

  const startRename = (id: string, currentTitle: string) => {
    setEditVal(currentTitle);
    setEditingId(id);
  };

  const commitRename = () => {
    setDocMeta({ title: editVal.trim() || 'Untitled Figure' });
    setEditingId(null);
  };

  const isEditing = editingId === doc.id;

  return (
    <div className="page-tabs">
      <div className="page-tabs-inner">
        <div className="page-tab active">
          {isEditing ? (
            <input
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
              onDoubleClick={e => { e.stopPropagation(); startRename(doc.id, doc.title); }}
              title="Double-click to rename"
            >
              {doc.title}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
