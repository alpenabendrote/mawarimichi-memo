import type { TransferMessage, TransferSummary } from './quantum/teleportation';

export type CopyFailure = 'simulation' | 'clipboard';
class TransferError extends Error {}

/** Leave the clipboard untouched until every selected bit has been teleported. */
export function startQuantumCopy(text: string, dependencies: {
  createWorker: () => Worker;
  write: (output: string) => Promise<void>;
  onProgress: (completed: number) => void;
  onDone: (result: TransferSummary) => void;
  onError: (reason: CopyFailure) => void;
}): { cancel: () => void } {
  let worker: Worker | null = null;
  let finished = false;
  let resolveTransfer!: (value: { output: string; result: TransferSummary }) => void;
  let rejectTransfer!: (reason: Error) => void;
  const transfer = new Promise<{ output: string; result: TransferSummary }>((resolve, reject) => {
    resolveTransfer = resolve; rejectTransfer = reject;
  });
  const stopWorker = () => { worker?.terminate(); worker = null; };
  const cancel = () => {
    if (finished) return;
    finished = true; stopWorker(); rejectTransfer(new TransferError('Cancelled'));
  };
  const fail = (reason: CopyFailure) => {
    if (finished) return;
    finished = true; stopWorker(); rejectTransfer(new TransferError('Copy failed'));
    dependencies.onError(reason);
  };

  void transfer.then(async ({ output, result }) => {
    if (finished) return;
    await dependencies.write(output);
    if (finished) return;
    finished = true; dependencies.onDone(result);
  }).catch(error => fail(error instanceof TransferError ? 'simulation' : 'clipboard'));

  try {
    worker = dependencies.createWorker();
    worker.onmessage = (event: MessageEvent<TransferMessage>) => {
      if (finished) return;
      const message = event.data;
      if (message.type === 'progress') dependencies.onProgress(message.completed);
      else if (message.type === 'done') {
        stopWorker(); resolveTransfer({ output: message.output, result: message.result });
      } else rejectTransfer(new TransferError('Simulation failed'));
    };
    worker.onerror = () => rejectTransfer(new TransferError('Worker failed'));
    worker.postMessage(text);
  } catch { fail('simulation'); }
  return { cancel };
}
