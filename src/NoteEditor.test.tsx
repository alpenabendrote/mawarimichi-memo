import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from './App';
import { NoteEditor } from './NoteEditor';
import { starterNotes } from './notes';

const callbacks = { onChange: () => {}, onHide: () => {} };
afterEach(() => vi.unstubAllGlobals());

describe('body-only concealment', () => {
  const note = { ...starterNotes()[0], body: 'CONFIDENTIAL_BODY_12345' };
  it('keeps the title visible while excluding the body and textarea', () => {
    const html = renderToStaticMarkup(<NoteEditor note={note} bodyVisible={false} {...callbacks} />);
    expect(html).toContain(note.title);
    expect(html).not.toContain(note.body);
    expect(html).not.toContain('<textarea');
    expect(html).toContain('本文は伏せています');
  });
  it('allows editing the revealed body in place', () => {
    const html = renderToStaticMarkup(<NoteEditor note={note} bodyVisible={true} {...callbacks} />);
    expect(html).toContain('<textarea');
    expect(html).toContain(note.body);
    expect(html).toContain('本文を伏せる');
  });
  it('shows saved titles without leaking body excerpts or rendering mode switches', () => {
    const notes = starterNotes().map((n, i) => ({ ...n, body: `SECRET_BODY_${i}` }));
    vi.stubGlobal('window', { localStorage: { getItem: () => JSON.stringify(notes) } });
    const html = renderToStaticMarkup(<App />);
    for (const n of notes) {
      expect(html).toContain(n.title);
      expect(html).not.toContain(n.body);
    }
    expect(html).not.toContain('<textarea');
    expect(html).not.toContain('伏せて探す');
    expect(html).not.toContain('シャッフル');
    expect(html.match(/>量子検索<\/button>/g)).toHaveLength(1);
  });
  it('preserves an empty notebook instead of replacing it with samples', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => '[]' } });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('メモはありません');
    expect(html).not.toContain(starterNotes()[0].title);
  });
});
