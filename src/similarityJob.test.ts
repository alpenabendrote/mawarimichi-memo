import { describe, expect, it, vi } from 'vitest';
import { startSimilarityComparison } from './similarityJob';
import type { SimilarityMessage, SimilarityResult } from './similarity';

const result: SimilarityResult = { activeId: 'a', candidates: [], featureDimension: 64, featureCount: 0, omittedFeatures: 0, sourcePreparationGates: 0, elapsed: 1 };
function setup() {
  const worker = { onmessage: null as ((event: MessageEvent<SimilarityMessage>) => void) | null, onerror: null as (() => void) | null, postMessage: vi.fn(), terminate: vi.fn() };
  const done = vi.fn(), error = vi.fn(), progress = vi.fn();
  const request = { notes: [{ id: 'a', title: '', body: 'text' }], activeId: 'a' };
  const job = startSimilarityComparison(request, { createWorker: () => worker as unknown as Worker, onDone: done, onError: error, onProgress: progress });
  const emit = (message: SimilarityMessage) => worker.onmessage?.({ data: message } as MessageEvent<SimilarityMessage>);
  return { worker, done, error, progress, job, emit, request };
}
describe('background similarity jobs', () => {
  it('publishes results only after simulation and terminates the finished worker', () => {
    const task = setup();
    expect(task.worker.postMessage).toHaveBeenCalledWith(task.request);
    expect(task.done).not.toHaveBeenCalled();
    task.emit({ type: 'progress', completed: 1, total: 3 });
    expect(task.progress).toHaveBeenCalledWith(1, 3);
    task.emit({ type: 'done', result });
    expect(task.done).toHaveBeenCalledExactlyOnceWith(result);
    expect(task.worker.terminate).toHaveBeenCalledOnce();
  });
  it('ignores delayed results and errors after editing or switching notes cancels a job', () => {
    const task = setup(); task.job.cancel();
    task.emit({ type: 'done', result }); task.worker.onerror?.();
    expect(task.done).not.toHaveBeenCalled(); expect(task.error).not.toHaveBeenCalled();
    expect(task.worker.terminate).toHaveBeenCalledOnce();
  });
  it('does not publish a fallback comparison when the worker fails', () => {
    const task = setup(); task.emit({ type: 'error' }); task.emit({ type: 'done', result });
    expect(task.error).toHaveBeenCalledOnce(); expect(task.done).not.toHaveBeenCalled();
  });
});
