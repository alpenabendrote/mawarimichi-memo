import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantumPanel } from './QuantumPanel';
import { starterNotes } from './notes';
import { sealedLabels } from './sealed';
import { measureSearchAt, prepareSearch, runSearch } from './quantum/simulator';

describe('circuit display and opening', () => {
  const notes = starterNotes();
  const labels = sealedLabels(notes.map(note => note.id));
  const callbacks = { onOpenNote: () => {}, onMeasure: () => {} };

  it('shows the current probability without leaking any real title before opening', () => {
    const result = prepareSearch(4, 3);
    const html = renderToStaticMarkup(<QuantumPanel run={{ result, notes: labels, elapsed: 1, sealed: true }} {...callbacks} />);
    expect(html).toContain('まだ開封していません');
    expect(html).toContain('この位置で測定して開封');
    expect(html).toContain('25.0');
    for (const note of notes) {
      expect(html).not.toContain(note.title);
      expect(html).not.toContain(note.body);
    }
  });

  it('shows an honest miss after an early measurement and removes the measurement button', () => {
    const prepared = prepareSearch(4, 3);
    const result = measureSearchAt(prepared, prepared.qubits, () => 0.01);
    const html = renderToStaticMarkup(<QuantumPanel run={{ result, notes: labels, elapsed: 1, sealed: true }} {...callbacks} />);
    expect(result.measured).toBe(0);
    expect(html).toContain('別のメモが出ました');
    expect(html).toContain('メモA');
    expect(html).not.toContain('この位置で測定して開封');
    for (const note of notes) expect(html).not.toContain(note.title);
  });

  it('keeps ordinary search readable and fully measured', () => {
    const result = runSearch(4, 2, () => 0.5);
    const html = renderToStaticMarkup(<QuantumPanel run={{ result, notes: notes.map(note => ({ id: note.id, title: note.title })), elapsed: 1 }} {...callbacks} />);
    expect(html).toContain(notes[2].title);
    expect(html).toContain('指定されたメモを発見しました');
    expect(html).toContain('100.0');
    expect(html).not.toContain('この位置で測定して開封');
  });
});
