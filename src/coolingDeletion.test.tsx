import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { coolText, type CoolingMessage } from './quantum/cooling';
import { coolingPayload, removeCooledNote, startCoolingDeletion } from './coolingDeletion';
import { CoolingPanel } from './CoolingPanel';
import { starterNotes } from './notes';

function job(commit = vi.fn(() => true)) {
  const worker = { onmessage: null as ((event: MessageEvent<CoolingMessage>) => void) | null, onerror: null as (() => void) | null, postMessage: vi.fn(), terminate: vi.fn() };
  const options = { createWorker: () => worker as unknown as Worker, commit, onProgress: vi.fn(), onDone: vi.fn(), onCancelled: vi.fn(), onError: vi.fn() };
  const running = startCoolingDeletion('A', options);
  const send = (data: CoolingMessage) => worker.onmessage?.({ data } as MessageEvent<CoolingMessage>);
  return { worker, options, running, send };
}
describe('deletion waits for verified cooling', () => {
  it('keeps the note during progress, commits once on successful completion, and ignores duplicate/late messages', () => {
    const j = job(), result = coolText('A', () => 0.9);
    expect(j.options.commit).not.toHaveBeenCalled();
    j.send({ type: 'progress', completed: 8, total: 16 });
    expect(j.options.onProgress).toHaveBeenCalledWith(8);
    expect(j.options.commit).not.toHaveBeenCalled();
    j.send({ type: 'done', result }); j.send({ type: 'done', result });
    expect(j.options.commit).toHaveBeenCalledOnce();
    expect(j.options.onDone).toHaveBeenCalledWith(result);
    expect(j.worker.terminate).toHaveBeenCalledOnce();
  });
  it('never deletes after cancellation, a worker error, incomplete zero measurements, or a changed source', () => {
    const result = coolText('A', () => 0.9);
    const cancelled = job(); cancelled.running.cancel(); cancelled.send({ type: 'done', result });
    expect(cancelled.options.commit).not.toHaveBeenCalled();
    const broken = job(); broken.send({ type: 'done', result: { ...result, finalZeroCount: 15 } });
    expect(broken.options.commit).not.toHaveBeenCalled(); expect(broken.options.onError).toHaveBeenCalledOnce();
    const failed = job(); failed.worker.onerror?.();
    expect(failed.options.commit).not.toHaveBeenCalled(); expect(failed.options.onError).toHaveBeenCalledOnce();
    const changed = job(vi.fn(() => false)); changed.send({ type: 'done', result });
    expect(changed.options.onDone).not.toHaveBeenCalled(); expect(changed.options.onCancelled).toHaveBeenCalledOnce();
  });
  it('preserves the complete original and its position for undo, while rejecting missing/edited notes', () => {
    const notes = starterNotes(), source = { ...notes[1] }, before = JSON.stringify(notes);
    const removed = removeCooledNote(notes, source)!;
    expect(removed.notes).toEqual([notes[0], notes[2], notes[3]]);
    expect(removed.deleted).toEqual({ note: notes[1], index: 1 });
    const restored = [...removed.notes]; restored.splice(removed.deleted.index, 0, removed.deleted.note);
    expect(restored).toEqual(notes); expect(JSON.stringify(notes)).toBe(before);
    expect(removeCooledNote(removed.notes, source)).toBeNull();
    expect(removeCooledNote(notes.map(n => n.id === source.id ? { ...n, body: 'edited' } : n), source)).toBeNull();
  });
  it('renders actual recorded amplitudes and a completed result independently of an active note', () => {
    const result = coolText(coolingPayload(starterNotes()[0]), () => 0.9);
    const html = renderToStaticMarkup(<CoolingPanel activity={{ title: '削除したメモ', status: 'done', result }} open onOpenChange={() => {}} />);
    expect(html).toContain('消去完了'); expect(html).toContain('複素振幅');
    expect(html).toContain('0.707107'); expect(html).toContain('実際に残った1');
    expect(html).toContain('s = 0');
  });
});

