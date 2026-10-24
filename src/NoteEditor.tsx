import { useLayoutEffect, useRef, type Ref } from 'react';
import type { Note } from './notes';
import { useQuantumPaste } from './useQuantumPaste';
import { TeleportationPanel } from './TeleportationPanel';

export function NoteEditor({ note, bodyVisible, titleRef, onChange, onHide }: {
  note: Note;
  bodyVisible: boolean;
  titleRef?: Ref<HTMLInputElement>;
  onChange: (field: 'title' | 'body', value: string) => void;
  onHide: () => void;
}) {
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { onPaste, onEdit, activity } = useQuantumPaste(note, bodyVisible, onChange);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.style.height = 'auto';
    body.style.height = `${Math.min(body.scrollHeight, 360)}px`;
  }, [note.id, note.body, bodyVisible]);

  return <section id="note-editor" className="editor" aria-label="メモの編集" onPaste={onPaste}>
    <input ref={titleRef} className="note-title" aria-label="メモのタイトル" placeholder="無題のメモ" value={note.title} maxLength={120} onChange={event => onEdit('title', event.target.value)} />
    {bodyVisible ? <>
      <textarea ref={bodyRef} rows={4} className="note-body" aria-label="メモ本文" value={note.body} placeholder="メモを書く" maxLength={200000} spellCheck={false} onChange={event => onEdit('body', event.target.value)} />
      <div className="editor-footer"><span>{Array.from(note.body).length.toLocaleString()}文字</span><button className="link-button" onClick={onHide}>本文を伏せる</button></div>
    </> : <div className="hidden-body"><p>本文は伏せています。</p><p className="muted">「量子検索」で観測します。</p></div>}
    {activity && <TeleportationPanel activity={activity} />}
  </section>;
}
