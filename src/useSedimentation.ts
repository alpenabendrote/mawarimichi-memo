import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Note } from './notes';
import SedimentWorker from './quantum/sedimentation.worker?worker&inline';
import { applySedimentation, prepareSedimentation, undoSedimentation, type SedimentRun, type SedimentUndo } from './sedimentation';

export function useSedimentation(notes: Note[], activeId: string | null, paused: boolean, writable: boolean, setNotes: Dispatch<SetStateAction<Note[]>>) {
  const [tick, setTick] = useState(Date.now);
  const [run, setRun] = useState<SedimentRun | null>(null);
  const [undo, setUndo] = useState<SedimentUndo | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'error'>('idle');
  const latest = useRef(notes); latest.current = notes;
  const processed = useRef<number | null>(null);
  useEffect(() => {
    const check = () => { if (!document.hidden) setTick(Date.now()); };
    const timer = setInterval(check, 60000);
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, []);
  useEffect(() => {
    if (!writable || paused || document.hidden || processed.current === tick) return;
    const jobs = prepareSedimentation(notes, tick, activeId);
    if (!jobs.length) return;
    let stopped = false, worker: Worker | null = null;
    const stop = () => { stopped = true; worker?.terminate(); worker = null; };
    const fail = () => { if (stopped) return; processed.current = tick; stop(); setStatus('error'); };
    try {
      worker = new SedimentWorker(); setStatus('running');
      worker.onerror = fail;
      worker.onmessage = e => {
        if (stopped || latest.current !== notes) return;
        if (e.data.type !== 'done') { fail(); return; }
        try {
          const result = e.data.run as SedimentRun;
          const next = applySedimentation(notes, result);
          processed.current = tick; stop();
          setNotes(previous => previous === notes ? next.notes : previous);
          const record = { ...result, titles: Object.fromEntries(notes.map(n => [n.id, n.title.trim() || '無題のメモ'])) };
          setRun(previous => result.outcomes.some(o => o.last) || !previous ? record : previous); setStatus('idle');
          if (next.sources.length && next.archive) setUndo({ before: notes, afterArchive: next.archive, sourceIds: next.sources.map(n => n.id) });
        } catch { fail(); }
      };
      worker.postMessage({ jobs, at: tick });
    } catch { fail(); }
    return () => { stop(); setStatus(previous => previous === 'running' ? 'idle' : previous); };
  }, [notes, activeId, paused, writable, tick, setNotes]);
  function restore() {
    if (!undo) return;
    const restored = undoSedimentation(latest.current, undo, Date.now());
    if (!restored) return;
    setNotes(restored); setUndo(null);
  }
  return { run, status, undo, canUndo: !!undo && !!undoSedimentation(notes, undo, Date.now()), restore, dismiss: () => setUndo(null) };
}

