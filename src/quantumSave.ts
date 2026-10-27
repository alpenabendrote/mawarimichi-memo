import { MAX_SAVE_RECORDS, type CorrectionMessage, type CorrectionSummary } from './quantum/errorCorrection';

export type SaveActivity =
  { status: 'running'; completed: number; total: number } |
  { status: 'writing' | 'done'; result: CorrectionSummary } |
  { status: 'error' };

/** A queued old snapshot must not overwrite a newer one; in-flight writes finish in order. */
export function serialSaveCommitter(write: (raw: string) => Promise<void>) {
  let tail: Promise<unknown> = Promise.resolve();
  return (raw: string, current: () => boolean): Promise<boolean> => {
    const operation = tail.catch(() => {}).then(async () => {
      if (!current()) return false;
      await write(raw);
      return true;
    });
    tail = operation;
    return operation;
  };
}

function validSummary(summary: CorrectionSummary, raw: string) {
  const bits = raw.length * 16;
  return summary && summary.bitCount === bits && summary.records instanceof Uint8Array &&
    Array.isArray(summary.positions) && summary.positions.length === summary.records.length &&
    summary.records.length === Math.min(bits, MAX_SAVE_RECORDS) &&
    summary.positions.every((x, i) => Number.isInteger(x) && x >= 0 && x < bits && (!i || summary.positions[i - 1] < x)) &&
    Number.isFinite(summary.elapsed) && summary.elapsed >= 0 &&
    [summary.syndromeCounts, summary.noiseCounts].every(counts => Array.isArray(counts) && counts.length === 4 &&
      counts.every(x => Number.isSafeInteger(x) && x >= 0) && counts.reduce((a, b) => a + b, 0) === bits) &&
    Number.isSafeInteger(summary.correctedCount) && summary.correctedCount === bits - summary.syndromeCounts[0] &&
    summary.syndromeCounts.every((n, i) => n === summary.noiseCounts[[0, 3, 1, 2][i]]) &&
    summary.records.every((record, i) => {
      const position = summary.positions[i];
      const input = raw.charCodeAt(Math.floor(position / 16)) >>> (15 - position % 16) & 1;
      return record < 64 && (record & 1) === input && (record >>> 5 & 1) === input &&
        (record >>> 3 & 3) === [0, 1, 3, 2][record >>> 1 & 3];
    });
}

/** No original-string fallback. The writer only receives the verified measured output. */
export function startQuantumSave(raw: string, dependencies: {
  createWorker: () => Worker;
  isCurrent: () => boolean;
  commit: (raw: string, current: () => boolean) => Promise<boolean>;
  onActivity: (activity: SaveActivity) => void;
  onError: () => void;
}) {
  let stopped = false, finishedSimulation = false, worker: Worker | null = null;
  const current = () => !stopped && dependencies.isCurrent();
  const cancel = () => { stopped = true; worker?.terminate(); worker = null; };
  const fail = () => { if (!current()) { cancel(); return; } cancel(); dependencies.onActivity({ status: 'error' }); dependencies.onError(); };
  try {
    worker = dependencies.createWorker();
    dependencies.onActivity({ status: 'running', completed: 0, total: raw.length * 16 });
    let completed = 0;
    worker.onmessage = (event: MessageEvent<CorrectionMessage>) => {
      if (finishedSimulation) return;
      if (!current()) { cancel(); return; }
      try {
        const message = event.data;
        if (message.type === 'progress') {
          if (message.total !== raw.length * 16 || !Number.isSafeInteger(message.completed) || message.completed < completed || message.completed > message.total) { fail(); return; }
          completed = message.completed;
          dependencies.onActivity({ status: 'running', completed, total: message.total });
        } else if (message.type === 'done') {
          if (message.output !== raw || !validSummary(message.result, raw)) { fail(); return; }
          finishedSimulation = true;
          worker?.terminate(); worker = null;
          dependencies.onActivity({ status: 'writing', result: message.result });
          void dependencies.commit(message.output, current).then(committed => {
            if (!current()) return;
            if (!committed) { fail(); return; }
            stopped = true; dependencies.onActivity({ status: 'done', result: message.result });
          }).catch(fail);
        } else fail();
      } catch { fail(); }
    };
    worker.onerror = () => { if (!finishedSimulation) fail(); };
    worker.postMessage(raw);
  } catch { fail(); }
  return { cancel };
}
