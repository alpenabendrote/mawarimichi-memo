import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SimilarityDetails } from './SimilarNotes';
import { starterNotes } from './notes';
import { compareNotes } from './similarity';

describe('similarity diagnostics', () => {
  it('keeps the circuit and actual measured counts together without exposing hidden bodies', () => {
    const notes = starterNotes();
    notes[0].body = '本文の秘密をそのまま表示しない';
    const result = compareNotes({ notes, activeId: notes[0].id }, () => 0.1);
    const html = renderToStaticMarkup(<SimilarityDetails result={result} notes={notes} />);
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).not.toMatch(/<details[^>]+open/);
    expect(html).toContain('比較の詳細'); expect(html).toContain('SWAP');
    expect(html).toContain('4,096'); expect(html).toContain('13量子ビット');
    for (const note of notes) expect(html).not.toContain(note.body);
  });
});
