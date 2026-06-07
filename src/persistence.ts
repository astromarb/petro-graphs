import type { PersistedState } from './store';
import type { CanvasDoc, ImageGroup, InsetPair } from './types';

const SAVE_FILE = 'autosave.json';

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// ── Tauri fs persistence ───────────────────────────────────────────────────

async function tauriSave(data: PersistedState): Promise<void> {
  const { writeTextFile, mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  // Ensure the app local data directory exists (Tauri creates it, but be defensive)
  await mkdir('', { baseDir: BaseDirectory.AppLocalData, recursive: true }).catch(() => {});
  await writeTextFile(SAVE_FILE, JSON.stringify(data), {
    baseDir: BaseDirectory.AppLocalData,
  });
}

async function tauriLoad(): Promise<PersistedState | null> {
  const { readTextFile, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs');
  const fileExists = await exists(SAVE_FILE, { baseDir: BaseDirectory.AppLocalData });
  if (!fileExists) return null;
  const json = await readTextFile(SAVE_FILE, { baseDir: BaseDirectory.AppLocalData });
  return JSON.parse(json) as PersistedState;
}

// ── IndexedDB fallback (browser / npm run dev) ─────────────────────────────

const IDB_KEY_V2 = 'petrofigure-state-v2';
const IDB_KEY_V1 = 'petrofigure-state-v1';

async function idbSave(data: PersistedState): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const { set } = await import('idb-keyval');
  await set(IDB_KEY_V2, JSON.parse(JSON.stringify(data)));
}

async function idbLoad(): Promise<PersistedState | null> {
  if (typeof indexedDB === 'undefined') return null;
  const { get } = await import('idb-keyval');
  const v2 = await get<PersistedState>(IDB_KEY_V2);
  if (v2) return v2;
  // Migrate from v1 schema (single-page, no pages array)
  const v1 = await get<{ doc: CanvasDoc; groups: ImageGroup[]; insets: InsetPair[] }>(IDB_KEY_V1);
  if (v1) {
    return {
      pages: [{ doc: v1.doc, insets: v1.insets ?? [] }],
      activePageId: v1.doc.id,
      groups: v1.groups,
    };
  }
  return null;
}

// ── Debounced save ─────────────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function persistSave(data: PersistedState): void {
  if (saveTimer) clearTimeout(saveTimer);
  // Snapshot now (synchronous deep-clone) so any mutation after this call is not captured
  const snapshot = JSON.parse(JSON.stringify(data)) as PersistedState;
  saveTimer = setTimeout(() => {
    const fn = isTauri() ? tauriSave : idbSave;
    fn(snapshot).catch(() => {});
  }, 500);
}

export async function persistLoad(): Promise<PersistedState | null> {
  try {
    return await (isTauri() ? tauriLoad() : idbLoad());
  } catch {
    return null;
  }
}
