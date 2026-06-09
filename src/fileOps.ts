import { useStore } from './store';
import type { PersistedState } from './store';

export function isDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Snapshot the current store into a PersistedState. */
function snapshot(): PersistedState {
  const { doc, groups, insets } = useStore.getState();
  return { doc, groups, insets };
}

/** Write the project to a specific path (must already be allowed by the user via dialog). */
export async function saveToPath(filePath: string): Promise<void> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  await writeTextFile(filePath, JSON.stringify(snapshot(), null, 2));
}

/**
 * Open the native Save dialog and write the file.
 * Returns the chosen path, or null if cancelled.
 */
export async function saveProjectAs(): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  const filePath = await save({
    title: 'Save Project',
    defaultPath: 'project.petro',
    filters: [{ name: 'Petro Graphs Project', extensions: ['petro'] }],
  });
  if (!filePath) return null;
  await saveToPath(filePath);
  return filePath;
}

/**
 * Save to the current file path.
 * Falls back to Save As if no file is open yet.
 */
export async function saveProject(): Promise<string | null> {
  const { currentFilePath } = useStore.getState();
  if (currentFilePath) {
    await saveToPath(currentFilePath);
    return currentFilePath;
  }
  return saveProjectAs();
}

/**
 * Open the native Open dialog, load the .petro file, and rehydrate the store.
 */
export async function openProject(): Promise<void> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const result = await open({
    title: 'Open Project',
    filters: [{ name: 'Petro Graphs Project', extensions: ['petro'] }],
    multiple: false,
  });
  const filePath = Array.isArray(result) ? result[0] : result;
  if (!filePath) return;

  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const json = await readTextFile(filePath);
  const data = JSON.parse(json) as PersistedState;

  const { rehydrate, setCurrentFilePath } = useStore.getState();
  rehydrate(data);
  setCurrentFilePath(filePath);
}
