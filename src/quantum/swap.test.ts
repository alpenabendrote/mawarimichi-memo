import { describe, expect, it } from 'vitest';
import { controlledSwap, prepareAmplitudes, prepareSwapTest, sampleSwapTest } from './swap';
import type { StateVector } from './simulator';

function complex(values: number[][]): StateVector { return new Float64Array(values.flat()); }
function innerProductSquared(a: StateVector, b: StateVector) {
  let re = 0, im = 0;
  for (let i = 0; i < a.length; i += 2) { re += a[i] * b[i] + a[i + 1] * b[i + 1]; im += a[i] * b[i + 1] - a[i + 1] * b[i]; }
  return re * re + im * im;
}

describe('actual SWAP circuit', () => {
  it('prepares sparse and dense vectors using controlled Ry, including zero branches', () => {
    for (const weights of [[0, 1], [0, 0, 1, 0], [1, 2, 3, 4], Array.from({ length: 64 }, (_, i) => i % 7 ? i : 0), Array.from({ length: 128 }, (_, i) => i % 11 ? i : 0)]) {
      const vector = weights.map(value => value / Math.hypot(...weights));
      const prepared = prepareAmplitudes(vector);
      vector.forEach((value, i) => { expect(prepared.state[2 * i]).toBeCloseTo(value, 12); expect(prepared.state[2 * i + 1]).toBe(0); });
      expect(prepared.rotations.length).toBeGreaterThan(0);
      expect(prepared.rotations.length).toBeLessThan(weights.length);
    }
    expect(() => prepareAmplitudes([0, 0])).toThrow();
    expect(() => prepareAmplitudes([1, 1])).toThrow();
    expect(() => prepareAmplitudes([-1, 0])).toThrow();
  });
  it('swaps amplitudes only in the control-1 subspace and is its own inverse', () => {
    const state = new Float64Array(16);
    state[4] = 0.5; state[10] = Math.SQRT1_2; state[11] = 0.5;
    const swapped = controlledSwap(state, 1, 2);
    expect(swapped[4]).toBe(0.5); // control zero, unchanged
    expect(swapped[6]).toBe(Math.SQRT1_2); expect(swapped[7]).toBe(0.5);
    expect(swapped[10]).toBe(0); expect(swapped[11]).toBe(0);
    expect(controlledSwap(swapped, 1, 2)).toEqual(state);
    expect(state[10]).toBe(Math.SQRT1_2);
  });
  it('matches an independently calculated overlap for complex states and all supported register sizes', () => {
    const s = Math.SQRT1_2;
    const pairs = [
      [complex([[1, 0], [0, 0]]), complex([[1, 0], [0, 0]])],
      [complex([[1, 0], [0, 0]]), complex([[0, 0], [1, 0]])],
      [complex([[s, 0], [0, s]]), complex([[s, 0], [0, -s]])],
      [complex([[s, 0], [0, s]]), complex([[0, s], [-s, 0]])], // global phase, same state
    ];
    for (const dimension of [2, 4, 8, 16, 32, 64, 128]) {
      const a = new Float64Array(2 * dimension), b = new Float64Array(2 * dimension);
      for (let i = 0; i < a.length; i++) { a[i] = Math.sin(i + 0.3); b[i] = Math.cos(2 * i + 0.7); }
      const an = Math.hypot(...a), bn = Math.hypot(...b);
      pairs.push([a.map(v => v / an), b.map(v => v / bn)]);
    }
    for (const [a, b] of pairs) {
      const circuit = prepareSwapTest(a, b);
      expect(circuit.probabilities[0]).toBeCloseTo((1 + innerProductSquared(a, b)) / 2, 12);
      expect(circuit.probabilities[1]).toBeCloseTo((1 - innerProductSquared(a, b)) / 2, 12);
      expect(circuit.state.reduce((norm, v) => norm + v * v, 0)).toBeCloseTo(1, 12);
    }
  });
  it('derives its estimate from independent measured counts, including statistical error', () => {
    const circuit = prepareSwapTest(complex([[1, 0], [0, 0]]), complex([[0, 0], [1, 0]]));
    let draw = 0;
    const measured = sampleSwapTest(circuit.probabilities, 100, () => (draw++ + 0.5) / 100);
    expect(measured).toEqual({ shots: 100, counts: [50, 50], overlap: 0 });
    const sampled = sampleSwapTest(circuit.probabilities, 10, () => 0.1);
    expect(sampled.overlap).toBe(1); // Never substitute the known analytical overlap (zero).
    expect(() => sampleSwapTest(circuit.probabilities, 0, () => 0)).toThrow();
    expect(() => sampleSwapTest(circuit.probabilities, 1, () => 1)).toThrow();
  });
});
