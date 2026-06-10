import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { useStore, MAX_CANVAS_SLOTS } from '../store';

/** Inline dialog asking which slot to close before opening a new one. */
function SlotFullPrompt({
  slots,
  onClose,
  onCancel,
}: {
  slots: { id: string; doc: { title: string } }[];
  onClose: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="slot-full-overlay" onClick={onCancel}>
      <div className="slot-full-dialog" onClick={e => e.stopPropagation()}>
        <div className="slot-full-title">
          Maximum {MAX_CANVAS_SLOTS} figures open. Close one to continue:
        </div>
        <ul className="slot-full-list">
          {slots.map(sl => (
            <li key={sl.id}>
              <button className="btn btn-ghost slot-full-item" onClick={() => onClose(sl.id)}>
                {sl.doc.title}
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-ghost" style={{ marginTop: 8, width: '100%' }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function PageTabs() {
  const doc             = useStore(s => s.doc);
  const setDocMeta      = useStore(s => s.setDocMeta);
  const canvasSlots     = useStore(s => s.canvasSlots);
  const activeSlotId    = useStore(s => s.activeSlotId);
  const openCanvasSlot  = useStore(s => s.openCanvasSlot);
  const closeCanvasSlot = useStore(s => s.closeCanvasSlot);
  const switchToCanvasSlot = useStore(s => s.switchToCanvasSlot);

  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editVal,   setEditVal]       = useState('');
  const [showFull,  setShowFull]      = useState(false);

  const startRename = (id: string, currentTitle: string) => {
    setEditVal(currentTitle);
    setEditingId(id);
  };

  const commitRename = () => {
    setDocMeta({ title: editVal.trim() || 'Untitled Figure' });
    setEditingId(null);
  };

  const handleAddSlot = () => {
    const result = openCanvasSlot();
    if (result === 'full') setShowFull(true);
  };

  const handleCloseSlot = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    closeCanvasSlot(id);
  };

  // canvasSlots is always seeded with at least one slot — no fallback needed.
  const tabs = canvasSlots;

  const isEditing = editingId === doc.id;
  const isActive = (id: string) => id === activeSlotId;

  return (
    <>
      <div className="page-tabs">
        <div className="page-tabs-inner">
          {tabs.map(slot => {
            const active = isActive(slot.id);
            return (
              <div
                key={slot.id}
                className={`page-tab${active ? ' active' : ''}`}
                onClick={() => { if (!active) switchToCanvasSlot(slot.id); }}
                title={active ? 'Double-click to rename' : 'Click to switch'}
              >
                {active && isEditing ? (
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
                    onDoubleClick={e => {
                      if (!active) return;
                      e.stopPropagation();
                      // Use live doc.title for active slot (snapshot may be stale)
                      startRename(slot.doc.id, active ? doc.title : slot.doc.title);
                    }}
                  >
                    {/* Active slot uses live doc.title; inactive slots use their snapshot */}
                    {active ? doc.title : slot.doc.title}
                  </span>
                )}
                {tabs.length > 1 && (
                  <button
                    className="page-tab-close"
                    onClick={e => handleCloseSlot(slot.id, e)}
                    title="Close figure"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add new canvas slot */}
          <button
            className="btn-icon page-tab-add"
            title={`New figure (max ${MAX_CANVAS_SLOTS})`}
            onClick={handleAddSlot}
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {showFull && (
        <SlotFullPrompt
          slots={tabs}
          onClose={id => { closeCanvasSlot(id); setShowFull(false); openCanvasSlot(); }}
          onCancel={() => setShowFull(false)}
        />
      )}
    </>
  );
}
