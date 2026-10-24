import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { initializeZenoNotes, orderZenoNotes, readNoteZeno } from './zenoNotes';
import { parseNotes, starterNotes } from './notes';
import { ZENO_TRANSITION_MS as T } from './quantum/zeno';
import { ZenoPanel } from './ZenoPanel';
import { App } from './App';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('Zeno notebook integration', () => {
  it('adds state to old notes without changing their contents or edit timestamps, and round-trips measurements', () => {
    const original = starterNotes(), before = JSON.stringify(original);
    const initialized = initializeZenoNotes(original, 0);
    expect(JSON.stringify(original)).toBe(before);
    for (const [i, note] of initialized.entries()) expect(note).toEqual({ ...original[i], zeno: { basis: 0, at: 0 } });
    const draw = vi.fn(() => 0.9);
    const read = readNoteZeno(initialized, original[1].id, 'walk', T / 2, draw);
    expect(draw).toHaveBeenCalledOnce();
    expect(read.notes[1]).toEqual({ ...original[1], zeno: { basis: 1, at: T / 2 } });
    expect(read.notes[0]).toBe(initialized[0]);
    expect(parseNotes(JSON.stringify(read.notes))).toEqual(read.notes);
    expect(initializeZenoNotes(read.notes, T)[1].zeno).toEqual({ basis: 1, at: T / 2 });
  });
  it('moves dormant-leaning notes below others without measurement, data loss or mutations to stored order', () => {
    const notes = initializeZenoNotes(starterNotes(), 0);
    notes[1].zeno = { basis: 0, at: T };
    notes[3].zeno = { basis: 0, at: T };
    const before = JSON.stringify(notes);
    const entries = orderZenoNotes(notes, T);
    expect(entries.map(e => e.note.id)).toEqual([notes[1].id, notes[3].id, notes[0].id, notes[2].id]);
    expect(entries.map(e => e.dormant)).toEqual([false, false, true, true]);
    expect(JSON.stringify(notes)).toBe(before);
    // Exact 50% ties stay in the normal group.
    expect(orderZenoNotes(initializeZenoNotes(starterNotes(), 0), T / 2).every(e => !e.dormant)).toBe(true);
  });
  it('recovers only malformed optional state while preserving the text of an otherwise valid saved note', () => {
    const note = { ...starterNotes()[0], zeno: { basis: 4, at: 'bad' } };
    const parsed = parseNotes(JSON.stringify([note]));
    expect(parsed[0].body).toBe(note.body);
    expect(parsed[0].zeno).toBeUndefined();
    expect(initializeZenoNotes(parsed, 100)[0].zeno).toEqual({ basis: 0, at: 100 });
  });
  it('shows only recorded measurement results, the actual complex state and captured title without exposing the body', () => {
    const notes = initializeZenoNotes(starterNotes(), 0);
    const props = { note: notes[0], at: T / 2, open: true, onOpenChange: () => {} };
    const pending = renderToStaticMarkup(<ZenoPanel {...props} record={null} />);
    expect(pending).toContain('まだ測定していません');
    expect(pending).toContain('50.00%');
    expect(pending).toContain('Mは未実行');
    const reading = readNoteZeno(notes, notes[0].id, 'search', T / 2, () => 0.9);
    const html = renderToStaticMarkup(<ZenoPanel {...props} record={reading.record} />);
    expect(html).toContain('休眠 |1⟩');
    expect(html).toContain('0.000000 − 1.000000i');
    expect(html).toContain('測定結果1');
    expect(html).not.toContain(notes[0].body);
    notes[0].title = '後から編集';
    expect(reading.record.title).not.toBe(notes[0].title);
  });
  it('uses the displayed partition for the search target and restores metadata at full notebook capacity', () => {
    vi.useFakeTimers(); vi.setSystemTime(T);
    const notes = initializeZenoNotes(Array.from({ length: 128 }, (_, i) => ({ ...starterNotes()[i % 4], id: String(i), title: `note-${i}`, body: `HIDDEN_BODY_${i}` })), 0);
    notes[127].zeno = { basis: 0, at: T };
    vi.stubGlobal('window', { localStorage: { getItem: () => JSON.stringify(notes) } });
    const html = renderToStaticMarkup(<App />);
    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
    expect(nav.indexOf('note-127')).toBeLessThan(nav.indexOf('note-0'));
    expect(html).toContain('通常の確率 0.00%');
    expect(html).toContain('休眠寄り');
    expect(html).toContain('ゼノン効果の詳細');
    const caption = html.match(/<p class="quantum-caption">次の観測：([\s\S]*?)<\/p>/)?.[1];
    expect(caption).toContain('note-0');
    expect(caption).not.toContain('note-127');
    for (const note of notes) expect(html).not.toContain(note.body);
    expect(() => readNoteZeno(notes, 'missing', 'search', T)).toThrow();
  });
});
