import { noteTitle, type Note } from './notes';
import { measureZeno, newZenoMemory, prepareZeno, type ZenoRun } from './quantum/zeno';

export interface ZenoReadRecord { noteId: string; title: string; reason: 'search' | 'walk'; run: ZenoRun }
export function initializeZenoNotes(notes: Note[], at: number): Note[] {
  return notes.map(note => note.zeno ? note : { ...note, zeno: newZenoMemory(at) });
}

/** A display policy, not a measurement. Stable partition leaves the stored order untouched. */
export function orderZenoNotes(notes: Note[], at: number) {
  return notes.map((note, index) => {
    const distribution = prepareZeno(note.zeno ?? newZenoMemory(at), at).distribution;
    return { note, index, normalProbability: distribution[0], dormant: distribution[1] > 0.5 + 1e-12 };
  }).sort((a, b) => Number(a.dormant) - Number(b.dormant) || a.index - b.index);
}

/** Measure outside React state updaters: Strict Mode must never draw twice. */
export function readNoteZeno(notes: Note[], id: string, reason: ZenoReadRecord['reason'], at: number, random?: () => number) {
  const source = notes.find(note => note.id === id);
  if (!source) throw new Error('読むメモが見つかりません。');
  const run = measureZeno(source.zeno ?? newZenoMemory(at), at, random);
  return {
    notes: notes.map(note => note.id === id ? { ...note, zeno: run.next } : note),
    record: { noteId: id, title: noteTitle(source), reason, run } satisfies ZenoReadRecord,
  };
}
