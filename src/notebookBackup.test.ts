import { describe, expect, it, vi } from 'vitest';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { mergeNotebookBackup, exportNotebook } from './notebookBackup';
import { starterNotes } from './notes';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: { writeFile: vi.fn(async () => ({ uri: 'file:///cache/notes.json' })) }, Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' } }));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn(async () => ({})) } }));
describe('portable JSON backups', () => {
  it('skips identical notes, preserves current text on ID collisions and keeps imported Unicode and state', () => {
    const notes = starterNotes(), incoming = [{ ...notes[0], body: '日本語🍵\n別の本文', zeno: { basis: 1, at: 100 } }];
    const before = JSON.stringify(notes);
    expect(mergeNotebookBackup(notes, before).added).toBe(0);
    const merged = mergeNotebookBackup(notes, JSON.stringify(incoming), () => 'imported-id');
    expect(merged.added).toBe(1);
    expect(merged.notes[4]).toEqual({ ...incoming[0], id: 'imported-id' });
    expect(JSON.stringify(notes)).toBe(before);
  });
  it('rejects malformed and oversized merges as a whole without dropping current notes', () => {
    const notes = Array.from({ length: 128 }, (_, i) => ({ ...starterNotes()[0], id: String(i) }));
    const before = JSON.stringify(notes);
    expect(() => mergeNotebookBackup(notes, JSON.stringify([{ ...notes[0], id: 'extra' }]))).toThrow('128');
    expect(() => mergeNotebookBackup(notes, '{broken')).toThrow();
    expect(JSON.stringify(notes)).toBe(before);
    expect(mergeNotebookBackup([], '[]').notes).toEqual([]);
  });
  it('exports native JSON as a real cache file and lets the user choose its destination', async () => {
    const notes = starterNotes(); await exportNotebook(notes);
    expect(Filesystem.writeFile).toHaveBeenCalledWith(expect.objectContaining({ data: JSON.stringify(notes, null, 2), directory: 'CACHE', encoding: 'utf8' }));
    expect(Share.share).toHaveBeenCalledWith(expect.objectContaining({ files: ['file:///cache/notes.json'] }));
  });
});
