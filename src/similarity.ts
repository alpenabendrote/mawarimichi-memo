import { bufferedRandom } from './quantum/teleportation';
import { prepareAmplitudes, prepareSwapTest, sampleSwapTest } from './quantum/swap';
import { MAX_NOTES } from './quantum/simulator';

export interface SimilarityNote { id: string; title: string; body: string }
const MIN_FEATURE_DIMENSION = 64;
export const SIMILARITY_SHOTS = 4096;
export const MIN_SIMILARITY = 0.1;

/** Classical preprocessing. Tokens never appear in diagnostics or leave the worker. */
export function characterFeatures(note: Pick<SimilarityNote, 'title' | 'body'>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const field of [note.title, note.body]) {
    for (const word of field.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}\p{M}\p{S}\u200d]+/gu) ?? []) {
      const chars = Array.from(word);
      const grams = chars.length === 1 ? [`u:${chars[0]}`] : chars.slice(0, -1).map((char, i) => `b:${char}${chars[i + 1]}`);
      for (const gram of grams) counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  }
  return counts;
}

/** A shared, deterministic TF-IDF vocabulary; no hash collisions or pair-specific bases. */
export function encodeNotebook(notes: readonly SimilarityNote[]) {
  const dimension = Math.max(MIN_FEATURE_DIMENSION, 2 ** Math.ceil(Math.log2(Math.max(1, notes.length))));
  const documents = notes.map(characterFeatures);
  const frequency = new Map<string, number>();
  for (const document of documents) for (const token of document.keys()) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  const importance = new Map<string, number>();
  const weighted = documents.map(document => {
    const values = new Map<string, number>();
    let norm = 0;
    for (const [token, count] of document) {
      const value = (1 + Math.log(count)) * (1 + Math.log((1 + notes.length) / (1 + frequency.get(token)!)));
      values.set(token, value); norm += value * value;
    }
    if (norm) for (const [token, value] of values) importance.set(token, (importance.get(token) ?? 0) + value * value / norm);
    return values;
  });
  const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const selected = new Set<string>();
  // Reserve at least one feature per document, even at the notebook's full capacity.
  const perNote = Math.min(4, Math.floor(dimension / Math.max(1, notes.length)));
  for (const document of weighted) {
    const local = [...document.keys()].sort((a, b) => document.get(b)! - document.get(a)! || lexical(a, b));
    for (const token of local.slice(0, perNote)) selected.add(token);
  }
  const ordered = [...importance.keys()].sort((a, b) => importance.get(b)! - importance.get(a)! || lexical(a, b));
  for (const token of ordered) { if (selected.size >= dimension) break; selected.add(token); }
  const vocabulary = [...selected].sort(lexical);
  const vectors = weighted.map(values => {
    const vector = Array.from({ length: dimension }, (_, i) => values.get(vocabulary[i]) ?? 0);
    const norm = Math.hypot(...vector);
    return norm ? vector.map(value => value / norm) : null;
  });
  return { vectors, dimension, featureCount: vocabulary.length, omittedFeatures: Math.max(0, frequency.size - vocabulary.length) };
}

export interface SimilarityCandidate {
  id: string;
  counts: [number, number];
  shots: number;
  overlap: number;
  probabilityZero: number;
  preparationGates: number;
}
export interface SimilarityResult {
  activeId: string;
  candidates: SimilarityCandidate[];
  featureCount: number;
  omittedFeatures: number;
  sourcePreparationGates: number;
  featureDimension: number;
  elapsed: number;
}
export interface SimilarityRequest { notes: SimilarityNote[]; activeId: string }
export type SimilarityMessage = { type: 'progress'; completed: number; total: number } | { type: 'done'; result: SimilarityResult } | { type: 'error' };

export function compareNotes(request: SimilarityRequest, random = bufferedRandom(), onProgress?: (completed: number, total: number) => void): SimilarityResult {
  const start = performance.now();
  const { notes, activeId } = request;
  const index = notes.findIndex(note => note.id === activeId);
  if (index < 0 || notes.length > MAX_NOTES || new Set(notes.map(note => note.id)).size !== notes.length) throw new Error('比較するメモが不正です。');
  const encoded = encodeNotebook(notes);
  const result: SimilarityResult = { activeId, candidates: [], featureDimension: encoded.dimension, featureCount: encoded.featureCount, omittedFeatures: encoded.omittedFeatures, sourcePreparationGates: 0, elapsed: 0 };
  const vector = encoded.vectors[index];
  if (vector) {
    const source = prepareAmplitudes(vector);
    result.sourcePreparationGates = source.rotations.length;
    const candidates = notes.map((note, i) => ({ note, vector: encoded.vectors[i] })).filter((entry, i) => i !== index && entry.vector !== null);
    for (const [i, entry] of candidates.entries()) {
      const target = prepareAmplitudes(entry.vector!);
      const circuit = prepareSwapTest(source.state, target.state);
      const measured = sampleSwapTest(circuit.probabilities, SIMILARITY_SHOTS, random);
      result.candidates.push({ id: entry.note.id, ...measured, probabilityZero: circuit.probabilities[0], preparationGates: target.rotations.length });
      onProgress?.(i + 1, candidates.length);
    }
    // Rank measured estimates only; the ideal circuit probability is diagnostic data.
    result.candidates.sort((a, b) => b.overlap - a.overlap);
  }
  result.elapsed = performance.now() - start;
  return result;
}

export function similarCandidate(result: SimilarityResult): SimilarityCandidate | null {
  return result.candidates[0]?.overlap >= MIN_SIMILARITY ? result.candidates[0] : null;
}
