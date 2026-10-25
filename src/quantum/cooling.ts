import { applyGate, type StateVector } from './simulator';
import { bufferedRandom, measureQubit, type Bit } from './teleportation';

export const DAMPING = 0.5;
export const MAX_COOLING_STEPS = 64;
export type Qubit = readonly [number, number, number, number];

/** q0 is the system, q1 is a fresh environment in |0>. Basis order is |e s>. */
export function prepareDamping(psi: Qubit, gamma = DAMPING) {
  if (!Number.isFinite(gamma) || gamma < 0 || gamma > 1) throw new Error('減衰率が不正です。');
  if (Math.abs(psi.reduce((sum, a) => sum + a * a, 0) - 1) > 1e-10 || psi.some(a => !Number.isFinite(a))) throw new Error('状態を規格化してください。');
  const initial = new Float64Array(8); initial.set(psi);
  const rotated = initial.slice();
  // Controlled Ry(2 asin(sqrt(gamma))), system -> environment.
  for (let part = 0; part < 2; part++) {
    rotated[2 + part] = psi[2 + part] * Math.sqrt(1 - gamma);
    rotated[6 + part] = psi[2 + part] * Math.sqrt(gamma);
  }
  const coupled = applyGate(rotated, { kind: 'MCX', target: 0, controls: [1], stage: 'prepare', iteration: 0 });
  return { initial, rotated, coupled };
}

/** Environment measurement produces a Kraus trajectory, retaining complex phase. */
export function dampQubit(psi: Qubit, random: () => number, gamma = DAMPING) {
  const trace = prepareDamping(psi, gamma);
  const measured = measureQubit(trace.coupled, 1, random);
  const offset = measured.value * 4;
  const state = Array.from(measured.state.subarray(offset, offset + 4)) as [number, number, number, number];
  return { ...trace, state, environment: measured.value, collapsed: measured.state };
}

export interface CoolingRound { round: number; remaining: number; emitted: number; interactions: number }
export interface CoolingResult {
  /** High bit: original bit. Low 7 bits: actual number of environment interactions. */
  records: Uint8Array;
  bitCount: number;
  initialExcited: number;
  finalZeroCount: number;
  environmentCounts: [number, number];
  rounds: CoolingRound[];
  gamma: number;
  elapsed: number;
}
export type CoolingMessage = { type: 'progress'; completed: number; total: number } | { type: 'done'; result: CoolingResult } | { type: 'error' };
export function decodeCoolingRecord(record: number) { return { input: (record >>> 7) as Bit, steps: record & 127 }; }

/** Exact independent two-qubit trajectories, not a timer or a sampled deletion decision. */
export function coolText(text: string, random = bufferedRandom(), onProgress?: (completed: number) => void): CoolingResult {
  const start = performance.now(), records = new Uint8Array(text.length * 16);
  const histogram = new Uint32Array(MAX_COOLING_STEPS + 1);
  let index = 0, initialExcited = 0, finalZeroCount = 0, interactions = 0, longest = 1;
  for (let unit = 0; unit < text.length; unit++) {
    const code = text.charCodeAt(unit);
    for (let shift = 15; shift >= 0; shift--) {
      const input = (code >>> shift & 1) as Bit;
      let psi: Qubit = input ? [0, 0, 1, 0] : [1, 0, 0, 0];
      let steps = 0;
      do {
        const damped = dampQubit(psi, random);
        psi = damped.state; steps++; interactions++;
        if (psi[2] ** 2 + psi[3] ** 2 === 0) break;
        if (steps === MAX_COOLING_STEPS) throw new Error('緩和を確認できませんでした。メモは削除しません。');
      } while (true);
      // Confirm the final system state by an actual measurement, not by setting it to zero.
      const final = measureQubit(new Float64Array(psi), 0, random);
      if (final.value !== 0) throw new Error('最終状態が0ではありません。');
      finalZeroCount++;
      records[index++] = input << 7 | steps;
      if (input) { initialExcited++; histogram[steps]++; }
      longest = Math.max(longest, steps);
    }
    if (index % 4096 === 0) onProgress?.(index);
  }
  let remaining = initialExcited;
  const rounds: CoolingRound[] = [{ round: 0, remaining, emitted: 0, interactions: 0 }];
  for (let round = 1; round <= longest; round++) {
    const attempts = round === 1 ? records.length : remaining;
    remaining -= histogram[round];
    rounds.push({ round, remaining, emitted: histogram[round], interactions: attempts });
  }
  return { records, bitCount: records.length, initialExcited, finalZeroCount, environmentCounts: [interactions - initialExcited, initialExcited], rounds, gamma: DAMPING, elapsed: performance.now() - start };
}

/** Reconstruct a recorded branch without drawing any new random samples. */
export function coolingSnapshot(record: number, round: number) {
  const { input, steps } = decodeCoolingRecord(record);
  if (!Number.isInteger(round) || round < 1 || round > steps) throw new Error('記録の範囲外です。');
  const environment = input && round === steps ? 1 : 0;
  const trace = prepareDamping(input ? [0, 0, 1, 0] : [1, 0, 0, 0]);
  const collapsed: StateVector = new Float64Array(8);
  collapsed[environment ? 4 : input * 2] = 1;
  return { ...trace, environment, collapsed, final: round === steps };
}

