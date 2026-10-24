import { describe, expect, it } from 'vitest';
import { decodeRecord, measureQubit, teleportQubit, teleportText } from './teleportation';
import { applyGate, probabilities, zeroState } from './simulator';

describe('quantum teleportation', () => {
  const inputs: [number, number, number, number][] = [
    [1, 0, 0, 0], [0, 0, 1, 0],
    [Math.SQRT1_2, 0, Math.SQRT1_2, 0],
    [Math.SQRT1_2, 0, -Math.SQRT1_2, 0],
    [Math.SQRT1_2, 0, 0, Math.SQRT1_2],
    [Math.sqrt(0.3), 0, Math.sqrt(0.7) * Math.cos(0.73), Math.sqrt(0.7) * Math.sin(0.73)],
  ];
  for (const m0 of [0, 1]) for (const m1 of [0, 1]) {
    it(`preserves amplitudes and relative phase for Alice's outcome ${m0}${m1}`, () => {
      for (const psi of inputs) {
        const samples = [m0 ? 0.9 : 0.1, m1 ? 0.9 : 0.1];
        const result = teleportQubit(psi, () => samples.shift()!);
        expect([result.m0, result.m1]).toEqual([m0, m1]);
        const base = m0 + 2 * m1;
        const actual = [result.state[2 * base], result.state[2 * base + 1], result.state[2 * (base + 4)], result.state[2 * (base + 4) + 1]];
        // Global phase is immaterial; the complex overlap must have magnitude one.
        const overlapRe = psi[0] * actual[0] + psi[1] * actual[1] + psi[2] * actual[2] + psi[3] * actual[3];
        const overlapIm = psi[0] * actual[1] - psi[1] * actual[0] + psi[2] * actual[3] - psi[3] * actual[2];
        expect(overlapRe ** 2 + overlapIm ** 2).toBeCloseTo(1, 12);
        expect(probabilities(result.state).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      }
    });
  }
  it('measures only the specified qubit instead of collapsing the whole register', () => {
    let state = zeroState(3);
    for (const target of [0, 1, 2]) state = applyGate(state, { kind: 'H', target, controls: [], stage: 'prepare', iteration: 0 });
    const result = measureQubit(state, 0, () => 0.9);
    expect(result.value).toBe(1);
    probabilities(result.state).forEach((p, index) => expect(p).toBeCloseTo(index & 1 ? 0.25 : 0, 12));
    expect(() => measureQubit(state, 0, () => 1)).toThrow();
  });
  it('reconstructs every 8-bit character through actual measurements', () => {
    let index = 0;
    const samples = [0.1, 0.1, 0.5, 0.1, 0.9, 0.5, 0.9, 0.1, 0.5, 0.9, 0.9, 0.5];
    const text = Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)).join('');
    const result = teleportText(text, () => samples[index++ % samples.length]);
    expect(result.output).toBe(text);
    expect(result.bitCount).toBe(4096);
    expect(result.counts).toEqual([1024, 1024, 1024, 1024]);
    for (const record of result.records) expect(decodeRecord(record).output).toBe(decodeRecord(record).input);
  });
  it('preserves Japanese, emoji, newlines, and even lone UTF-16 surrogates', () => {
    const text = 'メモ🪐\n\r\n量子\t\u0000\ud800';
    const result = teleportText(text, () => 0.9);
    expect(result.output).toBe(text);
    expect(result.records.length).toBe(text.length * 16);
    expect(result.counts).toEqual([0, 0, 0, text.length * 16]);
  });
  it('handles an empty selection without generating a measurement', () => {
    const result = teleportText('', () => { throw new Error('No measurement expected'); });
    expect(result.output).toBe('');
    expect(result.bitCount).toBe(0);
  });
});
