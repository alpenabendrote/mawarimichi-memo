import type { TransferMessage, TransferSummary } from './teleportation';

export type TransferActivity = { source: string } & (
  { status: 'running'; completed: number; total: number } |
  { status: 'done'; result: TransferSummary } |
  { status: 'cancelled' } |
  { status: 'error' }
);

/** Deliver only the measured output; a cancelled transfer never delivers a late result. */
export function startTextTransfer(text: string, dependencies: {
  createWorker: () => Worker;
  receive: (output: string) => boolean;
  onProgress: (completed: number) => void;
  onDone: (result: TransferSummary) => void;
  onCancelled: () => void;
  onError: () => void;
}): { cancel: () => void } {
  let worker: Worker | null = null;
  let stopped = false;
  const cancel = () => { stopped = true; worker?.terminate(); worker = null; };
  const fail = () => { if (stopped) return; cancel(); dependencies.onError(); };
  try {
    worker = dependencies.createWorker();
    worker.onmessage = (event: MessageEvent<TransferMessage>) => {
      if (stopped) return;
      const message = event.data;
      if (message.type === 'progress') dependencies.onProgress(message.completed);
      else if (message.type === 'done') {
        cancel();
        try {
          if (dependencies.receive(message.output)) dependencies.onDone(message.result);
          else dependencies.onCancelled();
        } catch { dependencies.onError(); }
      } else fail();
    };
    worker.onerror = fail;
    worker.postMessage(text);
  } catch { fail(); }
  return { cancel };
}
