import type { TransferMessage, TransferSummary } from './quantum/teleportation';

export interface PastePosition { value: string; start: number; end: number; maxLength: number; multiline: boolean }

/** Match native input/textarea newline handling and the available character limit. */
export function pastePayload(text: string, position: PastePosition): string {
  const normalized = position.multiline ? text.replace(/\r\n?/g, '\n') : text.replace(/[\r\n]/g, '');
  const available = Math.max(0, position.maxLength - (position.value.length - (position.end - position.start)));
  return normalized.slice(0, available);
}

export function insertReceived(position: PastePosition, output: string): string {
  return position.value.slice(0, position.start) + output + position.value.slice(position.end);
}

/** Insert only the worker's measured output, and only if the captured edit is still valid. */
export function startQuantumPaste(text: string, dependencies: {
  createWorker: () => Worker;
  insert: (output: string) => boolean;
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
        if (dependencies.insert(message.output)) dependencies.onDone(message.result);
        else dependencies.onCancelled();
      } else fail();
    };
    worker.onerror = fail;
    worker.postMessage(text);
  } catch { fail(); }
  return { cancel };
}
