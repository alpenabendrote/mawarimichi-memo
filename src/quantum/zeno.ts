import { measure, probabilities, secureRandom, type StateVector } from './simulator';

/** A collapsed one-qubit state. Its physically irrelevant global phase is omitted on storage. */
export interface ZenoMemory { basis: 0 | 1; at: number }
export const ZENO_TRANSITION_MS = 24 * 60 * 60 * 1000;
export interface ZenoPreparation {
  memory: ZenoMemory;
  at: number;
  elapsed: number;
  angle: number;
  initial: StateVector;
  before: StateVector;
  distribution: number[];
}
export interface ZenoRun extends ZenoPreparation {
  measured: 0 | 1;
  after: StateVector;
  next: ZenoMemory;
}

function validTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
}
export function isZenoMemory(value: unknown): value is ZenoMemory {
  if (!value || typeof value !== 'object') return false;
  const memory = value as Record<string, unknown>;
  return (memory.basis === 0 || memory.basis === 1) && validTime(memory.at);
}
export function newZenoMemory(at: number): ZenoMemory {
  if (!validTime(at)) throw new Error('状態の時刻が不正です。');
  return { basis: 0, at };
}

/** Rx(theta) = cos(theta/2) I - i sin(theta/2) X, applied to complex amplitudes. */
export function rotateZeno(input: StateVector, angle: number): StateVector {
  if (input.length !== 4 || !Number.isFinite(angle)) throw new Error('回転する状態が不正です。');
  const c = Math.cos(angle / 2), s = Math.sin(angle / 2);
  const [ar, ai, br, bi] = input;
  return new Float64Array([c * ar + s * bi, c * ai - s * br, c * br + s * ai, c * bi - s * ar]);
}
export function prepareZeno(memory: ZenoMemory, now: number): ZenoPreparation {
  if (!isZenoMemory(memory) || !validTime(now)) throw new Error('状態または時刻が不正です。');
  const at = Math.max(now, memory.at), elapsed = at - memory.at;
  // A 48-hour probability period. Reduce before converting long elapsed times to radians.
  const angle = Math.PI * ((elapsed % (2 * ZENO_TRANSITION_MS)) / ZENO_TRANSITION_MS);
  const initial = new Float64Array(4); initial[2 * memory.basis] = 1;
  const before = rotateZeno(initial, angle);
  return { memory: { ...memory }, at, elapsed, angle, initial, before, distribution: probabilities(before) };
}
export function measureZeno(memory: ZenoMemory, now: number, random = secureRandom): ZenoRun {
  const prepared = prepareZeno(memory, now);
  const result = measure(prepared.before, random);
  const measured = result.index as 0 | 1;
  return { ...prepared, measured, after: result.state, next: { basis: measured, at: prepared.at } };
}
