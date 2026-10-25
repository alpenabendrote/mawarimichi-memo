import type { Note } from './notes';
import type { CoolingMessage, CoolingResult } from './quantum/cooling';

export type CoolingActivity = { title: string } & (
  { status: 'running'; completed: number; total: number } |
  { status: 'done'; result: CoolingResult } |
  { status: 'cancelled' } | { status: 'error' }
);
export const coolingPayload = (note: Pick<Note, 'title' | 'body'>) => JSON.stringify([note.title, note.body]);

export function removeCooledNote(notes: Note[], source: Note) {
  const index = notes.findIndex(note => note.id === source.id);
  const note = notes[index];
  if (!note || note.title !== source.title || note.body !== source.body) return null;
  return { notes: notes.filter(item => item.id !== source.id), deleted: { note, index } };
}

/** Only a successful current worker may commit a deletion. Cancellation invalidates late messages. */
export function startCoolingDeletion(text: string, options: {
  createWorker: () => Worker;
  commit: () => boolean;
  onProgress: (completed: number) => void;
  onDone: (result: CoolingResult) => void;
  onCancelled: () => void;
  onError: () => void;
}) {
  let worker: Worker | null = null, stopped = false;
  const cancel = () => { stopped = true; worker?.terminate(); worker = null; };
  const fail = () => { if (stopped) return; cancel(); options.onError(); };
  try {
    worker = options.createWorker();
    worker.onmessage = (event: MessageEvent<CoolingMessage>) => {
      if (stopped) return;
      const message = event.data;
      if (message.type === 'progress') options.onProgress(message.completed);
      else if (message.type === 'done') {
        const result = message.result;
        if (result.bitCount !== text.length * 16 || result.records.length !== result.bitCount || result.finalZeroCount !== result.bitCount || result.rounds.at(-1)?.remaining !== 0) { fail(); return; }
        cancel();
        try { if (options.commit()) options.onDone(result); else options.onCancelled(); } catch { options.onError(); }
      } else fail();
    };
    worker.onerror = fail;
    worker.postMessage(text);
  } catch { fail(); }
  return { cancel };
}

