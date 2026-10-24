import { applyGate, type Gate, type StateVector } from './simulator';

export type Bit = 0 | 1;
export interface TeleportedQubit { state: StateVector; m0: Bit; m1: Bit }
export interface TextTransfer {
  output: string;
  /** Per bit: input at bit 0, m0 at bit 1, m1 at bit 2, receiver output at bit 3. */
  records: Uint8Array;
  /** Counts of Alice's (m0,m1) = 00, 01, 10, 11. */
  counts: number[];
  bitCount: number;
  elapsed: number;
}
export type TransferSummary = Omit<TextTransfer, 'output'> & { matches: boolean };
export type TransferMessage = { type: 'progress'; completed: number } | { type: 'done'; result: TransferSummary } | { type: 'error' };

function gate(kind: Gate['kind'], target: number, controls: number[] = []): Gate {
  return { kind, target, controls, stage: 'prepare', iteration: 0 };
}

const bellH = gate('H', 1), bellCX = gate('MCX', 2, [1]);
const aliceCX = gate('MCX', 1, [0]), aliceH = gate('H', 0);
const bobX = gate('X', 2), bobZ = gate('Z', 2);

/** Measure only one qubit. Preserve all unmeasured amplitudes and their phases. */
export function measureQubit(input: StateVector, target: number, random: () => number): { value: Bit; state: StateVector } {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('乱数は0以上1未満です。');
  const mask = 1 << target;
  let p0 = 0, p1 = 0;
  for (let i = 0; i < input.length / 2; i++) {
    const p = input[2 * i] ** 2 + input[2 * i + 1] ** 2;
    if (i & mask) p1 += p; else p0 += p;
  }
  if (!Number.isFinite(p0 + p1) || p0 + p1 <= 0) throw new Error('状態のノルムが不正です。');
  const value: Bit = sample < p0 / (p0 + p1) ? 0 : 1;
  const scale = 1 / Math.sqrt(value ? p1 : p0);
  const state = new Float64Array(input.length);
  for (let i = 0; i < input.length / 2; i++) {
    if (Number(Boolean(i & mask)) !== value) continue;
    state[2 * i] = input[2 * i] * scale;
    state[2 * i + 1] = input[2 * i + 1] * scale;
  }
  return { value, state };
}

/** Three-qubit teleportation, including actual partial measurements and feed-forward. */
export function teleportQubit(psi: readonly [number, number, number, number], random: () => number): TeleportedQubit {
  const norm = psi.reduce((sum, a) => sum + a * a, 0);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-10) throw new Error('入力状態を規格化してください。');
  let state: StateVector = new Float64Array(16);
  // q0 = input; q1 = Alice's half of the Bell pair; q2 = Bob's half.
  state.set(psi);
  for (const operation of [bellH, bellCX, aliceCX, aliceH]) state = applyGate(state, operation);
  const first = measureQubit(state, 0, random);
  const second = measureQubit(first.state, 1, random);
  state = second.state;
  if (second.value) state = applyGate(state, bobX);
  if (first.value) state = applyGate(state, bobZ);
  return { state, m0: first.value, m1: second.value };
}

/** Buffer cryptographic samples to avoid a system call for every measurement. */
export function bufferedRandom(): () => number {
  const values = new Uint32Array(4096);
  let position = values.length;
  return () => {
    if (position === values.length) { crypto.getRandomValues(values); position = 0; }
    return values[position++] / 2 ** 32;
  };
}

/** UTF-16 preserves the exact selected JS string, including unpaired surrogates. */
export function teleportText(text: string, random = bufferedRandom(), onProgress?: (completed: number) => void): TextTransfer {
  const start = performance.now();
  const records = new Uint8Array(text.length * 16);
  const units = new Uint16Array(text.length);
  const counts = [0, 0, 0, 0];
  let index = 0;
  for (let unit = 0; unit < text.length; unit++) {
    const code = text.charCodeAt(unit);
    for (let shift = 15; shift >= 0; shift--) {
      const input = ((code >>> shift) & 1) as Bit;
      const transfer = teleportQubit(input ? [0, 0, 1, 0] : [1, 0, 0, 0], random);
      const received = measureQubit(transfer.state, 2, random).value;
      units[unit] |= received << shift;
      counts[2 * transfer.m0 + transfer.m1]++;
      records[index++] = input | transfer.m0 << 1 | transfer.m1 << 2 | received << 3;
    }
    if (index % 4096 === 0) onProgress?.(index);
  }
  const chunks: string[] = [];
  for (let offset = 0; offset < units.length; offset += 4096) chunks.push(String.fromCharCode(...units.subarray(offset, offset + 4096)));
  return { output: chunks.join(''), records, counts, bitCount: records.length, elapsed: performance.now() - start };
}

export function decodeRecord(record: number) {
  return { input: (record & 1) as Bit, m0: ((record >>> 1) & 1) as Bit, m1: ((record >>> 2) & 1) as Bit, output: ((record >>> 3) & 1) as Bit };
}
