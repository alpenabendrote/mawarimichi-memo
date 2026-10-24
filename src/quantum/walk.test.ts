import { describe, expect, it, vi } from 'vitest';
import { measureWalk, prepareWalk, runWalk, shiftWalk, walkPositionProbabilities } from './walk';
import type { StateVector } from './simulator';

describe('coherent two-part quantum walk', () => {
  it('implements both conditional shifts as invertible complex permutations, including unused positions', () => {
    for (let count = 2; count <= 16; count++) {
      const dimension = 2 ** Math.ceil(Math.log2(count));
      const original = Float64Array.from({ length: 4 * dimension }, (_, i) => Math.sin(i + 0.1));
      for (const direction of [1, -1] as const) {
        let state: StateVector = original;
        for (let i = 0; i < count; i++) state = shiftWalk(state, count, direction);
        expect(state).toEqual(original);
        const moved = shiftWalk(original, count, direction);
        expect(moved.slice(4 * count)).toEqual(original.slice(4 * count));
        // Coin zero stays during the right shift; coin one stays during the left shift.
        for (let x = 0; x < count; x++) {
          const stationaryCoin = direction === 1 ? 0 : 1;
          expect(moved.slice(4 * x + 2 * stationaryCoin, 4 * x + 2 * stationaryCoin + 2)).toEqual(original.slice(4 * x + 2 * stationaryCoin, 4 * x + 2 * stationaryCoin + 2));
        }
      }
    }
  });
  it('matches known one-step and four-step distributions on a four-note ring', () => {
    const run = prepareWalk(4, 0);
    const afterOne = run.snapshots.find(s => s.step === 1 && s.operation === 'S−')!;
    walkPositionProbabilities(afterOne.state, 4).forEach((p, i) => expect(p).toBeCloseTo([0.5, 0.25, 0, 0.25][i], 12));
    run.walkProbabilities.forEach((p, i) => expect(p).toBeCloseTo([1 / 8, 1 / 8, 5 / 8, 1 / 8][i], 12));
    run.selectionProbabilities.forEach((p, i) => expect(p).toBeCloseTo([0, 1 / 7, 5 / 7, 1 / 7][i], 12));
    expect(run.snapshots[0].state[0]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(run.snapshots[0].state[3]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(run.eligibleProbability).toBeCloseTo(7 / 8, 12);
  });
  it('retains interference, differing from a walk that dephases the coin after every H', () => {
    let classical = [0.5, 0.5, 0, 0, 0, 0, 0, 0];
    for (let step = 0; step < 4; step++) for (const direction of [1, -1]) {
      const mixed = Array.from({ length: 8 }, (_, i) => (classical[i & ~1] + classical[i | 1]) / 2);
      const moved = Array<number>(8).fill(0);
      for (let x = 0; x < 4; x++) for (let c = 0; c < 2; c++) {
        const destination = direction === 1 && c === 1 || direction === -1 && c === 0 ? (x + direction + 4) % 4 : x;
        moved[2 * destination + c] += mixed[2 * x + c];
      }
      classical = moved;
    }
    const classicalPositionTwo = classical[4] + classical[5];
    expect(classicalPositionTwo).toBeCloseTo(7 / 32, 12);
    expect(prepareWalk(4, 0).walkProbabilities[2] - classicalPositionTwo).toBeGreaterThan(0.4);
  });
  it('preserves norm and complex amplitudes for every notebook size and source without populating padding', () => {
    for (let count = 2; count <= 16; count++) for (let source = 0; source < count; source++) {
      const prepared = prepareWalk(count, source);
      expect(prepared.positionQubits + 1).toBe(Math.ceil(Math.log2(count)) + 1);
      expect(prepared.steps).toBe(Math.max(3, count));
      expect(prepared.snapshots).toHaveLength(prepared.steps * 4 + 2);
      for (const snapshot of prepared.snapshots) {
        expect(snapshot.state.reduce((norm, value) => norm + value * value, 0)).toBeCloseTo(1, 10);
        expect(snapshot.state.slice(4 * count).every(v => v === 0)).toBe(true);
      }
      expect(prepared.selectionProbabilities[source]).toBe(0);
      expect(prepared.selectionProbabilities.reduce((sum, p) => sum + p, 0)).toBeCloseTo(1, 12);
      expect(prepared.eligibleProbability).toBeGreaterThan(0);
    }
  });
  it('measures exactly once from the displayed conditional distribution and does not mutate the trace', () => {
    const prepared = prepareWalk(4, 0);
    const before = prepared.snapshots[prepared.measurementStep].state.slice();
    for (const [draw, expected] of [[0, 1], [0.1, 1], [0.2, 2], [0.8, 2], [0.99999, 3]]) {
      const random = vi.fn(() => draw);
      const result = measureWalk(prepared, random);
      expect(random).toHaveBeenCalledOnce();
      expect(result.measured).toBe(expected);
      expect(result.snapshots.at(-1)!.operation).toBe('M');
      const collapsed = result.snapshots.at(-1)!.state;
      const probabilities = walkPositionProbabilities(collapsed, 4);
      probabilities.forEach((p, i) => expect(p).toBeCloseTo(i === expected ? 1 : 0, 12));
      for (let part = 0; part < 4; part++) expect(collapsed[4 * expected + part]).toBeCloseTo(before[4 * expected + part] / Math.sqrt(prepared.selectionProbabilities[expected]), 12);
      expect(result.selectionProbabilities).toEqual(prepared.selectionProbabilities);
      expect(prepared.snapshots[prepared.measurementStep].state).toEqual(before);
    }
  });
  it('always opens another note, even with two notes and at the random interval boundaries', () => {
    for (let count = 2; count <= 16; count++) for (let source = 0; source < count; source++) {
      const prepared = prepareWalk(count, source);
      for (const sample of [0, 0.5, 1 - Number.EPSILON]) {
        const run = measureWalk(prepared, () => sample);
        expect(run.measured).not.toBe(source);
        expect(run.measured).toBeGreaterThanOrEqual(0);
        expect(run.measured).toBeLessThan(count);
      }
    }
    expect(runWalk(2, 0, () => 0.999).measured).toBe(1);
    expect(runWalk(2, 1, () => 0).measured).toBe(0);
  });
  it('rejects invalid inputs without pretending that a walk or measurement succeeded', () => {
    for (const [count, source] of [[0, 0], [1, 0], [17, 0], [4, -1], [4, 4], [3.5, 0]]) expect(() => prepareWalk(count, source)).toThrow();
    for (const draw of [-1, 1, Number.NaN]) expect(() => measureWalk(prepareWalk(4, 0), () => draw)).toThrow();
  });
});
