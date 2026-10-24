import { describe, expect, it, vi } from 'vitest';
import { isZenoMemory, measureZeno, newZenoMemory, prepareZeno, rotateZeno, ZENO_TRANSITION_MS as T } from './zeno';

describe('one-qubit quantum Zeno evolution', () => {
  it('applies a complex unitary Rx, preserves norm and inverts its phase', () => {
    const initial = new Float64Array([0.5, 0.5, 0.5, -0.5]);
    for (const angle of [0, 0.3, Math.PI / 2, Math.PI, -0.7]) {
      const rotated = rotateZeno(initial, angle);
      expect(rotated.reduce((sum, v) => sum + v * v, 0)).toBeCloseTo(1, 12);
      rotateZeno(rotated, -angle).forEach((v, i) => expect(v).toBeCloseTo(initial[i], 12));
    }
    const half = rotateZeno(new Float64Array([1, 0, 0, 0]), Math.PI / 2);
    expect(half[0]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(half[3]).toBeCloseTo(-Math.SQRT1_2, 12);
  });
  it('uses coherent elapsed-time evolution and a 48-hour probability period without measuring previews', () => {
    const memory = newZenoMemory(100);
    expect(prepareZeno(memory, 100 + T / 2).distribution[0]).toBeCloseTo(0.5, 12);
    expect(prepareZeno(memory, 100 + T).distribution[1]).toBeCloseTo(1, 12);
    expect(prepareZeno(memory, 100 + 2 * T).distribution[0]).toBeCloseTo(1, 12);
    expect(prepareZeno(memory, 100 + 2000 * T + T / 2).distribution[0]).toBeCloseTo(0.5, 12);
    expect(memory).toEqual({ basis: 0, at: 100 });
    const split = rotateZeno(rotateZeno(new Float64Array([1, 0, 0, 0]), 0.4), 0.7);
    rotateZeno(new Float64Array([1, 0, 0, 0]), 1.1).forEach((v, i) => expect(split[i]).toBeCloseTo(v, 12));
  });
  it('draws exactly once, collapses the state and preserves the measured phase in the record', () => {
    const draw = vi.fn(() => 0.9);
    const run = measureZeno(newZenoMemory(0), T / 2, draw);
    expect(draw).toHaveBeenCalledOnce();
    expect(run.measured).toBe(1);
    expect(run.after[3]).toBeCloseTo(-1, 12);
    expect(run.next).toEqual({ basis: 1, at: T / 2 });
    for (const sample of [0, 0.5, 1 - Number.EPSILON]) expect(measureZeno(run.next, T / 2, () => sample).measured).toBe(1);
    expect(measureZeno(newZenoMemory(0), T, () => 0.5).measured).toBe(1);
  });
  it('suppresses transitions by repeated actual measurements instead of replacing evolution with a read count', () => {
    const free = prepareZeno(newZenoMemory(0), T).distribution[0];
    expect(free).toBeCloseTo(0, 12);
    const survival: number[] = [];
    for (const count of [4, 24, 240]) {
      let memory = newZenoMemory(0), probability = 1;
      for (let n = 1; n <= count; n++) {
        const run = measureZeno(memory, n * T / count, () => 0);
        probability *= run.distribution[0];
        expect(run.measured).toBe(0);
        memory = run.next;
      }
      expect(probability).toBeCloseTo(Math.cos(Math.PI / (2 * count)) ** (2 * count), 11);
      survival.push(probability);
    }
    expect(survival[1]).toBeGreaterThan(0.9);
    expect(survival[2]).toBeGreaterThan(survival[1]);
    // Frequent measurement also stabilizes the dormant eigenstate.
    expect(measureZeno({ basis: 1, at: 0 }, T / 24, () => 0.5).measured).toBe(1);
  });
  it('handles a clock rollback without reversing evolution and validates persisted data and random draws', () => {
    expect(prepareZeno({ basis: 1, at: 100 }, 50)).toMatchObject({ elapsed: 0, at: 100, distribution: [0, 1] });
    expect(measureZeno({ basis: 1, at: 100 }, 50, () => 0.5).next).toEqual({ basis: 1, at: 100 });
    for (const value of [null, {}, { basis: 2, at: 0 }, { basis: 0, at: -1 }, { basis: 0, at: NaN }]) expect(isZenoMemory(value)).toBe(false);
    for (const at of [-1, NaN, Infinity, 1.5]) expect(() => newZenoMemory(at)).toThrow();
    for (const draw of [-0.1, 1, NaN]) expect(() => measureZeno(newZenoMemory(0), 100, () => draw)).toThrow();
  });
});
