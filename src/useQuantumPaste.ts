import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import TeleportWorker from './quantum/teleport.worker?worker&inline';
import type { Note } from './notes';
import { startTextTransfer, type TransferActivity } from './quantum/transfer';
import { insertReceived, pastePayload } from './quantumPaste';

export function useQuantumPaste(note: Note, bodyVisible: boolean, onChange: (field: 'title' | 'body', value: string) => void) {
  const resetKey = `${note.id}:${bodyVisible}`;
  const current = useRef({ note, bodyVisible });
  current.current = { note, bodyVisible };
  const jobRef = useRef<{ cancel: () => void } | null>(null);
  const [activity, setActivity] = useState<{ key: string; value: TransferActivity } | null>(null);
  useEffect(() => {
    setActivity(null);
    return () => { jobRef.current?.cancel(); jobRef.current = null; };
  }, [resetKey]);

  function onEdit(field: 'title' | 'body', value: string) {
    jobRef.current?.cancel(); jobRef.current = null;
    setActivity(previous => previous?.value.status === 'running' ? { ...previous, value: { source: previous.value.source, status: 'cancelled' } } : previous);
    onChange(field, value);
  }

  function onPaste(event: ClipboardEvent<HTMLElement>) {
    const element = event.target;
    if (event.defaultPrevented || !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    const text = event.clipboardData.getData('text/plain');
    if (!text) return;
    event.preventDefault();
    const field = element instanceof HTMLTextAreaElement ? 'body' : 'title';
    const source = field === 'body' ? '本文' : 'タイトル';
    const position = { value: element.value, start: element.selectionStart ?? 0, end: element.selectionEnd ?? 0, maxLength: element.maxLength, multiline: field === 'body' };
    const payload = pastePayload(text, position);
    const update = (value: TransferActivity) => setActivity({ key: resetKey, value });
    jobRef.current?.cancel(); jobRef.current = null;
    if (!payload) { setActivity(null); return; }
    update({ status: 'running', source, completed: 0, total: payload.length * 16 });
    jobRef.current = startTextTransfer(payload, {
      createWorker: () => new TeleportWorker(),
      receive: output => {
        const latest = current.current;
        if (latest.note.id !== note.id || latest.note[field] !== position.value || (field === 'body' && !latest.bodyVisible)) return false;
        const inserted = insertReceived(position, output);
        onChange(field, inserted);
        requestAnimationFrame(() => {
          if (current.current.note.id === note.id && document.activeElement === element && element.value === inserted) element.setSelectionRange(position.start + output.length, position.start + output.length);
        });
        return true;
      },
      onProgress: completed => update({ status: 'running', source, completed, total: payload.length * 16 }),
      onDone: result => update({ status: 'done', source, result }),
      onCancelled: () => update({ status: 'cancelled', source }),
      onError: () => update({ status: 'error', source }),
    });
  }
  return { onPaste, onEdit, activity: activity?.key === resetKey ? activity.value : null };
}
