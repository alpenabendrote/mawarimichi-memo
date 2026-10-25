import { runSedimentation, type SedimentJob } from '../sedimentation';
const worker = self as unknown as { onmessage: ((e: MessageEvent<{ jobs: SedimentJob[]; at: number }>) => void) | null; postMessage: (value: unknown) => void };
worker.onmessage = e => {
  try { worker.postMessage({ type: 'done', run: runSedimentation(e.data.jobs, e.data.at) }); }
  catch { worker.postMessage({ type: 'error' }); }
};

