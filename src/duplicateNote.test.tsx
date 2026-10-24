import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { addDuplicate, duplicatePayload, receivedDuplicate } from './duplicateNote';
import { starterNotes } from './notes';
import { teleportText, type TransferMessage } from './quantum/teleportation';
import { startTextTransfer } from './quantum/transfer';
import { App } from './App';
import { MAX_NOTES } from './quantum/simulator';

afterEach(() => vi.unstubAllGlobals());
const timestamp = '2026-10-24T00:00:00.000Z';

describe('whole-note duplication', () => {
  it('teleports the entire title and body, preserving Japanese, emoji and newlines', () => {
    const original = { ...starterNotes()[0], title: '量子🪐メモ', body: '1行目\n"引用"と\\記号\n\n最後\u0000' };
    const before = JSON.stringify(original);
    const transfer = teleportText(duplicatePayload(original), () => 0.9);
    const copy = receivedDuplicate(transfer.output, 'new-id', timestamp);
    expect(copy).toEqual({ id: 'new-id', title: '量子🪐メモのコピー', body: original.body, updatedAt: timestamp });
    expect(transfer.bitCount).toBe(duplicatePayload(original).length * 16);
    expect(JSON.stringify(original)).toBe(before);
  });
  it('creates nothing before completion and builds the new note only from received fields', () => {
    const original = starterNotes()[0];
    let notes = [original];
    const worker = { onmessage: null as ((event: MessageEvent<TransferMessage>) => void) | null, onerror: null, postMessage: vi.fn(), terminate: vi.fn() };
    const done = vi.fn();
    startTextTransfer(duplicatePayload(original), {
      createWorker: () => worker as unknown as Worker,
      receive: output => { notes = addDuplicate(notes, original.id, receivedDuplicate(output, 'copy-id', timestamp))!; return true; },
      onProgress: () => {}, onDone: done, onCancelled: () => {}, onError: () => {},
    });
    expect(notes).toEqual([original]);
    expect(done).not.toHaveBeenCalled();
    const { output, ...result } = teleportText(duplicatePayload({ title: '受信タイトル', body: '受信本文' }), () => 0.1);
    worker.onmessage?.({ data: { type: 'done', output, result: { ...result, matches: false } } } as MessageEvent<TransferMessage>);
    expect(notes[1]).toMatchObject({ id: 'copy-id', title: '受信タイトルのコピー', body: '受信本文' });
    expect(notes[0]).toBe(original);
    expect(done).toHaveBeenCalledOnce();
  });
  it('supports an untitled note with an empty body', () => {
    expect(receivedDuplicate(duplicatePayload({ title: '', body: '' }), 'id', timestamp)).toMatchObject({ title: '無題のメモのコピー', body: '' });
  });
  it('fits the copy suffix within the title limit without splitting an emoji', () => {
    const copy = receivedDuplicate(duplicatePayload({ title: 'a'.repeat(115) + '🪐tail', body: '' }), 'id', timestamp);
    expect(copy.title.length).toBeLessThanOrEqual(120);
    expect(copy.title).toBe('a'.repeat(115) + 'のコピー');
  });
  it('inserts immediately after the original while preserving existing notes and order', () => {
    const notes = starterNotes();
    const copy = receivedDuplicate(duplicatePayload(notes[1]), 'new-id', timestamp);
    const next = addDuplicate(notes, notes[1].id, copy)!;
    expect(next.map(note => note.id)).toEqual([notes[0].id, notes[1].id, copy.id, notes[2].id, notes[3].id]);
    expect(next[1]).toBe(notes[1]);
    expect(notes).toHaveLength(4);
  });
  it('never exceeds capacity or replaces a removed or existing ID', () => {
    const notes = Array.from({ length: MAX_NOTES }, (_, i) => ({ ...starterNotes()[0], id: `note-${i}` }));
    const copy = receivedDuplicate(duplicatePayload(notes[0]), 'new-id', timestamp);
    expect(addDuplicate(notes.slice(0, -1), notes[0].id, copy)).toHaveLength(128);
    expect(addDuplicate(notes, notes[0].id, copy)).toBeNull();
    expect(addDuplicate(notes.slice(0, 4), 'removed-id', copy)).toBeNull();
    expect(addDuplicate(notes.slice(0, 4), notes[0].id, { ...copy, id: notes[1].id })).toBeNull();
    expect(notes).toHaveLength(128);
    vi.stubGlobal('window', { localStorage: { getItem: () => JSON.stringify(notes) } });
    const html = renderToStaticMarkup(<App />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>複製<\/button>/);
  });
  it('rejects damaged received payloads instead of substituting the original note', () => {
    for (const data of ['broken', '{}', '["only title"]', '["title",123]']) expect(() => receivedDuplicate(data, 'id', timestamp)).toThrow();
  });
});
