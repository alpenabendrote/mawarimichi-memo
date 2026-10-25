import { describe, expect, it } from 'vitest';
import { coolText, coolingSnapshot, dampQubit, decodeCoolingRecord, prepareDamping } from './cooling';
import { coolingPayload } from '../coolingDeletion';

describe('amplitude damping via a fresh environment', () => {
  it('matches the Kraus channel, including off-diagonal complex coherence, after tracing out the environment', () => {
    const gamma = 0.3, psi = [Math.sqrt(0.3), 0, 0, Math.sqrt(0.7)] as const;
    const trace = prepareDamping(psi, gamma), joint = trace.coupled;
    let p0 = 0, p1 = 0, coherenceRe = 0, coherenceIm = 0;
    for (let e = 0; e < 2; e++) {
      const a = 4 * e, b = a + 2;
      p0 += joint[a] ** 2 + joint[a + 1] ** 2;
      p1 += joint[b] ** 2 + joint[b + 1] ** 2;
      coherenceRe += joint[a] * joint[b] + joint[a + 1] * joint[b + 1];
      coherenceIm += joint[a + 1] * joint[b] - joint[a] * joint[b + 1];
    }
    expect(p0).toBeCloseTo(0.3 + gamma * 0.7, 12);
    expect(p1).toBeCloseTo((1 - gamma) * 0.7, 12);
    expect(coherenceRe).toBeCloseTo(0, 12);
    expect(coherenceIm).toBeCloseTo(-Math.sqrt(0.21 * (1 - gamma)), 12);
    const noEmission = dampQubit(psi, () => 0, gamma);
    const emission = dampQubit(psi, () => 0.999, gamma);
    expect(noEmission.environment).toBe(0);
    expect(noEmission.state[3]).toBeCloseTo(Math.sqrt(0.7 * (1 - gamma) / (1 - 0.7 * gamma)), 12);
    expect(emission.environment).toBe(1);
    expect(emission.state[1]).toBeCloseTo(1, 12); expect(emission.state[0]).toBe(0); expect(emission.state[2]).toBe(0); expect(emission.state[3]).toBe(0); // Global phase i is preserved.
  });
  it('handles zero/full damping without adding excitations or forcing a measurement outcome', () => {
    expect(dampQubit([0, 0, 1, 0], () => 0.99, 0).state).toEqual([0, 0, 1, 0]);
    expect(dampQubit([0, 0, 1, 0], () => 0, 1)).toMatchObject({ state: [1, 0, 0, 0], environment: 1 });
    expect(dampQubit([1, 0, 0, 0], () => 0.99)).toMatchObject({ state: [1, 0, 0, 0], environment: 0 });
    expect(() => prepareDamping([NaN, 0, 0, 0])).toThrow();
    expect(() => prepareDamping([1, 0, 0, 0], -0.1)).toThrow();
  });
  it('records failed relaxation attempts, stops only after emission, and confirms every system bit as zero', () => {
    const samples = [0, 0, 0.9];
    const result = coolText('\u8000', () => samples.shift() ?? 0);
    expect(decodeCoolingRecord(result.records[0])).toEqual({ input: 1, steps: 3 });
    expect(result.finalZeroCount).toBe(16);
    expect(result.environmentCounts).toEqual([17, 1]);
    expect(result.rounds.map(row => row.remaining)).toEqual([1, 1, 1, 0]);
    expect(result.rounds.map(row => row.interactions)).toEqual([0, 16, 1, 1]);
    const first = coolingSnapshot(result.records[0], 1), last = coolingSnapshot(result.records[0], 3);
    expect(first.environment).toBe(0);
    expect(first.collapsed[2]).toBe(1);
    expect(last.environment).toBe(1);
    expect(last.collapsed[4]).toBe(1);
    expect(last.final).toBe(true);
    expect(() => coolText('\u8000', () => 0)).toThrow('緩和');
  });
  it('processes the complete UTF-16 title/body payload, including emoji, newlines, nulls and unpaired surrogates', () => {
    const text = coolingPayload({ title: '日本語🪐', body: '改行\n\u0000\ud800"' });
    const result = coolText(text, () => 0.9);
    expect(result.bitCount).toBe(text.length * 16);
    expect(result.finalZeroCount).toBe(result.bitCount);
    for (let i = 0; i < result.bitCount; i++) expect(decodeCoolingRecord(result.records[i]).input).toBe(text.charCodeAt(Math.floor(i / 16)) >>> (15 - i % 16) & 1);
    expect(result.environmentCounts[1]).toBe(result.initialExcited);
    expect(result.rounds.at(-1)?.remaining).toBe(0);
  });
});

