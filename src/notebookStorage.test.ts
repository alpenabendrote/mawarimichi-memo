import { describe, expect, it, vi, afterEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { loadNativeNotebook, queuedNotebookSaver } from './notebookStorage';
import { starterNotes } from './notes';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => true) } }));
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: vi.fn(), set: vi.fn() } }));
afterEach(() => vi.clearAllMocks());
describe('Android notebook persistence', () => {
  it('loads native notes, including an intentionally empty notebook, before allowing writes', async () => {
    const notes = starterNotes();
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: JSON.stringify(notes) }).mockResolvedValueOnce({ value: '[]' });
    expect((await loadNativeNotebook()).notes).toEqual(notes);
    expect((await loadNativeNotebook()).notes).toEqual([]);
    expect(Preferences.set).not.toHaveBeenCalled();
  });
  it('keeps malformed or inaccessible native data protected from auto-save', async () => {
    vi.mocked(Preferences.get).mockResolvedValueOnce({ value: '{bad' }).mockRejectedValueOnce(new Error('Unavailable'));
    expect((await loadNativeNotebook()).writable).toBe(false);
    expect((await loadNativeNotebook()).writable).toBe(false);
    expect(Preferences.set).not.toHaveBeenCalled();
  });
  it('serializes asynchronous saves, snapshots input immediately, and recovers after a failed write', async () => {
    let finish!: () => void;
    const write = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const save = queuedNotebookSaver(write), notes = starterNotes();
    const first = save(notes); notes[0].title = 'newer'; const second = save(notes);
    await Promise.resolve(); await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0][0])[0].title).not.toBe('newer');
    finish(); await first; await second;
    expect(JSON.parse(write.mock.calls[1][0])[0].title).toBe('newer');
    const failed = queuedNotebookSaver(vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValueOnce(undefined));
    await expect(failed(notes)).rejects.toThrow('disk');
    await expect(failed(notes)).resolves.toBeUndefined();
    expect(Capacitor.isNativePlatform()).toBe(true);
  });
});
