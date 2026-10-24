/** Interleaved complex amplitudes: [Re(a0), Im(a0), Re(a1), Im(a1), ...]. */
export type StateVector = Float64Array;
export type Stage = 'prepare' | 'oracle' | 'diffusion' | 'measure';
export type GateKind = 'H' | 'X' | 'Z' | 'S' | 'MCX' | 'M';
export interface Gate {
  kind: GateKind;
  target: number | null;
  controls: number[];
  stage: Stage;
  iteration: number;
}
export interface Snapshot {
  gate: Gate | null;
  state: StateVector;
}
export interface SearchRun {
  count: number;
  qubits: number;
  dimension: number;
  target: number;
  iterations: number;
  gates: Gate[];
  snapshots: Snapshot[];
  /** The distribution BEFORE measurement; never replaced by the collapsed state. */
  probabilities: number[];
  measured: number;
}
export type PreparedSearch = Omit<SearchRun, 'measured'> & { measured: null };
export const MAX_NOTES = 16;

export function zeroState(qubits: number): StateVector {
  if (!Number.isInteger(qubits) || qubits < 0 || qubits > 4) {
    throw new Error('量子ビット数は0〜4です。');
  }
  const state = new Float64Array(2 * 2 ** qubits);
  state[0] = 1;
  return state;
}

export function probabilities(state: StateVector): number[] {
  return Array.from({ length: state.length / 2 }, (_, i) => state[2 * i] ** 2 + state[2 * i + 1] ** 2);
}

/** Apply the actual unitary, including phases, rather than a probability formula. */
export function applyGate(input: StateVector, gate: Gate): StateVector {
  const dimension = input.length / 2;
  if (!Number.isInteger(Math.log2(dimension))) throw new Error('状態ベクトルの大きさが不正です。');
  if (gate.kind === 'M') throw new Error('測定には measure を使います。');
  const target = gate.target;
  const qubits = Math.log2(dimension);
  if (target === null || !Number.isInteger(target) || target < 0 || target >= qubits) {
    throw new Error('対象量子ビットが不正です。');
  }
  if (new Set(gate.controls).size !== gate.controls.length || gate.controls.some(q => !Number.isInteger(q) || q < 0 || q >= qubits || q === target)) {
    throw new Error('制御量子ビットが不正です。');
  }
  const state = input.slice();
  const mask = 1 << target;
  for (let i = 0; i < dimension; i++) {
    if (i & mask) continue;
    if (gate.kind === 'MCX' && !gate.controls.every(q => (i & (1 << q)) !== 0)) continue;
    const j = i | mask;
    const ar = input[2 * i], ai = input[2 * i + 1];
    const br = input[2 * j], bi = input[2 * j + 1];
    switch (gate.kind) {
      case 'H':
        state[2 * i] = (ar + br) * Math.SQRT1_2;
        state[2 * i + 1] = (ai + bi) * Math.SQRT1_2;
        state[2 * j] = (ar - br) * Math.SQRT1_2;
        state[2 * j + 1] = (ai - bi) * Math.SQRT1_2;
        break;
      case 'X':
      case 'MCX':
        state[2 * i] = br; state[2 * i + 1] = bi;
        state[2 * j] = ar; state[2 * j + 1] = ai;
        break;
      case 'Z':
        state[2 * j] = -br; state[2 * j + 1] = -bi;
        break;
      case 'S':
        state[2 * j] = -bi; state[2 * j + 1] = br;
        break;
    }
  }
  return state;
}

export function measure(state: StateVector, random: () => number): { index: number; state: StateVector } {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('乱数は0以上1未満です。');
  const distribution = probabilities(state);
  const total = distribution.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('状態のノルムが不正です。');
  let cumulative = 0;
  let index = distribution.findLastIndex(p => p > 0);
  for (let i = 0; i < distribution.length; i++) {
    cumulative += distribution[i] / total;
    if (sample < cumulative) { index = i; break; }
  }
  const collapsed = new Float64Array(state.length);
  // Preserve the measured amplitude's phase, including complex states.
  const magnitude = Math.sqrt(distribution[index]);
  collapsed[2 * index] = state[2 * index] / magnitude;
  collapsed[2 * index + 1] = state[2 * index + 1] / magnitude;
  return { index, state: collapsed };
}

/** Pick the first success-probability maximum. Fewer iterations win ties. */
export function optimalIterations(dimension: number): number {
  if (dimension === 1) return 0;
  const theta = Math.asin(1 / Math.sqrt(dimension));
  const upper = Math.ceil(Math.PI / (4 * theta) - 0.5);
  let best = 0, bestProbability = Math.sin(theta) ** 2;
  for (let r = 1; r <= upper; r++) {
    const p = Math.sin((2 * r + 1) * theta) ** 2;
    if (p > bestProbability + 1e-12) { best = r; bestProbability = p; }
  }
  return best;
}

