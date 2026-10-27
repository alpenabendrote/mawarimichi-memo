import { bufferedRandom, type Bit } from './teleportation';
import type { StateVector } from './simulator';

export type PhaseNoise = -1 | 0 | 1 | 2;
export type Qubit = readonly [number, number, number, number];
export interface CorrectionStep {
  label: string;
  kind: 'H' | 'X' | 'Z' | 'CX' | 'M' | 'I';
  target: number;
  control?: number;
  measured?: Bit;
  stage: 'prepare' | 'noise' | 'check' | 'correct' | 'decode' | 'measure';
}
export interface CorrectionSnapshot { step: CorrectionStep | null; state: StateVector }
export interface CorrectionTrace {
  snapshots: CorrectionSnapshot[];
  syndrome: [Bit, Bit];
  correction: PhaseNoise;
  output: Bit;
}
export const MAX_SAVE_RECORDS = 256;
export interface CorrectionSummary {
  bitCount: number;
  records: Uint8Array;
  positions: number[];
  /** q3q4 in displayed order: 00, 01, 10, 11. */
  syndromeCounts: [number, number, number, number];
  /** No error, Z(q0), Z(q1), Z(q2); at most one per code block. */
  noiseCounts: [number, number, number, number];
  correctedCount: number;
  elapsed: number;
}
export type CorrectionMessage = { type: 'progress'; completed: number; total: number }
  | { type: 'done'; output: string; result: CorrectionSummary }
  | { type: 'error' };

const encode: CorrectionStep[] = [
  { kind: 'CX', target: 1, control: 0, label: '符号化 CX q0→q1', stage: 'prepare' },
  { kind: 'CX', target: 2, control: 0, label: '符号化 CX q0→q2', stage: 'prepare' },
  ...[0, 1, 2].map(target => ({ kind: 'H' as const, target, label: '符号化 H q' + target, stage: 'prepare' as const })),
];
const check: CorrectionStep[] = [
  { kind: 'H', target: 3, label: '検査 H q3', stage: 'check' },
  { kind: 'CX', control: 3, target: 0, label: '検査 CX q3→q0', stage: 'check' },
  { kind: 'CX', control: 3, target: 1, label: '検査 CX q3→q1', stage: 'check' },
  { kind: 'H', target: 3, label: '検査 H q3', stage: 'check' },
  { kind: 'M', target: 3, label: 'q3を測定', stage: 'check' },
  { kind: 'H', target: 4, label: '検査 H q4', stage: 'check' },
  { kind: 'CX', control: 4, target: 1, label: '検査 CX q4→q1', stage: 'check' },
  { kind: 'CX', control: 4, target: 2, label: '検査 CX q4→q2', stage: 'check' },
  { kind: 'H', target: 4, label: '検査 H q4', stage: 'check' },
  { kind: 'M', target: 4, label: 'q4を測定', stage: 'check' },
];
const decode: CorrectionStep[] = [
  ...[0, 1, 2].map(target => ({ kind: 'H' as const, target, label: '復号 H q' + target, stage: 'decode' as const })),
  { kind: 'CX', control: 0, target: 2, label: '復号 CX q0→q2', stage: 'decode' },
  { kind: 'CX', control: 0, target: 1, label: '復号 CX q0→q1', stage: 'decode' },
];
const noiseSteps: CorrectionStep[] = [
  { kind: 'I', target: 0, label: '人工ノイズなし', stage: 'noise' },
  ...[0, 1, 2].map(target => ({ kind: 'Z' as const, target, label: '人工ノイズ Z q' + target, stage: 'noise' as const })),
];
const corrections: CorrectionStep[] = [
  { kind: 'I', target: 0, label: '訂正なし', stage: 'correct' },
  ...[0, 1, 2].map(target => ({ kind: 'Z' as const, target, label: '測定に基づく訂正 Z q' + target, stage: 'correct' as const })),
];
const finalMeasurement: CorrectionStep = { kind: 'M', target: 0, label: '復元したq0を測定', stage: 'measure' };

/** In-place gates on all 32 complex amplitudes; never substitute a truth table. */
function unitary(state: StateVector, step: CorrectionStep) {
  const mask = 1 << step.target;
  for (let i = 0; i < 32; i++) {
    if (i & mask || (step.kind === 'CX' && !(i & (1 << step.control!)))) continue;
    const a = 2 * i, b = 2 * (i | mask);
    const ar = state[a], ai = state[a + 1], br = state[b], bi = state[b + 1];
    if (step.kind === 'H') {
      state[a] = (ar + br) * Math.SQRT1_2; state[a + 1] = (ai + bi) * Math.SQRT1_2;
      state[b] = (ar - br) * Math.SQRT1_2; state[b + 1] = (ai - bi) * Math.SQRT1_2;
    } else if (step.kind === 'CX' || step.kind === 'X') {
      state[a] = br; state[a + 1] = bi; state[b] = ar; state[b + 1] = ai;
    } else if (step.kind === 'Z') {
      state[b] = -br; state[b + 1] = -bi;
    }
  }
}
function sample(random: () => number) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw Error('乱数は0以上1未満です。');
  return value;
}
/** Partial projective measurement, preserving every unmeasured phase. */
function measure(state: StateVector, target: number, random: () => number): Bit {
  let p0 = 0, p1 = 0;
  const mask = 1 << target;
  for (let i = 0; i < 32; i++) {
    const p = state[2 * i] ** 2 + state[2 * i + 1] ** 2;
    if (i & mask) p1 += p; else p0 += p;
  }
  if (!Number.isFinite(p0 + p1) || p0 + p1 <= 0) throw Error('量子状態が不正です。');
  const value: Bit = sample(random) < p0 / (p0 + p1) ? 0 : 1;
  const scale = 1 / Math.sqrt(value ? p1 : p0);
  for (let i = 0; i < 32; i++) {
    if (Number(Boolean(i & mask)) === value) { state[2 * i] *= scale; state[2 * i + 1] *= scale; }
    else { state[2 * i] = 0; state[2 * i + 1] = 0; }
  }
  return value;
}

