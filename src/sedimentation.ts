import { noteTitle, type Note } from './notes';
import { newZenoMemory } from './quantum/zeno';
import { initialSinkState, sinkWalkStep, type SinkStep } from './quantum/sinkWalk';
import { secureRandom, type StateVector } from './quantum/simulator';
import { SEDIMENT_START_COUNT, SEDIMENT_IDLE_MS, SEDIMENT_STEP_MS, SEDIMENT_GROUP_SIZE, SEDIMENT_CATCHUP_STEPS, SEDIMENT_HISTORY_LIMIT, type SedimentMemory } from './sedimentModel';

export interface SedimentJob { id: string; roster: string[]; at: number; steps: number; state: number[]; reset: boolean }
export interface SedimentOutcome { id: string; memory: SedimentMemory; absorbed: boolean; attempts: number; last: SinkStep | null; reset: boolean }
export interface SedimentRun { titles?: Record<string, string>; at: number; outcomes: SedimentOutcome[]; elapsed: number }
export function touchNote(note: Note, at: number): Note {
  const { sedimentWalk: _, ...rest } = note;
  return { ...rest, lastUsedAt: at };
}
export function prepareSedimentation(notes: Note[], at: number, protectedId: string | null): SedimentJob[] {
  const normal = notes.filter(n => !n.sediment);
  if (!Number.isSafeInteger(at) || at < 0 || (normal.length < SEDIMENT_START_COUNT && !notes.some(n => n.sediment))) return [];
  const jobs: SedimentJob[] = [];
  // Stable buckets keep adding one new note from resetting every old trajectory.
  const buckets: Note[][] = Array.from({ length: 8 }, () => []);
  for (const note of normal) {
    let hash = 2166136261;
    for (let i = 0; i < note.id.length; i++) hash = Math.imul(hash ^ note.id.charCodeAt(i), 16777619);
    buckets[(hash >>> 0) % 8].push(note);
  }
  const groups = buckets.flatMap(bucket => {
    bucket.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    return Array.from({ length: Math.ceil(bucket.length / SEDIMENT_GROUP_SIZE) }, (_, i) => bucket.slice(i * SEDIMENT_GROUP_SIZE, (i + 1) * SEDIMENT_GROUP_SIZE));
  });
  for (const group of groups) {
    const roster = group.map(n => n.id);

    for (let source = 0; source < group.length; source++) {
      const note = group[source], used = Math.max(Date.parse(note.updatedAt), note.lastUsedAt ?? 0);
      if (note.id === protectedId || at - used < SEDIMENT_IDLE_MS) continue;
      const memory = note.sedimentWalk;
      const matches = memory && JSON.stringify(memory.roster) === JSON.stringify(roster);
      const reset = !!memory && !matches;
      const from = reset ? Math.max(at, memory.at) : memory?.at ?? used + SEDIMENT_IDLE_MS - SEDIMENT_STEP_MS;
      const steps = Math.min(SEDIMENT_CATCHUP_STEPS, Math.max(0, Math.floor((at - from) / SEDIMENT_STEP_MS)));
      if (!steps && !reset) continue;
      jobs.push({ id: note.id, roster, at: from, steps, state: matches ? [...memory.state] : Array.from(initialSinkState(group.length + 1, source)), reset });
    }
  }
  return jobs;
}
export function runSedimentation(jobs: SedimentJob[], at: number, random = secureRandom): SedimentRun {
  const start = performance.now();
  const outcomes = jobs.map(job => {
    let state: StateVector = new Float64Array(job.state), last: SinkStep | null = null, attempts = 0;
    for (; attempts < job.steps;) {
      last = sinkWalkStep(state, job.roster.length + 1, random); attempts++;
      state = last.snapshots.at(-1)!.state;
      if (last.absorbed) break;
    }
    return { id: job.id, memory: { at: job.at + attempts * SEDIMENT_STEP_MS, roster: [...job.roster], state: Array.from(state) }, absorbed: last?.absorbed ?? false, attempts, last, reset: job.reset };
  });
  return { at, outcomes, elapsed: performance.now() - start };
}
export function applySedimentation(notes: Note[], run: SedimentRun, newId: () => string = () => crypto.randomUUID()) {
  const absorbed = run.outcomes.filter(o => o.absorbed).sort((a, b) => a.memory.at - b.memory.at);
  const ids = new Set(absorbed.map(o => o.id));
  const sources = absorbed.map(o => notes.find(n => n.id === o.id)!);
  if (sources.some(n => !n || n.sediment) || ids.size !== sources.length) throw new Error('堆積の元メモが変わりました。');
  const memories = new Map(run.outcomes.filter(o => !o.absorbed).map(o => [o.id, o.memory]));
  let next = notes.filter(n => !ids.has(n.id)).map(n => memories.has(n.id) ? { ...n, sedimentWalk: memories.get(n.id)! } : n);
  const previousArchive = notes.find(n => n.sediment) ?? null;
  if (!sources.length) return { notes: next, sources, archive: previousArchive };
  const id = previousArchive?.id ?? newId();
  if (!previousArchive && (!id || notes.some(n => n.id === id))) throw new Error('堆積用のIDを作成できません。');
  const addition = sources.map(n => '【' + noteTitle(n) + '】\n' + n.updatedAt + '\n' + n.body).join('\n\n---\n\n');
  const body = previousArchive ? previousArchive.body + '\n\n---\n\n' + addition : addition;
  const archive: Note = {
    ...(previousArchive ?? { id, title: '堆積' }), body, updatedAt: new Date(run.at).toISOString(), zeno: newZenoMemory(run.at),
    sediment: { total: (previousArchive?.sediment?.total ?? 0) + sources.length, history: [...(previousArchive?.sediment?.history ?? []), { at: run.at, count: sources.length, titles: sources.map(noteTitle) }].slice(-SEDIMENT_HISTORY_LIMIT) },
  };
  next = previousArchive ? next.map(n => n.id === id ? archive : n) : [...next, archive];
  return { notes: next, sources, archive };
}
/** Imported archives are joined without truncating any body; exactly one remains the automatic destination. */
export function coalesceSediments(notes: Note[]): Note[] {
  const archives = notes.filter(n => n.sediment);
  if (archives.length < 2) return notes;
  const first = archives[0];
  const archive: Note = { ...first, body: archives.map(n => n.body).join('\n\n---\n\n'), updatedAt: archives.map(n => n.updatedAt).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1)!,
    sediment: { total: archives.reduce((s, n) => s + n.sediment!.total, 0), history: archives.flatMap(n => n.sediment!.history).sort((a, b) => a.at - b.at).slice(-SEDIMENT_HISTORY_LIMIT) } };
  return notes.flatMap(n => n.id === first.id ? [archive] : n.sediment ? [] : [n]);
}
export interface SedimentUndo { before: Note[]; afterArchive: Note; sourceIds: string[] }
export function undoSedimentation(current: Note[], undo: SedimentUndo, at: number): Note[] | null {
  const archive = current.find(n => n.id === undo.afterArchive.id);
  if (!archive || (archive.title !== undo.afterArchive.title || archive.body !== undo.afterArchive.body || archive.updatedAt !== undo.afterArchive.updatedAt || JSON.stringify(archive.sediment) !== JSON.stringify(undo.afterArchive.sediment)) || undo.sourceIds.some(id => current.some(n => n.id === id))) return null;
  const oldArchive = undo.before.find(n => n.id === archive.id);
  const extra = undo.sourceIds.length - (oldArchive ? 0 : 1);
  if (current.length + extra > 128) return null;
  const withoutArchive = current.filter(n => n.id !== archive.id);
  const restored = new Map(undo.before.filter(n => undo.sourceIds.includes(n.id)).map(n => [n.id, touchNote(n, at)]));
  const result = [...withoutArchive];
  for (let i = 0; i < undo.before.length; i++) {
    const note = undo.before[i];
    if (restored.has(note.id)) result.splice(Math.min(i, result.length), 0, restored.get(note.id)!);
    if (oldArchive && note.id === oldArchive.id) result.splice(Math.min(i, result.length), 0, oldArchive);
  }
  return result;
}

