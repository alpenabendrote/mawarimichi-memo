import { noteTitle, type Note } from './notes';
import { MAX_NOTES } from './quantum/simulator';

/** The complete title and body, including empty strings, are transmitted as one frame. */
export function duplicatePayload(note: Pick<Note, 'title' | 'body'>): string {
  return JSON.stringify([note.title, note.body]);
}

/** Build the new record from received text, never from the original note. */
export function receivedDuplicate(output: string, id: string, updatedAt: string): Note {
  const decoded: unknown = JSON.parse(output);
  if (!Array.isArray(decoded) || decoded.length !== 2 || decoded.some(value => typeof value !== 'string')) throw new Error('複製したデータを読み込めませんでした。');
  const [title, body] = decoded as [string, string];
  let prefix = noteTitle({ title }).slice(0, 116);
  // Keep the 120 UTF-16 unit title limit without splitting an emoji in half.
  if (/[\uD800-\uDBFF]$/.test(prefix)) prefix = prefix.slice(0, -1);
  return { id, title: `${prefix}のコピー`, body, updatedAt };
}

export function addDuplicate(notes: Note[], sourceId: string, duplicate: Note): Note[] | null {
  const index = notes.findIndex(note => note.id === sourceId);
  if (index < 0 || notes.length >= MAX_NOTES || notes.some(note => note.id === duplicate.id)) return null;
  return [...notes.slice(0, index + 1), duplicate, ...notes.slice(index + 1)];
}