/** Returns packed measured syndrome and output. Correction depends only on syndrome. */
function evolve(state: StateVector, noise: PhaseNoise, random: () => number, snapshots?: CorrectionSnapshot[]) {
  const apply = (step: CorrectionStep) => {
    if (step.kind === 'M') {
      const measured = measure(state, step.target, random);
      snapshots?.push({ step: { ...step, measured }, state: state.slice() });
      return measured;
    }
    if (step.kind !== 'I') unitary(state, step);
    snapshots?.push({ step, state: state.slice() });
    return 0 as Bit;
  };
  for (const step of encode) apply(step);
  apply(noiseSteps[noise + 1]);
  let s0: Bit = 0, s1: Bit = 0;
  for (const step of check) {
    const value = apply(step);
    if (step.kind === 'M') { if (step.target === 3) s0 = value; else s1 = value; }
  }
  // Displayed q3q4: 00 -> none, 10 -> q0, 11 -> q1, 01 -> q2.
  const correction: PhaseNoise = s0 ? (s1 ? 1 : 0) : (s1 ? 2 : -1);
  apply(corrections[correction + 1]);
  for (const step of decode) apply(step);
  const output = apply(finalMeasurement);
  return s0 | s1 << 1 | output << 2;
}

/** Also supports unknown complex inputs, for verification of the quantum code. */
export function tracePhaseCorrection(psi: Qubit, noise: PhaseNoise, random = bufferedRandom()): CorrectionTrace {
  if (![ -1, 0, 1, 2 ].includes(noise)) throw Error('ノイズの位置が不正です。');
  if (psi.some(x => !Number.isFinite(x)) || Math.abs(psi.reduce((n, x) => n + x * x, 0) - 1) > 1e-10) throw Error('入力状態を規格化してください。');
  const state = new Float64Array(64); state.set(psi);
  const snapshots: CorrectionSnapshot[] = [{ step: null, state: state.slice() }];
  const packed = evolve(state, noise, random, snapshots);
  const s0 = (packed & 1) as Bit, s1 = (packed >>> 1 & 1) as Bit;
  return { snapshots, syndrome: [s0, s1], correction: s0 ? (s1 ? 1 : 0) : (s1 ? 2 : -1), output: (packed >>> 2) as Bit };
}

export function decodeCorrectionRecord(record: number) {
  return { input: (record & 1) as Bit, noise: ((record >>> 1 & 3) - 1) as PhaseNoise,
    syndrome: [(record >>> 3 & 1) as Bit, (record >>> 4 & 1) as Bit] as [Bit, Bit], output: (record >>> 5 & 1) as Bit };
}
/** Replay recorded projective outcomes; never draw another random sample. */
export function correctionRecordTrace(record: number) {
  const r = decodeCorrectionRecord(record);
  const values = [...r.syndrome, r.output];
  let at = 0;
  const trace = tracePhaseCorrection(r.input ? [0, 0, 1, 0] : [1, 0, 0, 0], r.noise, () => values[at++] ? 1 - Number.EPSILON : 0);
  if (trace.output !== r.output || trace.syndrome.some((x, i) => x !== r.syndrome[i])) throw Error('保存の測定記録が不正です。');
  return trace;
}

/** Execute every bit's circuit. Only diagnostic records are sampled/bounded. */
export function correctText(text: string, random = bufferedRandom(), progress?: (completed: number) => void) {
  const start = performance.now(), bitCount = text.length * 16;
  const count = Math.min(bitCount, MAX_SAVE_RECORDS);
  const positions = Array.from({ length: count }, (_, i) => count === 1 ? 0 : Math.floor(i * (bitCount - 1) / (count - 1)));
  const records = new Uint8Array(count), units = new Uint16Array(text.length);
  const state = new Float64Array(64);
  const syndromeCounts: [number, number, number, number] = [0, 0, 0, 0];
  const noiseCounts: [number, number, number, number] = [0, 0, 0, 0];
  let index = 0, recordIndex = 0, correctedCount = 0;
  for (let unit = 0; unit < text.length; unit++) {
    const code = text.charCodeAt(unit);
    for (let shift = 15; shift >= 0; shift--) {
      const input = (code >>> shift & 1) as Bit;
      const noise = (Math.floor(sample(random) * 4) - 1) as PhaseNoise;
      state.fill(0); state[input * 2] = 1;
      const measured = evolve(state, noise, random);
      const s0 = measured & 1, s1 = measured >>> 1 & 1, output = measured >>> 2;
      units[unit] |= output << shift;
      noiseCounts[noise + 1]++; syndromeCounts[s0 * 2 + s1]++;
      if (s0 || s1) correctedCount++;
      if (positions[recordIndex] === index) records[recordIndex++] = input | (noise + 1) << 1 | s0 << 3 | s1 << 4 | output << 5;
      index++;
    }
    if (index % 4096 === 0) progress?.(index);
  }
  const chunks: string[] = [];
  for (let at = 0; at < units.length; at += 4096) chunks.push(String.fromCharCode(...units.subarray(at, at + 4096)));
  const output = chunks.join('');
  if (output !== text) throw Error('復元した文字列が一致しません。');
  return { output, result: { bitCount, records, positions, syndromeCounts, noiseCounts, correctedCount, elapsed: performance.now() - start } satisfies CorrectionSummary };
}
