import { describe, expect, it, vi } from 'vitest';
import { startQuantumCopy } from './quantumCopy';
import { teleportText, type TransferMessage } from './quantum/teleportation';

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function setup(writeOverride?: (output: string) => Promise<void>) {
  const worker = { onmessage: null as ((event: MessageEvent<TransferMessage>) => void) | null, onerror: null as (() => void) | null, postMessage: vi.fn(), terminate: vi.fn() };
  const copied: string[] = [];
  const done = vi.fn(), error = vi.fn(), progress = vi.fn();
  const write = vi.fn(writeOverride ?? (async (output: string) => { copied.push(output); }));
  const job = startQuantumCopy('original selection', { createWorker: () => worker as unknown as Worker, write, onDone: done, onError: error, onProgress: progress });
  const emit = (message: TransferMessage) => worker.onmessage?.({ data: message } as MessageEvent<TransferMessage>);
  const finish = () => {
    const { output, ...result } = teleportText('received output', () => 0.9);
    emit({ type: 'done', output, result: { ...result, matches: false } });
  };
  return { worker, copied, done, error, progress, write, job, emit, finish };
}

describe('copy waits for quantum output', () => {
  it('does not copy the selection early and writes only the reconstructed worker output', async () => {
    const copy = setup();
    expect(copy.write).not.toHaveBeenCalled();
    expect(copy.worker.postMessage).toHaveBeenCalledWith('original selection');
    await flush();
    expect(copy.copied).toEqual([]);
    expect(copy.done).not.toHaveBeenCalled();
    copy.emit({ type: 'progress', completed: 16 });
    expect(copy.progress).toHaveBeenCalledWith(16);
    expect(copy.copied).toEqual([]);
    expect(copy.write).not.toHaveBeenCalled();
    copy.finish();
    await flush();
    expect(copy.copied).toEqual(['received output']);
    expect(copy.done).toHaveBeenCalledOnce();
    expect(copy.done.mock.calls[0][0].matches).toBe(false); // Never substitute the original text.
    expect(copy.worker.terminate).toHaveBeenCalled();
  });
  it('reports completion only after the clipboard write succeeds', async () => {
    let finishWrite!: () => void;
    const writing = new Promise<void>(resolve => { finishWrite = resolve; });
    const copy = setup(async () => { await writing; });
    copy.finish();
    await flush();
    expect(copy.done).not.toHaveBeenCalled();
    finishWrite();
    await flush();
    expect(copy.done).toHaveBeenCalledOnce();
  });
  it('does not copy anything or fall back to the original when simulation fails', async () => {
    const copy = setup();
    copy.emit({ type: 'error' });
    await flush();
    expect(copy.copied).toEqual([]);
    expect(copy.done).not.toHaveBeenCalled();
    expect(copy.error).toHaveBeenCalledWith('simulation');
  });
  it('cancels stale jobs so their late messages cannot overwrite a newer copy', async () => {
    const old = setup();
    old.job.cancel();
    const current = setup();
    old.finish(); current.finish();
    await flush();
    expect(old.copied).toEqual([]);
    expect(old.done).not.toHaveBeenCalled();
    expect(old.error).not.toHaveBeenCalled();
    expect(current.copied).toEqual(['received output']);
  });
  it('stops simulation when the clipboard refuses the write', async () => {
    const copy = setup(() => Promise.reject(new Error('Not allowed')));
    copy.finish();
    await flush();
    expect(copy.error).toHaveBeenCalledWith('clipboard');
    expect(copy.worker.terminate).toHaveBeenCalled();
    expect(copy.done).not.toHaveBeenCalled();
  });
});
