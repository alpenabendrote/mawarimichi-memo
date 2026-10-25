import { coolText, type CoolingMessage } from './cooling';

const worker = self as unknown as { onmessage: ((event: MessageEvent<string>) => void) | null; postMessage: (message: CoolingMessage, transfer?: Transferable[]) => void };
worker.onmessage = event => {
  try {
    let lastUpdate = performance.now();
    const result = coolText(event.data, undefined, completed => {
      if (performance.now() - lastUpdate < 100) return;
      lastUpdate = performance.now();
      worker.postMessage({ type: 'progress', completed, total: event.data.length * 16 });
    });
    worker.postMessage({ type: 'done', result }, [result.records.buffer as ArrayBuffer]);
  } catch { worker.postMessage({ type: 'error' }); }
};

