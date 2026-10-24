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
