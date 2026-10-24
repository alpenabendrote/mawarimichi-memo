import { describe, expect, it } from 'vitest';
import { applyGate, createCircuit, measure, optimalIterations, probabilities, runSearch, zeroState, type Gate } from './simulator';

const gate = (kind: Gate['kind'], target: number, controls: number[] = []): Gate => ({ kind, target, controls, stage: 'prepare', iteration: 0 });

describe('unitary state-vector engine', () => {
  it('creates superposition, preserves complex phase, and inverts H', () => {
    const plus = applyGate(zeroState(1), gate('H', 0));
    expect(probabilities(plus)).toEqual([0.5000000000000001, 0.5000000000000001]);
    const phased = applyGate(plus, gate('S', 0));
    expect(phased[2]).toBeCloseTo(0);
    expect(phased[3]).toBeCloseTo(Math.SQRT1_2);
    const twice = applyGate(plus, gate('H', 0));
    expect(twice[0]).toBeCloseTo(1);
    expect(twice[2]).toBeCloseTo(0);
  });
  it('uses least-significant q0 and applies MCX only when controls are set', () => {
    const untriggered = applyGate(zeroState(3), gate('MCX', 2, [0, 1]));
    expect(untriggered[0]).toBe(1);
    let state = applyGate(zeroState(3), gate('X', 0));
    state = applyGate(state, gate('X', 1));
    state = applyGate(state, gate('MCX', 2, [0, 1]));
    expect(probabilities(state)[7]).toBe(1);
  });
  it('collapses a complex state and gives the same result if immediately measured again', () => {
    const input = applyGate(applyGate(zeroState(1), gate('H', 0)), gate('S', 0));
    const first = measure(input, () => 0.75);
    expect(first.index).toBe(1);
    expect(first.state[3]).toBeCloseTo(1);
    expect(measure(first.state, () => 0).index).toBe(1);
    expect(measure(first.state, () => 0.999999).index).toBe(1);
    expect(() => measure(input, () => 1)).toThrow();
  });
});

describe('Grover circuit', () => {
  it('matches the independent analytical success probability for every supported count and target', () => {
    for (let count = 1; count <= 16; count++) {
      for (let target = 0; target < count; target++) {
        const run = runSearch(count, target, () => 0.37);
        const theta = Math.asin(1 / Math.sqrt(run.dimension));
        const expected = Math.sin((2 * run.iterations + 1) * theta) ** 2;
        expect(run.probabilities[target]).toBeCloseTo(expected, 11);
        for (const snapshot of run.snapshots) {
          expect(probabilities(snapshot.state).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 11);
        }
      }
    }
  });
  it('finds each of four targets with certainty after one amplification', () => {
    for (let target = 0; target < 4; target++) {
      const run = runSearch(4, target, () => 0.62);
      expect(run.iterations).toBe(1);
      expect(run.measured).toBe(target);
      expect(run.probabilities[target]).toBeCloseTo(1);
    }
  });
  it('does not substitute the target when a measurement fails or hits padding', () => {
    // Three notes use four basis states. Two notes, meanwhile, have no useful amplification.
    const failed = runSearch(2, 0, () => 0.9);
    expect(failed.iterations).toBe(0);
    expect(failed.measured).toBe(1);
    const padded = runSearch(5, 0, () => 0.999999);
    expect(padded.dimension).toBe(8);
    expect(padded.measured).toBe(7);
    expect(padded.measured).toBeGreaterThanOrEqual(padded.count);
    expect(padded.probabilities[0]).toBeLessThan(1);
  });
  it('preserves snapshots and distinguishes pre-measurement probabilities from collapsed ones', () => {
    const run = runSearch(8, 3, () => 0.5);
    expect(run.snapshots).toHaveLength(run.gates.length + 1);
    expect(run.snapshots[0].state[0]).toBe(1);
    expect(run.probabilities[3]).toBeCloseTo(0.9453125);
    expect(probabilities(run.snapshots.at(-1)!.state).filter(p => p > 1e-10)).toHaveLength(1);
  });
  it('handles one note without pretending to need a qubit, and validates bounds', () => {
    const run = runSearch(1, 0, () => 0.99);
    expect(run.qubits).toBe(0);
    expect(run.measured).toBe(0);
    expect(run.probabilities).toEqual([1]);
    expect(optimalIterations(16)).toBe(3);
    expect(() => createCircuit(0, 0)).toThrow();
    expect(() => createCircuit(17, 0)).toThrow();
    expect(() => createCircuit(4, 4)).toThrow();
  });
});
