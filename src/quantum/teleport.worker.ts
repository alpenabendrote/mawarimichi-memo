import { teleportText, type TransferMessage } from './teleportation';

// Inline worker: the source and note text stay in this browser.
const worker = self as unknown as { onmessage: ((event: MessageEvent<string>) => void) | null; postMessage: (message: TransferMessage, transfer?: Transferable[]) => void };
worker.onmessage = event => {
  try {
    let lastUpdate = performance.now();
    const { output, ...result } = teleportText(event.data, undefined, completed => {
      if (performance.now() - lastUpdate < 100) return;
      lastUpdate = performance.now();
      worker.postMessage({ type: 'progress', completed });
    });
    worker.postMessage({ type: 'done', output, result: { ...result, matches: output === event.data } }, [result.records.buffer as ArrayBuffer]);
  } catch { worker.postMessage({ type: 'error' }); }
};
