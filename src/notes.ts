import { MAX_NOTES } from './quantum/simulator';

export interface Note { id: string; title: string; body: string; updatedAt: string }
export const STORAGE_KEY = 'quantum-notepad.notes.v1';

export function starterNotes(): Note[] {
  const updatedAt = new Date().toISOString();
  return [
    { id: 'first-note', title: 'まだ決めていないこと', body: '考えを、ここに置いておく。\n\n週末は知らない街を歩きたい。\n本屋に寄って、窓際でコーヒーを飲む。\n予定は、それくらいでいい。', updatedAt },
    { id: 'small-findings', title: '日々の小さな発見', body: '朝の光は、思っていたより青い。\n\n忘れてしまいそうなことを、忘れる前に。', updatedAt },
    { id: 'shopping', title: '買うもの', body: '牛乳\nコーヒー豆\n新しいノート', updatedAt },
    { id: 'quantum-note', title: '少し無駄な検索について', body: '左の一覧からメモを選んで、「量子検索」を押してみる。\n\n選んだ時点で答えはわかっている。\nそれでもグローバーの回路で、もう一度探す。\n\n下の計算パネルでは、実行したゲートと振幅の変化を確認できる。', updatedAt },
  ];
}

export function parseNotes(raw: string): Note[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > MAX_NOTES) throw new Error('保存データの件数が不正です。');
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('保存データが不正です。');
    const note = item as Record<string, unknown>;
    if (typeof note.id !== 'string' || !note.id || ids.has(note.id) || typeof note.title !== 'string' || typeof note.body !== 'string' || typeof note.updatedAt !== 'string' || !Number.isFinite(Date.parse(note.updatedAt))) {
      throw new Error('保存データが不正です。');
    }
    ids.add(note.id);
    return { id: note.id, title: note.title, body: note.body, updatedAt: note.updatedAt };
  });
}

export function loadNotes(storage: Pick<Storage, 'getItem'>): { notes: Note[]; error: string | null; writable: boolean } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return { notes: raw === null ? starterNotes() : parseNotes(raw), error: null, writable: true };
  } catch {
    // Do not silently overwrite an unreadable original with sample data.
    return { notes: [], error: '保存データを読み込めないため、自動保存を停止しています。元のデータは変更していません。', writable: false };
  }
}

export function noteTitle(note: Pick<Note, 'title'>): string { return note.title.trim() || '無題のメモ'; }
