import type { SimilarityMessage, SimilarityRequest, SimilarityResult } from './similarity';

export function startSimilarityComparison(request: SimilarityRequest, dependencies: {
  createWorker: () => Worker;
  onProgress: (completed: number, total: number) => void;
  onDone: (result: SimilarityResult) => void;
  onError: () => void;
}) {
  let worker: Worker | null = null;
  let stopped = false;
  const cancel = () => { stopped = true; worker?.terminate(); worker = null; };
  const fail = () => { if (!stopped) { cancel(); dependencies.onError(); } };
  try {
    worker = dependencies.createWorker();
    worker.onmessage = (event: MessageEvent<SimilarityMessage>) => {
      if (stopped) return;
      const message = event.data;
      if (message.type === 'progress') dependencies.onProgress(message.completed, message.total);
      else if (message.type === 'done') { cancel(); dependencies.onDone(message.result); }
      else fail();
    };
    worker.onerror = fail;
    worker.postMessage(request);
  } catch { fail(); }
  return { cancel };
}
