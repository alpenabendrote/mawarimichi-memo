import { describe, expect, it, vi } from 'vitest';
import { correctText, correctionRecordTrace, decodeCorrectionRecord, tracePhaseCorrection, MAX_SAVE_RECORDS, type Qubit, type PhaseNoise } from './errorCorrection';

describe('five-qubit phase-error correction', () => {
  it('corrects every single phase error without destroying unknown complex logical amplitudes', () => {
    const states: Qubit[] = [[1,0,0,0], [0,0,1,0], [Math.SQRT1_2,0,0,Math.SQRT1_2], [0.5,0.5,-0.5,0.5]];
    for (const psi of states) for (const noise of [-1,0,1,2] as PhaseNoise[]) {
      const trace = tracePhaseCorrection(psi, noise, () => 0.41);
      const expected = noise === -1 ? [0,0] : noise === 0 ? [1,0] : noise === 1 ? [1,1] : [0,1];
      expect(trace.syndrome).toEqual(expected);
      expect(trace.correction).toBe(noise);
      const decoded = trace.snapshots.at(-2)!.state;
      const offset = (expected[0] << 3 | expected[1] << 4) * 2;
      for (let part=0;part<4;part++) expect(decoded[offset+part]).toBeCloseTo(psi[part], 10);
      for (let i=0;i<decoded.length;i++) if (i < offset || i >= offset + 4) expect(decoded[i]).toBeCloseTo(0,10);
      for (const snapshot of trace.snapshots) expect(snapshot.state.reduce((sum,x)=>sum+x*x,0)).toBeCloseTo(1,10);
      expect(trace.snapshots.some(s=>s.step?.kind==='M' && s.step.target===3)).toBe(true);
      expect(trace.snapshots.some(s=>s.step?.kind==='M' && s.step.target===4)).toBe(true);
    }
  });
  it('really creates superposition and changes phases before syndrome measurement', () => {
    const trace=tracePhaseCorrection([1,0,0,0],1,()=>0.3);
    const encoded=trace.snapshots.findLast(s=>s.step?.stage==='prepare')!.state;
    expect(Array.from(encoded).filter(x=>Math.abs(x)>1e-10)).toHaveLength(8);
    const noisy=trace.snapshots.find(s=>s.step?.stage==='noise')!.state;
    expect(Array.from(noisy).some(x=>x<0)).toBe(true);
    expect(trace.output).toBe(0);
  });
  it('round trips UTF-16 exactly, including emoji, NUL, lone surrogates and empty input', () => {
    let n=0;const random=()=>[0.1,0.3,0.6,0.9][n++%4];
    for(const input of ['', '日本語🪐\n\u0000\uD800\uDC00\uDFFF', '[]']) {
      const {output,result}=correctText(input,random);
      expect(output).toBe(input);
      expect(result.bitCount).toBe(input.length*16);
      expect(result.syndromeCounts.reduce((a,b)=>a+b,0)).toBe(result.bitCount);
      expect(result.noiseCounts.reduce((a,b)=>a+b,0)).toBe(result.bitCount);
      expect(result.correctedCount).toBe(result.bitCount-result.syndromeCounts[0]);
      for(const record of result.records) {
        const r=decodeCorrectionRecord(record);
        expect(r.output).toBe(r.input);
        expect(correctionRecordTrace(record).syndrome).toEqual(r.syndrome);
      }
    }
  });
  it('computes all bits while bounding diagnostics, including the final bit', () => {
    const input='長い本文'.repeat(500);
    const progress=vi.fn(), random=vi.fn(()=>0.6);
    const {output,result}=correctText(input,random,progress);
    expect(output).toBe(input);
    expect(random).toHaveBeenCalledTimes(input.length*16*4); // noise + 3 projective measurements per bit
    expect(result.records).toHaveLength(MAX_SAVE_RECORDS);
    expect(result.positions[0]).toBe(0);
    expect(result.positions.at(-1)).toBe(result.bitCount-1);
    expect(progress).toHaveBeenCalled();
  });
  it('preserves an archive beyond the normal body limit without truncating its computed bits', () => {
    const text='長'.repeat(210000)+'🪐', start=performance.now();
    const {output,result}=correctText(text,()=>0.6);
    expect(output).toBe(text);
    expect(result.bitCount).toBe(text.length*16);
    expect(result.positions.at(-1)).toBe(result.bitCount-1);
    expect(result.records).toHaveLength(MAX_SAVE_RECORDS);
    console.log('Full 210k archive correction: '+(performance.now()-start).toFixed(0)+' ms');
  }, 120000);
  it('rejects invalid physical inputs and random values', () => {
    expect(()=>tracePhaseCorrection([2,0,0,0],0)).toThrow();
    expect(()=>tracePhaseCorrection([1,0,0,0],3 as PhaseNoise)).toThrow();
    expect(()=>correctText('a',()=>1)).toThrow();
  });
});
