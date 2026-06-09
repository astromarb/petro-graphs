import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface UpdateInfo {
  version: string;
  body: string | null;
}

// Only runs inside the Tauri desktop shell — no-ops in the browser.
export default function UpdateNotifier() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // `window.__TAURI__` is injected by Tauri; absent in the web build.
    if (!('__TAURI__' in window)) return;

    let cancelled = false;
    (async () => {
      try {
        // Dynamic import so the web bundle never tries to resolve this module.
        const { check } = await import('@tauri-apps/plugin-updater');
        const result = await check();
        if (!cancelled && result?.available) {
          setUpdate({ version: result.version, body: result.body ?? null });
        }
      } catch {
        // Silently ignore — network down, rate-limited, etc.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!update || dismissed) return null;

  const handleInstall = async () => {
    if (!('__TAURI__' in window)) return;
    setInstalling(true);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const { relaunch } = await import('@tauri-apps/plugin-process');
      const result = await check();
      if (result?.available) {
        await result.downloadAndInstall();
        await relaunch();
      }
    } catch {
      setInstalling(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      background: 'var(--surface-2)', border: '1px solid var(--accent)',
      borderRadius: 10, padding: '14px 16px', width: 300,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Download size={13} /> Update available — v{update.version}
        </span>
        <button className="btn-icon" onClick={() => setDismissed(true)} title="Dismiss">
          <X size={13} />
        </button>
      </div>
      {update.body && (
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }}>
          {update.body}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost" style={{ fontSize: 11, flex: 1 }} onClick={() => setDismissed(true)}>
          Later
        </button>
        <button className="btn btn-primary" style={{ fontSize: 11, flex: 2 }} onClick={handleInstall} disabled={installing}>
          {installing ? 'Installing…' : 'Install & Restart'}
        </button>
      </div>
    </div>
  );
}
