import { correctText, type CorrectionMessage } from './errorCorrection';

const worker = self as unknown as { onmessage: ((event: MessageEvent<string>) => void) | null; postMessage: (message: CorrectionMessage, transfer?: Transferable[]) => void };
worker.onmessage = event => {
  try {
    if (typeof event.data !== 'string') throw Error('保存入力が不正です。');
    let lastUpdate = performance.now();
    const { output, result } = correctText(event.data, undefined, completed => {
      if (performance.now() - lastUpdate < 100) return;
      lastUpdate = performance.now();
      worker.postMessage({ type: 'progress', completed, total: event.data.length * 16 });
    });
    worker.postMessage({ type: 'done', output, result }, [result.records.buffer as ArrayBuffer]);
  } catch { worker.postMessage({ type: 'error' }); }
};
