import { describe, expect, it, vi } from 'vitest';
import { insertReceived, pastePayload, startQuantumPaste, type PastePosition } from './quantumPaste';
import { teleportText, type TransferMessage } from './quantum/teleportation';

const position: PastePosition = { value: 'leftRIGHTend', start: 4, end: 9, maxLength: 200000, multiline: true };

function setup(valid = true) {
  const worker = { onmessage: null as ((event: MessageEvent<TransferMessage>) => void) | null, onerror: null as (() => void) | null, postMessage: vi.fn(), terminate: vi.fn() };
  let value = position.value;
  const insert = vi.fn((output: string) => { if (!valid) return false; value = insertReceived(position, output); return true; });
  const done = vi.fn(), error = vi.fn(), cancelled = vi.fn(), progress = vi.fn();
  const job = startQuantumPaste('clipboard input', { createWorker: () => worker as unknown as Worker, insert, onDone: done, onError: error, onCancelled: cancelled, onProgress: progress });
  const emit = (message: TransferMessage) => worker.onmessage?.({ data: message } as MessageEvent<TransferMessage>);
  const finish = () => {
    const { output, ...result } = teleportText('受信', () => 0.9);
    emit({ type: 'done', output, result: { ...result, matches: false } });
  };
  return { worker, value: () => value, insert, done, error, cancelled, progress, job, emit, finish };
}

describe('quantum paste', () => {
  it('leaves the document untouched until completion, then replaces the selection with measured output', () => {
    const paste = setup();
    expect(paste.worker.postMessage).toHaveBeenCalledWith('clipboard input');
    paste.emit({ type: 'progress', completed: 16 });
    expect(paste.progress).toHaveBeenCalledWith(16);
    expect(paste.value()).toBe('leftRIGHTend');
    expect(paste.insert).not.toHaveBeenCalled();
    paste.finish();
    expect(paste.value()).toBe('left受信end');
    expect(paste.done).toHaveBeenCalledOnce();
    expect(paste.done.mock.calls[0][0].matches).toBe(false);
    expect(paste.worker.terminate).toHaveBeenCalled();
  });
  it('does not insert the original clipboard text if simulation fails', () => {
    const paste = setup();
    paste.emit({ type: 'error' });
    expect(paste.value()).toBe(position.value);
    expect(paste.insert).not.toHaveBeenCalled();
    expect(paste.error).toHaveBeenCalledOnce();
    expect(paste.done).not.toHaveBeenCalled();
  });
  it('ignores late results after editing or switching notes cancels a job', () => {
    const paste = setup();
    paste.job.cancel(); paste.finish();
    expect(paste.insert).not.toHaveBeenCalled();
    expect(paste.done).not.toHaveBeenCalled();
    expect(paste.error).not.toHaveBeenCalled();
  });
  it('does not insert into a document that changed before completion', () => {
    const paste = setup(false);
    paste.finish();
    expect(paste.value()).toBe(position.value);
    expect(paste.done).not.toHaveBeenCalled();
    expect(paste.cancelled).toHaveBeenCalledOnce();
  });
  it('normalizes textarea line endings and keeps emoji intact', () => {
    expect(pastePayload('量子🪐\r\n次\r終', position)).toBe('量子🪐\n次\n終');
  });
  it('removes line breaks for titles and limits the actual transfer to available space', () => {
    expect(pastePayload('A\r\nB\nC', { value: 'xyz', start: 1, end: 2, maxLength: 4, multiline: false })).toBe('AB');
    expect(pastePayload('text', { value: 'full', start: 4, end: 4, maxLength: 4, multiline: true })).toBe('');
  });
});
