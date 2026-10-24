import { applyGate, MAX_NOTES, secureRandom, type StateVector } from './simulator';

export type WalkOperation = 'prepare' | 'H' | 'S+' | 'S−' | 'exclude' | 'M';
export interface WalkSnapshot { operation: WalkOperation; step: number; label: string; state: StateVector }
export interface PreparedWalk {
  count: number;
  source: number;
  positionQubits: number;
  steps: number;
  snapshots: WalkSnapshot[];
  /** Position marginal immediately after the unitary walk, before excluding the source. */
  walkProbabilities: number[];
  selectionProbabilities: number[];
  eligibleProbability: number;
  measurementStep: number;
}
export interface WalkRun extends PreparedWalk { measured: number; elapsed: number }

function validate(count: number, source = 0) {
  if (!Number.isInteger(count) || count < 2 || count > MAX_NOTES || !Number.isInteger(source) || source < 0 || source >= count) throw new Error('おまかせには2〜16件のメモと有効な出発点が必要です。');
}

/** q0 is the coin; the remaining qubits encode position. Unused positions are fixed points. */
export function shiftWalk(input: StateVector, count: number, direction: 1 | -1): StateVector {
  validate(count);
  if (input.length !== 4 * 2 ** Math.ceil(Math.log2(count)) || (direction !== 1 && direction !== -1)) throw new Error('移動する状態が不正です。');
  const output = new Float64Array(input.length);
  const dimension = input.length / 4;
  for (let position = 0; position < dimension; position++) for (let coin = 0; coin < 2; coin++) {
    const moves = position < count && (direction === 1 ? coin === 1 : coin === 0);
    const destination = moves ? (position + direction + count) % count : position;
    const from = 4 * position + 2 * coin, to = 4 * destination + 2 * coin;
    output[to] = input[from]; output[to + 1] = input[from + 1];
  }
  return output;
}

/** Trace out the coin, adding probabilities rather than amplitudes of distinct coin states. */
export function walkPositionProbabilities(state: StateVector, count: number): number[] {
  return Array.from({ length: count }, (_, x) => state[4 * x] ** 2 + state[4 * x + 1] ** 2 + state[4 * x + 2] ** 2 + state[4 * x + 3] ** 2);
}

/** H, conditional right, H, conditional left: a two-part coined walk with a stay path. */
export function prepareWalk(count: number, source: number): PreparedWalk {
  validate(count, source);
  const positionQubits = Math.ceil(Math.log2(count)), steps = Math.max(3, count);
  let state: StateVector = new Float64Array(4 * 2 ** positionQubits);
  state[4 * source] = 1;
  const h = { kind: 'H' as const, target: 0, controls: [], stage: 'prepare' as const, iteration: 0 };
  state = applyGate(applyGate(state, h), { ...h, kind: 'S' }); // coin |+i>, prepared with H then S
  const snapshots: WalkSnapshot[] = [{ operation: 'prepare', step: 0, label: '出発メモとコイン |+i⟩ を準備', state }];
  const record = (operation: WalkOperation, step: number, label: string) => snapshots.push({ operation, step, label, state });
  for (let step = 1; step <= steps; step++) {
    state = applyGate(state, h); record('H', step, `${step}歩目：コインにH（前半）`);
    state = shiftWalk(state, count, 1); record('S+', step, `${step}歩目：コイン1を右隣へ移動（S+）`);
    state = applyGate(state, h); record('H', step, `${step}歩目：コインにH（後半）`);
    state = shiftWalk(state, count, -1); record('S−', step, `${step}歩目：コイン0を左隣へ移動（S−）`);
  }
  const walkProbabilities = walkPositionProbabilities(state, count);
  const eligibleProbability = walkProbabilities.reduce((sum, p, i) => sum + (i === source ? 0 : p), 0);
  if (!Number.isFinite(eligibleProbability) || eligibleProbability < 1e-12) throw new Error('他のメモに測定可能な確率がありません。');
  const eligible = new Float64Array(state.length), scale = 1 / Math.sqrt(eligibleProbability);
  for (let position = 0; position < count; position++) if (position !== source) {
    for (let part = 0; part < 4; part++) eligible[4 * position + part] = state[4 * position + part] * scale;
  }
  state = eligible;
  record('exclude', steps, '出発メモを候補から除き、残りを正規化（選択ルール）');
  return { count, source, positionQubits, steps, snapshots, walkProbabilities, selectionProbabilities: walkPositionProbabilities(state, count), eligibleProbability, measurementStep: snapshots.length - 1 };
}

/** One position measurement, preserving the conditional coin state and complex phases. */
export function measureWalk(prepared: PreparedWalk, random = secureRandom): WalkRun {
  const start = performance.now(), sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('乱数は0以上1未満です。');
  const distribution = prepared.selectionProbabilities;
  const total = distribution.reduce((sum, p) => sum + p, 0);
  let cumulative = 0, measured = distribution.findLastIndex(p => p > 0);
  for (let position = 0; position < prepared.count; position++) {
    cumulative += distribution[position] / total;
    if (sample < cumulative) { measured = position; break; }
  }
  const before = prepared.snapshots[prepared.measurementStep].state;
  const state = new Float64Array(before.length), scale = 1 / Math.sqrt(distribution[measured]);
  for (let part = 0; part < 4; part++) state[4 * measured + part] = before[4 * measured + part] * scale;
  return { ...prepared, measured, elapsed: performance.now() - start, snapshots: [...prepared.snapshots, { operation: 'M', step: prepared.steps, label: `位置を1回測定：メモ番号 ${measured}`, state }] };
}

export function runWalk(count: number, source: number, random = secureRandom): WalkRun {
  const start = performance.now();
  return { ...measureWalk(prepareWalk(count, source), random), elapsed: performance.now() - start };
}
