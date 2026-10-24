import { describe, expect, it } from 'vitest';
import { loadNotes, parseNotes, starterNotes } from './notes';

describe('local notes', () => {
  it('round-trips Japanese text, line breaks, and markup as plain data', () => {
    const notes = starterNotes();
    notes[0].body = '<script>alert(1)</script>\n日本語と🍵';
    expect(parseNotes(JSON.stringify(notes))).toEqual(notes);
  });
  it('preserves an intentionally empty notebook rather than recreating samples', () => {
    expect(loadNotes({ getItem: () => '[]' }).notes).toEqual([]);
  });
  it('loads all 128 notes, keeps old notes intact, and rejects a 129th without enabling writes', () => {
    const notes = Array.from({ length: 128 }, (_, i) => ({ ...starterNotes()[i % 4], id: `note-${i}` }));
    expect(loadNotes({ getItem: () => JSON.stringify(notes) })).toMatchObject({ notes, writable: true, error: null });
    expect(parseNotes(JSON.stringify(notes.slice(0, 16)))).toEqual(notes.slice(0, 16));
    const tooMany = [...notes, { ...notes[0], id: 'note-128' }];
    expect(loadNotes({ getItem: () => JSON.stringify(tooMany) }).writable).toBe(false);
  });
  it('rejects malformed and duplicate records without enabling writes', () => {
    expect(loadNotes({ getItem: () => '{broken' }).writable).toBe(false);
    const note = starterNotes()[0];
    expect(() => parseNotes(JSON.stringify([note, note]))).toThrow();
    expect(() => parseNotes(JSON.stringify([{ ...note, body: 123 }]))).toThrow();
  });
  it('keeps the app usable when browser storage is blocked', () => {
    const result = loadNotes({ getItem: () => { throw new Error('SecurityError'); } });
    expect(result.notes).toEqual([]);
    expect(result.error).toBeTruthy();
  });
});
