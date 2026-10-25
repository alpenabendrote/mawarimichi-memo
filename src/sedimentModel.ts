export const SEDIMENT_START_COUNT = 32;
export const SEDIMENT_IDLE_MS = 7 * 86400000;
export const SEDIMENT_STEP_MS = 86400000;
export const SEDIMENT_GROUP_SIZE = 16;
export const SEDIMENT_CATCHUP_STEPS = 30;
export const SEDIMENT_HISTORY_LIMIT = 16;
export interface SedimentMemory { at: number; roster: string[]; state: number[] }
export interface SedimentHistory { at: number; titles: string[]; count: number }
export interface SedimentArchive { total: number; history: SedimentHistory[] }
export const validSedimentTime = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 8.64e15;

export function parseSedimentMemory(value: unknown, id: string): SedimentMemory {
  const v = value as SedimentMemory;
  if (!v || !validSedimentTime(v.at) || !Array.isArray(v.roster) || v.roster.length < 1 || v.roster.length > SEDIMENT_GROUP_SIZE || v.roster.some(id => typeof id !== 'string' || !id) || !v.roster.includes(id) || new Set(v.roster).size !== v.roster.length) throw new Error('堆積の位置情報が不正です。');
  const length = 4 * 2 ** Math.ceil(Math.log2(v.roster.length + 1));
  if (!Array.isArray(v.state) || v.state.length !== length || v.state.some(a => typeof a !== 'number' || !Number.isFinite(a)) || Math.abs(v.state.reduce((s, a) => s + a * a, 0) - 1) > 1e-8) throw new Error('堆積の量子状態が不正です。');
  // A stored surviving branch has no support on the sink or unused positions.
  if (v.state.slice(4 * v.roster.length).some(a => Math.abs(a) > 1e-10)) throw new Error('堆積の生存状態が不正です。');
  return { at: v.at, roster: [...v.roster], state: [...v.state] };
}
export function parseSedimentArchive(value: unknown): SedimentArchive {
  const v = value as SedimentArchive;
  if (!v || !Number.isSafeInteger(v.total) || v.total < 1 || !Array.isArray(v.history) || v.history.length > SEDIMENT_HISTORY_LIMIT || v.history.some(h => !h || !validSedimentTime(h.at) || !Array.isArray(h.titles) || h.titles.some(t => typeof t !== 'string') || h.titles.length > 128 || h.count !== h.titles.length || h.count < 1)) throw new Error('堆積の履歴が不正です。');
  return { total: v.total, history: v.history.map(h => ({ at: h.at, count: h.count, titles: [...h.titles] })) };
}

