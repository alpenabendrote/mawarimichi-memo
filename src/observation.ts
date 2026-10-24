import { measureSearchAt, prepareSearch, secureRandom } from './quantum/simulator';

/** One click computes the circuit and measures. Null means the final position. */
export function observeNote(count: number, target: number, step: number | null = null, random = secureRandom) {
  const trace = prepareSearch(count, target);
  return measureSearchAt(trace, step ?? trace.snapshots.length - 1, random);
}
