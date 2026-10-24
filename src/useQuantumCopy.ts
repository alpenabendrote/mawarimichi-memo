import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import TeleportWorker from './quantum/teleport.worker?worker&inline';
import type { TransferMessage, TransferSummary } from './quantum/teleportation';

export type CopyActivity = { source: string } & (
  { status: 'running'; completed: number; total: number } |
  { status: 'done'; result: TransferSummary } |
  { status: 'error' }
);

export function useQuantumCopy(resetKey: string) {
  const workerRef = useRef<Worker | null>(null);
  const [activity, setActivity] = useState<{ key: string; value: CopyActivity } | null>(null);
  useEffect(() => {
    setActivity(null);
    return () => { workerRef.current?.terminate(); workerRef.current = null; };
  }, [resetKey]);

  function onCopy(event: ClipboardEvent<HTMLElement>) {
    const field = event.target;
    if (event.defaultPrevented || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    const text = field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0);
    if (!text) return;
    const source = field instanceof HTMLTextAreaElement ? '本文' : 'タイトル';
    const update = (value: CopyActivity) => setActivity({ key: resetKey, value });
    workerRef.current?.terminate();
    workerRef.current = null;
    update({ status: 'running', source, completed: 0, total: text.length * 16 });
    // Let the browser perform the ordinary copy. Never replace the clipboard later.
    try {
      const worker = new TeleportWorker();
      workerRef.current = worker;
      worker.onmessage = (message: MessageEvent<TransferMessage>) => {
        if (workerRef.current !== worker) return;
        const data = message.data;
        if (data.type === 'progress') update({ status: 'running', source, completed: data.completed, total: text.length * 16 });
        else {
          update(data.type === 'done' ? { status: 'done', source, result: data.result } : { status: 'error', source });
          worker.terminate(); workerRef.current = null;
        }
      };
      worker.onerror = () => {
        if (workerRef.current !== worker) return;
        update({ status: 'error', source }); worker.terminate(); workerRef.current = null;
      };
      worker.postMessage(text);
    } catch { update({ status: 'error', source }); }
  }
  return { onCopy, activity: activity?.key === resetKey ? activity.value : null };
}
