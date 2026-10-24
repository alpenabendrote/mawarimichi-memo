import type { Note } from './notes';
import { secureRandom } from './quantum/simulator';

export function cardLabel(index: number): string { return `メモ${String.fromCharCode(65 + index)}`; }

/** Shuffle only IDs, never reorder or mutate the saved notebook. */
export function shuffledIds(notes: readonly Note[], random = secureRandom): string[] {
  const ids = notes.map(note => note.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const sample = random();
    if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('乱数は0以上1未満です。');
    const j = Math.floor(sample * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

/** The circuit panel receives no real titles or bodies in sealed mode. */
export function sealedLabels(ids: readonly string[]): { id: string; title: string }[] {
  return ids.map((id, index) => ({ id, title: cardLabel(index) }));
}
