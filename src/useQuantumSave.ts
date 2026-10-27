import { useEffect, useMemo, useRef, useState } from 'react';
import type { Note } from './notes';
import SaveWorker from './quantum/save.worker?worker&inline';
import { serialSaveCommitter, startQuantumSave, type SaveActivity } from './quantumSave';

export function useQuantumSave(notes: Note[], writable: boolean, persist: (notes: Note[]) => Promise<void>) {
  const raw = useMemo(() => JSON.stringify(notes), [notes]);
  const latest = useRef(raw); latest.current = raw;
  const [state, setState] = useState<{ raw: string; activity: SaveActivity } | null>(null);
  const commit = useMemo(() => serialSaveCommitter(async output => { await persist(JSON.parse(output) as Note[]); }), [persist]);
  useEffect(() => {
    if (!writable) return;
    let stopped = false;
    let job: { cancel: () => void } | null = null;
    setState({ raw, activity: { status: 'running', completed: 0, total: raw.length * 16 } });
    // Coalesce typing instead of accumulating obsolete circuit jobs.
    const timer = setTimeout(() => {
      if (stopped || latest.current !== raw) return;
      job = startQuantumSave(raw, {
        createWorker: () => new SaveWorker(),
        isCurrent: () => !stopped && latest.current === raw,
        commit,
        onActivity: activity => setState({ raw, activity }),
        onError: () => {}, // The error activity is the single source of the unsaved state.
      });
    }, 250);
    return () => { stopped = true; clearTimeout(timer); job?.cancel(); };
  }, [raw, writable, commit]);
  // A changed input is pending immediately, including the render before effects run.
  const activity: SaveActivity | null = state?.raw === raw ? state.activity
    : writable ? { status: 'running', completed: 0, total: raw.length * 16 } : null;
  const error = activity?.status === 'error' ? '誤り訂正または保存に失敗しました。JSONを書き出して内容を保存してください。' : null;
  return { activity, error, saving: activity?.status === 'running' || activity?.status === 'writing' };
}
