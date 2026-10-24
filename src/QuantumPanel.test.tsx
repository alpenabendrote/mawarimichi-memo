import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantumPanel } from './QuantumPanel';
import { starterNotes } from './notes';
import { prepareSearch } from './quantum/simulator';
import { observeNote } from './observation';

describe('simple quantum search', () => {
  const notes = starterNotes().map(note => ({ id: note.id, title: note.title }));
  it('defaults to the last position and uses a single disclosure for circuit and state', () => {
    const trace = prepareSearch(4, 2);
    const html = renderToStaticMarkup(<QuantumPanel trace={trace} notes={notes} step={null} onStep={() => {}} />);
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toContain('<summary>回路と状態</summary>');
    expect(html).toContain(`value="${trace.snapshots.length - 1}"`);
    expect(html).toContain('100.00');
    expect(html).toContain('測定前の状態');
    expect(html).toContain(notes[2].title);
    expect(html).not.toContain('この位置で測定して開封');
    expect(html).not.toContain('操作を再生');
  });
  it('measures directly at the final position without a separate opening step', () => {
    const result = observeNote(4, 2, null, () => 0.01);
    expect(result.measured).toBe(2);
    expect(result.iterations).toBe(1);
    expect(result.probabilities[2]).toBeCloseTo(1);
  });
  it('uses an explicitly chosen earlier position and reports its real outcome', () => {
    const trace = prepareSearch(4, 2);
    const result = observeNote(4, 2, trace.qubits, () => 0.01);
    expect(result.measured).toBe(0);
    expect(result.probabilities[2]).toBeCloseTo(0.25);
    const html = renderToStaticMarkup(<QuantumPanel trace={trace} notes={notes} step={trace.qubits} onStep={() => {}} />);
    expect(html).toContain('25.00');
  });
});
