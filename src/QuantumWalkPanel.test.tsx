import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { QuantumWalkPanel } from './QuantumWalkPanel';
import { runWalk } from './quantum/walk';
import { starterNotes } from './notes';
import { App } from './App';

afterEach(() => vi.unstubAllGlobals());

describe('quantum walk controls and diagnostics', () => {
  it('keeps one disclosure available before execution without fabricating a measurement', () => {
    const html = renderToStaticMarkup(<QuantumWalkPanel record={null} open onOpenChange={() => {}} />);
    expect(html.match(/<details/g)).toHaveLength(1);
    expect(html).toMatch(/<details[^>]+open=""/);
    expect(html).toContain('おまかせの詳細');
    expect(html).not.toContain('実際の測定：');
    expect(html).toContain('設定は不要');
  });
  it('shows the actual result, complex calculation state and source exclusion without resampling or body snippets', () => {
    const notes = starterNotes();
    const random = vi.fn(() => 0.2);
    const record = { run: runWalk(4, 0, random), notes: notes.map(({ id, title }) => ({ id, title })) };
    const html = renderToStaticMarkup(<QuantumWalkPanel record={record} open onOpenChange={() => {}} />);
    expect(random).toHaveBeenCalledOnce();
    expect(html).toContain('おまかせの詳細');
    expect(html).toContain('3量子ビット');
    expect(html).toContain('買うもの');
    expect(html).toContain('71.43');
    expect(html).toContain('表示する計算段階');
    expect(html).toContain('再計算・再測定・メモの移動はしません');
    expect(html).toContain('12.50');
    expect(html).toContain('（測定）');
    for (const note of notes) expect(html).not.toContain(note.body);
    renderToStaticMarkup(<QuantumWalkPanel record={record} open={false} onOpenChange={() => {}} />);
    expect(random).toHaveBeenCalledOnce();
  });
  it('disables the next-note action when only one note exists', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => JSON.stringify(starterNotes().slice(0, 1)) } });
    const html = renderToStaticMarkup(<App />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>おまかせ<\/button>/);
    expect(html).toContain('おまかせの詳細');
  });
});
