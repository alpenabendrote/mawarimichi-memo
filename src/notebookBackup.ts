import { Capacitor } from '@capacitor/core';
import { MAX_NOTES } from './quantum/simulator';
import { parseNotes, type Note } from './notes';
import { coalesceSediments } from './sedimentation';

/** Merge backups without overwriting current text, including colliding IDs. */
export function mergeNotebookBackup(current: Note[], raw: string, newId: () => string = () => crypto.randomUUID()) {
  const incoming = parseNotes(raw), next = [...current];
  const ids = new Set(current.map(note => note.id));
  let added = 0, firstAddedId: string | undefined;
  for (const note of incoming) {
    const original = current.find(existing => existing.id === note.id);
    if (original && original.title === note.title && original.body === note.body && original.updatedAt === note.updatedAt) continue;
    let id = note.id;
    if (ids.has(id)) {
      id = newId();
      if (!id || ids.has(id)) throw new Error('読み込み用のIDを作成できませんでした。');
    }
    const { sedimentWalk, ...rest } = note;
    ids.add(id); next.push({ ...rest, id, ...(id === note.id && sedimentWalk ? { sedimentWalk } : {}) }); added++;
    firstAddedId ??= id;
  }
  const merged = coalesceSediments(next);
  if (firstAddedId && !merged.some(note => note.id === firstAddedId)) firstAddedId = merged.find(note => note.sediment)?.id;
  if (merged.length > MAX_NOTES) throw new Error('読み込むと128件を超えます。メモを整理してから読み込んでください。');
  return { notes: merged, added, firstAddedId };
}

export async function exportNotebook(notes: Note[]): Promise<void> {
  const raw = JSON.stringify(notes, null, 2);
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'), import('@capacitor/share'),
    ]);
    const file = await Filesystem.writeFile({ path: 'notes-' + Date.now() + '.json', data: raw, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'メモのJSON', files: [file.uri], dialogTitle: 'JSONの保存先を選ぶ' });
    return;
  }
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'notes-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
