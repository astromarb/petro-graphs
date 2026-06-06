import { X, User, MapPin, FlaskConical, FileText, Calendar } from 'lucide-react';
import { useStore } from '../store';

export default function MetadataModal() {
  const { showMetadataPanel, toggleMetadataPanel, doc, updateMetadata } = useStore();
  if (!showMetadataPanel) return null;

  const { metadata } = doc;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: 24, width: 480, maxWidth: '95vw',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Document Metadata</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              Attribution, authorship, and sample information
            </div>
          </div>
          <button className="btn-icon" onClick={toggleMetadataPanel}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { key: 'authors', label: 'Authors', icon: <User size={13} />, placeholder: 'e.g. Smith, J.A.; Doe, R.B.' },
            { key: 'affiliation', label: 'Affiliation', icon: <FileText size={13} />, placeholder: 'Department / Institution' },
            { key: 'sampleInfo', label: 'Sample info', icon: <FlaskConical size={13} />, placeholder: 'Sample ID, rock type, formation...' },
            { key: 'locality', label: 'Locality', icon: <MapPin size={13} />, placeholder: 'Geographic location, coordinates...' },
            { key: 'notes', label: 'Notes', icon: <FileText size={13} />, placeholder: 'Figure caption notes, analysis notes...', multiline: true },
            { key: 'date', label: 'Date', icon: <Calendar size={13} />, placeholder: 'YYYY-MM-DD' },
          ].map(({ key, label, icon, placeholder, multiline }) => (
            <div key={key}>
              <div className="input-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {icon} {label}
              </div>
              {multiline ? (
                <textarea
                  className="textarea"
                  value={metadata[key as keyof typeof metadata]}
                  onChange={e => updateMetadata({ [key]: e.target.value })}
                  placeholder={placeholder}
                  rows={3}
                />
              ) : (
                <input
                  className="input"
                  value={metadata[key as keyof typeof metadata]}
                  onChange={e => updateMetadata({ [key]: e.target.value })}
                  placeholder={placeholder}
                />
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={toggleMetadataPanel}>Close</button>
          <button className="btn btn-primary" onClick={toggleMetadataPanel}>Save</button>
        </div>
      </div>
    </div>
  );
}
