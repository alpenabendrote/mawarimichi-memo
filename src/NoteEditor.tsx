import type { Ref } from 'react';
import type { Note } from './notes';

export function NoteEditor({ note, bodyVisible, titleRef, onChange, onHide }: {
  note: Note;
  bodyVisible: boolean;
  titleRef?: Ref<HTMLInputElement>;
  onChange: (field: 'title' | 'body', value: string) => void;
  onHide: () => void;
}) {
  return <section id="note-editor" className="editor" aria-label="メモの編集">
    <input ref={titleRef} className="note-title" aria-label="メモのタイトル" placeholder="無題のメモ" value={note.title} maxLength={120} onChange={event => onChange('title', event.target.value)} />
    {bodyVisible ? <>
      <textarea className="note-body" aria-label="メモ本文" value={note.body} placeholder="メモを書く" maxLength={200000} spellCheck={false} onChange={event => onChange('body', event.target.value)} />
      <div className="editor-footer"><span>{Array.from(note.body).length.toLocaleString()}文字</span><button className="link-button" onClick={onHide}>本文を伏せる</button></div>
    </> : <div className="hidden-body"><p>本文は伏せています。</p><p className="muted">「量子検索」で観測します。</p></div>}
  </section>;
}