/** An oracle marks a known ID. No classical search result is substituted. */
export function createCircuit(count: number, target: number): { qubits: number; iterations: number; gates: Gate[] } {
  if (!Number.isInteger(count) || count < 1 || count > MAX_NOTES) throw new Error('メモは1〜16件です。');
  if (!Number.isInteger(target) || target < 0 || target >= count) throw new Error('検索対象が不正です。');
  const qubits = Math.ceil(Math.log2(count));
  const iterations = optimalIterations(2 ** qubits);
  const gates: Gate[] = [];
  const all = Array.from({ length: qubits }, (_, i) => i);
  const add = (kind: GateKind, q: number | null, stage: Stage, iteration = 0, controls: number[] = []) => {
    gates.push({ kind, target: q, controls, stage, iteration });
  };
  all.forEach(q => add('H', q, 'prepare'));
  for (let r = 1; r <= iterations; r++) {
    const zeros = all.filter(q => !(target & (1 << q)));
    zeros.forEach(q => add('X', q, 'oracle', r));
    // H MCX H is the multi-controlled Z, including the one-qubit case.
    const last = qubits - 1;
    add('H', last, 'oracle', r);
    add('MCX', last, 'oracle', r, all.slice(0, -1));
    add('H', last, 'oracle', r);
    zeros.forEach(q => add('X', q, 'oracle', r));
    all.forEach(q => add('H', q, 'diffusion', r));
    all.forEach(q => add('X', q, 'diffusion', r));
    add('H', last, 'diffusion', r);
    add('MCX', last, 'diffusion', r, all.slice(0, -1));
    add('H', last, 'diffusion', r);
    all.forEach(q => add('X', q, 'diffusion', r));
    all.forEach(q => add('H', q, 'diffusion', r));
    // This gate decomposition implements -D. Its global phase is retained.
  }
  add('M', null, 'measure');
  return { qubits, iterations, gates };
}

export function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

/** Calculate gate snapshots without drawing a measurement outcome. */
export function prepareSearch(count: number, target: number): PreparedSearch {
  const { qubits, iterations, gates } = createCircuit(count, target);
  let state = zeroState(qubits);
  const snapshots: Snapshot[] = [{ gate: null, state: state.slice() }];
  for (const gate of gates) {
    if (gate.kind === 'M') break;
    state = applyGate(state, gate);
    snapshots.push({ gate, state: state.slice() });
  }
  return { count, target, qubits, dimension: 2 ** qubits, iterations, gates, snapshots, probabilities: probabilities(state), measured: null };
}

/** Measure the chosen snapshot and stop there; discard all future unitary gates. */
export function measureSearchAt(prepared: PreparedSearch, step: number, random = secureRandom): SearchRun {
  if (!Number.isInteger(step) || step < 0 || step >= prepared.snapshots.length) throw new Error('測定位置が不正です。');
  const state = prepared.snapshots[step].state;
  const result = measure(state, random);
  const measurement: Gate = { kind: 'M', target: null, controls: [], stage: 'measure', iteration: 0 };
  const executed = prepared.gates.slice(0, step);
  const completed = executed.filter((gate, index) => gate.stage === 'diffusion' && prepared.gates[index + 1]?.stage !== 'diffusion').length;
  return { ...prepared, iterations: completed, gates: [...executed, measurement], snapshots: [...prepared.snapshots.slice(0, step + 1), { gate: measurement, state: result.state }], probabilities: probabilities(state), measured: result.index };
}

export function runSearch(count: number, target: number, random = secureRandom): SearchRun {
  const prepared = prepareSearch(count, target);
  return measureSearchAt(prepared, prepared.snapshots.length - 1, random);
}

export function basisLabel(index: number, qubits: number): string {
  return qubits === 0 ? '∅' : index.toString(2).padStart(qubits, '0');
}

export const stageNames: Record<Stage, string> = {
  prepare: '重ね合わせ', oracle: 'オラクル', diffusion: '振幅増幅', measure: '測定',
};

export function describeGate(gate: Gate | null): string {
  if (!gate) return '初期状態 |0…0⟩';
  if (gate.kind === 'M') return '全量子ビットを測定';
  const prefix = gate.iteration ? `${gate.iteration}回目 · ` : '';
  const target = `q${gate.target}`;
  if (gate.kind === 'MCX') return `${prefix}${gate.controls.length ? gate.controls.map(q => `q${q}`).join(', ') + ' を制御に ' : ''}${target} に X`;
  return `${prefix}${target} に ${gate.kind} ゲート`;
}
