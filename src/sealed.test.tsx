import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { starterNotes } from './notes';
import { cardLabel, sealedLabels, shuffledIds } from './sealed';
import { SealedEditor } from './SealedEditor';

describe('sealed notes', () => {
  it('shuffles a permutation without changing saved content or order', () => {
    const notes = starterNotes();
    const original = JSON.stringify(notes);
    const ids = shuffledIds(notes, () => 0);
    expect(new Set(ids)).toEqual(new Set(notes.map(note => note.id)));
    expect(ids).not.toEqual(notes.map(note => note.id));
    expect(JSON.stringify(notes)).toBe(original);
  });
  it('passes only symbolic names to all circuit labels', () => {
    const notes = starterNotes();
    const labels = sealedLabels(notes.map(note => note.id));
    expect(labels.map(note => note.title)).toEqual(['メモA', 'メモB', 'メモC', 'メモD']);
    expect(cardLabel(15)).toBe('メモP');
    for (const note of notes) {
      expect(JSON.stringify(labels)).not.toContain(note.title);
      expect(JSON.stringify(labels)).not.toContain(note.body);
    }
  });
  it('renders sealed and empty states without editor fields or note contents', () => {
    for (const measuredEmpty of [false, true]) {
      const html = renderToStaticMarkup(<SealedEditor label="メモA" measuredEmpty={measuredEmpty} onEdit={() => {}} />);
      expect(html).not.toContain('<textarea');
      expect(html).not.toContain('<input');
      for (const note of starterNotes()) expect(html).not.toContain(note.title);
    }
  });
  it('reveals only the measured note, keeping other notes hidden', () => {
    const notes = starterNotes();
    const html = renderToStaticMarkup(<SealedEditor label="メモB" openedNote={notes[1]} measuredEmpty={false} onEdit={() => {}} />);
    expect(html).toContain(notes[1].title);
    expect(html).toContain(notes[1].body);
    expect(html).not.toContain(notes[0].title);
    expect(html).not.toContain(notes[2].title);
  });
});
