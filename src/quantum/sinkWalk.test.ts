import { describe, expect, it } from 'vitest';
import { initialSinkState, sinkWalkStep } from './sinkWalk';
describe('walk with a projective absorbing sink', () => {
  it('matches the analytic first-step probabilities and preserves a coherent surviving branch', () => {
    const initial = initialSinkState(3, 0), before = [...initial];
    const step = sinkWalkStep(initial, 3, () => 0.9);
    expect(step.probabilities[0]).toBeCloseTo(0.5, 12);
    expect(step.probabilities[1]).toBeCloseTo(0.25, 12);
    expect(step.probability).toBeCloseTo(0.25, 12);
    expect(step.absorbed).toBe(false);
    const after = step.snapshots.at(-1)!.state;
    expect(after.slice(8).every(a => a === 0)).toBe(true);
    expect(after.reduce((s,a) => s+a*a,0)).toBeCloseTo(1, 12);
    expect(after[0]).not.toBe(0); expect(after[1]).not.toBe(0); expect(after[6]).not.toBe(0);
    expect([...initial]).toEqual(before);
    const absorbed = sinkWalkStep(initial, 3, () => 0.1).snapshots.at(-1)!.state;
    expect(absorbed.slice(0,8).every(a => a === 0)).toBe(true);
    expect(absorbed.reduce((s,a) => s+a*a,0)).toBeCloseTo(1, 12);
  });
  it('includes interference rather than replacing the walk by classical position probabilities', () => {
    const coherent = new Float64Array(16); coherent[0] = Math.SQRT1_2; coherent[2] = Math.SQRT1_2;
    const a = new Float64Array(16); a[0] = 1;
    const b = new Float64Array(16); b[2] = 1;
    const p = sinkWalkStep(coherent,3,()=>0.99).probability;
    const mixed = (sinkWalkStep(a,3,()=>0.99).probability + sinkWalkStep(b,3,()=>0.99).probability)/2;
    expect(p).toBeCloseTo(0.5,12); expect(mixed).toBeCloseTo(0.25,12);
  });
  it('keeps unused padded positions empty for all 17 physical sites and rejects invalid samples', () => {
    let state = initialSinkState(17, 7);
    for(let i=0;i<25;i++) {
      const step = sinkWalkStep(state,17,()=>0.999999);
      state = step.snapshots.at(-1)!.state;
      expect(state.slice(4*17).every(a=>a===0)).toBe(true);
      expect(state.reduce((s,a)=>s+a*a,0)).toBeCloseTo(1,10);
    }
    expect(() => sinkWalkStep(state,17,()=>1)).toThrow();
  });
});

