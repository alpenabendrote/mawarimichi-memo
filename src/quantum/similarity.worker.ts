import { compareNotes, type SimilarityMessage, type SimilarityRequest } from '../similarity';

const worker = self as unknown as { onmessage: ((event: MessageEvent<SimilarityRequest>) => void) | null; postMessage: (message: SimilarityMessage) => void };
worker.onmessage = event => {
  try {
    const result = compareNotes(event.data, undefined, (completed, total) => worker.postMessage({ type: 'progress', completed, total }));
    worker.postMessage({ type: 'done', result });
  } catch { worker.postMessage({ type: 'error' }); }
};
