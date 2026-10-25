import { Capacitor } from '@capacitor/core';
import { loadNotes, STORAGE_KEY, type Note } from './notes';

export type LoadedNotebook = ReturnType<typeof loadNotes>;

/** Capture each snapshot now and serialize asynchronous native writes in input order. */
export function queuedNotebookSaver(write: (raw: string) => Promise<void>) {
  let tail = Promise.resolve();
  return (notes: Note[]) => {
    const raw = JSON.stringify(notes);
    const operation = tail.catch(() => {}).then(() => write(raw));
    tail = operation;
    return operation;
  };
}

export async function loadNativeNotebook(): Promise<LoadedNotebook> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    return loadNotes({ getItem: () => value });
  } catch {
    return loadNotes({ getItem: () => { throw new Error('Native storage unavailable'); } });
  }
}

export const saveNotebook = queuedNotebookSaver(async raw => {
  if (Capacitor.isNativePlatform()) {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: STORAGE_KEY, value: raw });
  } else {
    window.localStorage.setItem(STORAGE_KEY, raw);
  }
});
