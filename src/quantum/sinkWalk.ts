import { applyGate, secureRandom, type StateVector } from './simulator';
import { shiftWalk, walkPositionProbabilities } from './walk';

export interface SinkSnapshot { label: string; state: StateVector }
export interface SinkStep {
  probability: number; absorbed: boolean; sample: number;
  snapshots: SinkSnapshot[]; probabilities: number[];
}
export function initialSinkState(count: number, source: number): StateVector {
  if (!Number.isInteger(count) || count < 2 || count > 17 || !Number.isInteger(source) || source < 0 || source >= count - 1) throw new Error('吸収ウォークの出発点が不正です。');
  const state = new Float64Array(4 * 2 ** Math.ceil(Math.log2(count)));
  state[4 * source] = Math.SQRT1_2;
  state[4 * source + 3] = Math.SQRT1_2; // coin |+i>
  return state;
}
/** The only measurement is {sink, elsewhere}; no individual surviving position is measured. */
export function sinkWalkStep(input: StateVector, count: number, random = secureRandom): SinkStep {
  if (!Number.isInteger(count) || count < 2 || count > 17 || input.length !== 4 * 2 ** Math.ceil(Math.log2(count)) || input.some(a => !Number.isFinite(a)) || Math.abs(input.reduce((s, a) => s + a * a, 0) - 1) > 1e-8) throw new Error('吸収ウォークの状態が不正です。');
  const snapshots: SinkSnapshot[] = [{ label: '結合回の開始（前回の条件付き状態）', state: input.slice() }];
  const h = { kind: 'H' as const, target: 0, controls: [], stage: 'prepare' as const, iteration: 0 };
  let state = applyGate(input, h); snapshots.push({ label: 'コインにH（前半）', state });
  state = shiftWalk(state, count, 1); snapshots.push({ label: 'コイン1を右へ S+', state });
  state = applyGate(state, h); snapshots.push({ label: 'コインにH（後半）', state });
  state = shiftWalk(state, count, -1); snapshots.push({ label: 'コイン0を左へ S−', state });
  const probabilities = walkPositionProbabilities(state, count);
  const total = probabilities.reduce((s, p) => s + p, 0);
  const probability = Math.max(0, Math.min(1, probabilities[count - 1] / total));
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) throw new Error('乱数が不正です。');
  const absorbed = sample < probability;
  const selected = absorbed ? probability : 1 - probability;
  if (selected <= 0) throw new Error('確率0の分岐です。');
  const after = new Float64Array(state.length), scale = 1 / Math.sqrt(total * selected);
  for (let x = 0; x < count; x++) if ((x === count - 1) === absorbed) {
    for (let part = 0; part < 4; part++) after[4 * x + part] = state[4 * x + part] * scale;
  }
  snapshots.push({ label: absorbed ? '吸収を測定：堆積へ移す' : '非吸収を測定：他の位置の重ね合わせを保持', state: after });
  return { probability, absorbed, sample, snapshots, probabilities };
}

