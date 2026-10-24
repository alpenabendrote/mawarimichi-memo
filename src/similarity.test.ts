import { describe, expect, it } from 'vitest';
import { characterFeatures, compareNotes, encodeNotebook, similarCandidate, SIMILARITY_SHOTS } from './similarity';

function randomSamples() {
  let n = 0;
  return () => ((n++ * 2053) % 4096 + 0.5) / 4096;
}
const note = (id: string, title: string, body: string) => ({ id, title, body });

describe('note similarity', () => {
  it('normalizes fullwidth characters and case, respects word/field boundaries and handles emoji', () => {
    expect(characterFeatures(note('a', 'ＡＢＣ', 'コーヒー 🪐'))).toEqual(characterFeatures(note('b', 'abc', 'コーヒー 🪐')));
    const features = characterFeatures(note('a', '猫', '犬'));
    expect(features.has('b:猫犬')).toBe(false);
    expect(features.has('u:猫')).toBe(true);
    expect(characterFeatures(note('a', '', '🪐')).has('u:🪐')).toBe(true);
  });
  it('uses the same basis across the notebook, is invariant to note order, and skips empty vectors', () => {
    const notes = [note('a', '旅行', '持ち物 コーヒー'), note('b', '買い物', 'コーヒー 牛乳'), note('c', '', ' \n。')];
    const forward = encodeNotebook(notes), reverse = encodeNotebook([...notes].reverse());
    expect(forward.vectors[0]).toEqual(reverse.vectors[2]);
    expect(forward.vectors[2]).toBeNull();
    expect(Math.hypot(...forward.vectors[0]!)).toBeCloseTo(1, 12);
  });
  it('retains every nonempty note without hash collisions across the 64/128 dimension boundary', () => {
    for (const count of [16, 17, 64, 65, 128]) {
      const notes = Array.from({ length: count }, (_, i) => note(`${i}`, '', String.fromCodePoint(0x4e00 + i).repeat(i === count - 1 ? 200000 : 1)));
      const encoded = encodeNotebook(notes);
      expect(encoded.vectors.every(Boolean)).toBe(true);
      expect(encoded.dimension).toBe(count <= 64 ? 64 : 128);
      expect(encoded.vectors.every(v => v!.length === encoded.dimension)).toBe(true);
      const a = encoded.vectors[0]!, b = encoded.vectors[1]!;
      expect(a.reduce((dot, value, i) => dot + value * b[i], 0)).toBe(0);
      expect(encoded.featureCount).toBe(count);
    }
  });
  it('compares all other notes at capacity and identifies a measured duplicate among 127 candidates', () => {
    const notes = Array.from({ length: 128 }, (_, i) => note(`${i}`, '', String.fromCodePoint(0x4e00 + i)));
    notes[127].body = notes[0].body;
    const before = JSON.stringify(notes);
    const result = compareNotes({ notes, activeId: '0' }, randomSamples());
    expect(result.featureDimension).toBe(128);
    expect(result.candidates).toHaveLength(127);
    expect(similarCandidate(result)?.id).toBe('127');
    expect(result.candidates[0].counts).toEqual([4096, 0]);
    expect(result.candidates.slice(1).every(c => c.counts[0] === 2048 && c.counts[1] === 2048)).toBe(true);
    expect(JSON.stringify(notes)).toBe(before);
    expect(() => compareNotes({ notes: [...notes, note('extra', '', '追加')], activeId: '0' })).toThrow();
  });
  it('ranks an actual duplicate first with measured 100%, without changing or returning note text', () => {
    const notes = [note('source', '旅行の持ち物', 'パスポート 財布 カメラ'), note('unrelated', '献立', '牛乳 チーズ'), note('same', '旅行の持ち物', 'パスポート 財布 カメラ')];
    const before = JSON.stringify(notes);
    const result = compareNotes({ notes, activeId: 'source' }, randomSamples());
    expect(similarCandidate(result)?.id).toBe('same');
    expect(result.candidates[0].counts).toEqual([SIMILARITY_SHOTS, 0]);
    expect(result.candidates[0].overlap).toBe(1);
    expect(result.candidates.every(c => c.id !== 'source' && c.counts[0] + c.counts[1] === SIMILARITY_SHOTS)).toBe(true);
    expect(result.candidates.find(c => c.id === 'unrelated')!.overlap).toBe(0);
    expect(JSON.stringify(result)).not.toContain('パスポート');
    expect(JSON.stringify(notes)).toBe(before);
  });
  it('returns no suggestion for unrelated, empty, or single-note notebooks', () => {
    const notes = [note('a', '', '猫猫'), note('b', '', '犬犬')];
    expect(similarCandidate(compareNotes({ notes, activeId: 'a' }, randomSamples()))).toBeNull();
    expect(compareNotes({ notes: [...notes, note('blank', '', '')], activeId: 'blank' }).candidates).toEqual([]);
    expect(compareNotes({ notes: notes.slice(0, 1), activeId: 'a' }).candidates).toEqual([]);
  });
  it('uses sampled counts for ranking instead of returning a classical dot product', () => {
    const result = compareNotes({ notes: [note('a', '', '猫猫'), note('b', '', '犬犬')], activeId: 'a' }, () => 0.01);
    expect(result.candidates[0].probabilityZero).toBeCloseTo(0.5, 12);
    expect(similarCandidate(result)?.overlap).toBe(1);
  });
});
