import { describe, expect, it } from 'vitest';
import { applyGate, createCircuit, measure, measureSearchAt, optimalIterations, prepareSearch, probabilities, runSearch, zeroState, MAX_NOTES, type Gate } from './simulator';

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
  it('does not draw an outcome until measurement and supports early stopping', () => {
    const prepared = prepareSearch(16, 4);
    expect(prepared.measured).toBeNull();
    expect(prepared.snapshots.at(-1)!.gate!.kind).not.toBe('M');
    const early = measureSearchAt(prepared, prepared.qubits, () => 0.01);
    expect(early.probabilities[4]).toBeCloseTo(1 / 16);
    expect(early.measured).toBe(0);
    expect(early.iterations).toBe(0);
    expect(early.gates.at(-1)!.kind).toBe('M');
    expect(early.gates).toHaveLength(prepared.qubits + 1);
    expect(early.snapshots).toHaveLength(early.gates.length + 1);
    const full = measureSearchAt(prepared, prepared.snapshots.length - 1, () => 0.5);
    expect(full.probabilities[4]).toBeCloseTo(0.9613189697265625);
    expect(full.iterations).toBe(3);
    expect(prepared.measured).toBeNull();
    expect(() => measureSearchAt(prepared, prepared.snapshots.length)).toThrow();
  });
  it('matches the independent analytical success probability for every count and target up to 16', () => {
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
  it('searches every larger notebook size up to 128 with the correct analytical probability and normalized trace', () => {
    for (let count = 17; count <= MAX_NOTES; count++) for (const target of [0, Math.floor(count / 2), count - 1]) {
      const run = prepareSearch(count, target);
      expect(run.qubits).toBe(Math.ceil(Math.log2(count)));
      const expected = Math.sin((2 * run.iterations + 1) * Math.asin(1 / Math.sqrt(run.dimension))) ** 2;
      expect(run.probabilities[target]).toBeCloseTo(expected, 11);
      for (const snapshot of run.snapshots) expect(snapshot.state.reduce((sum, v) => sum + v * v, 0)).toBeCloseTo(1, 10);
      const measured = measureSearchAt(run, run.snapshots.length - 1, () => 0.5);
      expect(probabilities(measured.snapshots.at(-1)!.state).filter(p => p > 1e-10)).toHaveLength(1);
    }
    expect(zeroState(7)).toHaveLength(256);
    expect(() => zeroState(8)).toThrow();
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
    expect(() => createCircuit(MAX_NOTES + 1, 0)).toThrow();
    expect(() => createCircuit(4, 4)).toThrow();
  });
});
