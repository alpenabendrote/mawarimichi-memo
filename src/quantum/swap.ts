import { applyGate, type StateVector } from './simulator';

export interface PreparationRotation { target: number; controls: number[]; pattern: number; angle: number }

/** A binary tree of controlled Ry gates prepares a real, nonnegative amplitude vector. */
export function prepareAmplitudes(vector: readonly number[]): { state: StateVector; rotations: PreparationRotation[] } {
  const qubits = Math.log2(vector.length);
  const norm = vector.reduce((sum, value) => sum + value * value, 0);
  if (!Number.isInteger(qubits) || qubits < 1 || qubits > 6 || vector.some(v => !Number.isFinite(v) || v < 0) || Math.abs(norm - 1) > 1e-10) throw new Error('特徴ベクトルを規格化してください。');
  let state: StateVector = new Float64Array(vector.length * 2);
  state[0] = 1;
  const rotations: PreparationRotation[] = [];
  for (let target = qubits - 1; target >= 0; target--) {
    const size = 2 ** (target + 1), half = size / 2;
    for (let start = 0; start < vector.length; start += size) {
      let left = 0, right = 0;
      for (let i = start; i < start + half; i++) left += vector[i] ** 2;
      for (let i = start + half; i < start + size; i++) right += vector[i] ** 2;
      if (left + right < 1e-30 || right === 0) continue;
      const angle = 2 * Math.atan2(Math.sqrt(right), Math.sqrt(left));
      const controls = Array.from({ length: qubits - target - 1 }, (_, i) => target + 1 + i);
      rotations.push({ target, controls, pattern: start, angle });
      const next = state.slice(), c = Math.cos(angle / 2), s = Math.sin(angle / 2);
      for (let i = start; i < start + half; i++) {
        const j = i + half;
        for (let part = 0; part < 2; part++) {
          next[2 * i + part] = c * state[2 * i + part] - s * state[2 * j + part];
          next[2 * j + part] = s * state[2 * i + part] + c * state[2 * j + part];
        }
      }
      state = next;
    }
  }
  return { state, rotations };
}

function validateState(state: StateVector) {
  const dimension = state.length / 2;
  const norm = state.reduce((sum, value) => sum + value * value, 0);
  if (!Number.isInteger(Math.log2(dimension)) || dimension < 2 || dimension > 64 || !Number.isFinite(norm) || Math.abs(norm - 1) > 1e-10) throw new Error('入力状態が不正です。');
}

/** Fredkin gate: control q0, swap the corresponding qubits of registers A and B. */
export function controlledSwap(input: StateVector, a: number, b: number): StateVector {
  const output = input.slice();
  const aMask = 1 << a, bMask = 1 << b;
  for (let i = 0; i < input.length / 2; i++) {
    if (!(i & 1) || (i & aMask) || !(i & bMask)) continue;
    const j = i ^ aMask ^ bMask;
    output[2 * i] = input[2 * j]; output[2 * i + 1] = input[2 * j + 1];
    output[2 * j] = input[2 * i]; output[2 * j + 1] = input[2 * i + 1];
  }
  return output;
}

/** Execute H–controlled-SWAP–H on the full complex joint state; no overlap formula. */
export function prepareSwapTest(a: StateVector, b: StateVector) {
  validateState(a); validateState(b);
  if (a.length !== b.length) throw new Error('入力状態の大きさを揃えてください。');
  const dimension = a.length / 2, registerQubits = Math.log2(dimension);
  let state: StateVector = new Float64Array(4 * dimension * dimension);
  for (let i = 0; i < dimension; i++) for (let j = 0; j < dimension; j++) {
    const index = 2 * (i + dimension * j);
    state[2 * index] = a[2 * i] * b[2 * j] - a[2 * i + 1] * b[2 * j + 1];
    state[2 * index + 1] = a[2 * i] * b[2 * j + 1] + a[2 * i + 1] * b[2 * j];
  }
  const hadamard = { kind: 'H', target: 0, controls: [], stage: 'prepare', iteration: 0 } as const;
  state = applyGate(state, { ...hadamard, controls: [] });
  for (let q = 0; q < registerQubits; q++) state = controlledSwap(state, q + 1, q + 1 + registerQubits);
  state = applyGate(state, { ...hadamard, controls: [] });
  const probabilities: [number, number] = [0, 0];
  for (let i = 0; i < state.length / 2; i++) probabilities[i & 1] += state[2 * i] ** 2 + state[2 * i + 1] ** 2;
  const norm = probabilities[0] + probabilities[1];
  probabilities[0] /= norm; probabilities[1] /= norm;
  return { state, probabilities, registerQubits };
}

/** Independent preparations/shots share the computed distribution, never a collapsed state. */
export function sampleSwapTest(distribution: readonly [number, number], shots: number, random: () => number) {
  if (!Number.isInteger(shots) || shots < 1 || shots > 1_000_000) throw new Error('測定回数が不正です。');
  const counts: [number, number] = [0, 0];
  for (let i = 0; i < shots; i++) {
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('乱数は0以上1未満です。');
    counts[draw < distribution[0] ? 0 : 1]++;
  }
  return { counts, shots, overlap: Math.max(0, Math.min(1, 2 * counts[0] / shots - 1)) };
}
