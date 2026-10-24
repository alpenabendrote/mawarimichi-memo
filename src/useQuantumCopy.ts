import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import TeleportWorker from './quantum/teleport.worker?worker&inline';
import { teleportText, type TransferSummary } from './quantum/teleportation';
import { startQuantumCopy, type CopyFailure } from './quantumCopy';

export type CopyActivity = { source: string } & (
  { status: 'running'; completed: number; total: number } |
  { status: 'done'; result: TransferSummary } |
  { status: 'error'; reason: CopyFailure }
);

export function useQuantumCopy(resetKey: string) {
  const jobRef = useRef<{ cancel: () => void } | null>(null);
  const [activity, setActivity] = useState<{ key: string; value: CopyActivity } | null>(null);
  useEffect(() => {
    setActivity(null);
    return () => { jobRef.current?.cancel(); jobRef.current = null; };
  }, [resetKey]);

  function onCopy(event: ClipboardEvent<HTMLElement>) {
    const field = event.target;
    if (event.defaultPrevented || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    const text = field.value.slice(field.selectionStart ?? 0, field.selectionEnd ?? 0);
    if (!text) return;
    event.preventDefault();
    const source = field instanceof HTMLTextAreaElement ? '本文' : 'タイトル';
    const update = (value: CopyActivity) => setActivity({ key: resetKey, value });
    jobRef.current?.cancel();
    jobRef.current = null;
    update({ status: 'running', source, completed: 0, total: text.length * 16 });
    if (!navigator.clipboard?.writeText) {
      // Older browsers still copy the measured output, synchronously in the copy event.
      try {
        const { output, ...result } = teleportText(text);
        event.clipboardData.setData('text/plain', output);
        update({ status: 'done', source, result: { ...result, matches: output === text } });
      } catch { update({ status: 'error', source, reason: 'simulation' }); }
      return;
    }
    jobRef.current = startQuantumCopy(text, {
      createWorker: () => new TeleportWorker(),
      write: output => navigator.clipboard.writeText(output),
      onProgress: completed => update({ status: 'running', source, completed, total: text.length * 16 }),
      onDone: result => update({ status: 'done', source, result }),
      onError: reason => update({ status: 'error', source, reason }),
    });
  }
  return { onCopy, activity: activity?.key === resetKey ? activity.value : null };
}
