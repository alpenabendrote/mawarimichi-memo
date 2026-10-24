import { useEffect, useMemo, useRef, useState } from 'react';
import { loadNotes, noteTitle, STORAGE_KEY, type Note } from './notes';
import { MAX_NOTES, prepareSearch } from './quantum/simulator';
import { QuantumPanel } from './QuantumPanel';
import { NoteEditor } from './NoteEditor';
import { observeNote } from './observation';

function initialNotebook() {
  try { return loadNotes(window.localStorage); }
  catch { return loadNotes({ getItem: () => { throw new Error('Storage unavailable'); } }); }
}

export function App() {
  const [initial] = useState(initialNotebook);
  const [notes, setNotes] = useState<Note[]>(initial.notes);
  const [activeId, setActiveId] = useState<string | null>(initial.notes[0]?.id ?? null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [saveError, setSaveError] = useState<string | null>(initial.error);
  const [message, setMessage] = useState('');
  const [measurementStep, setMeasurementStep] = useState<number | null>(null);
  const [deleted, setDeleted] = useState<{ note: Note; index: number } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const active = notes.find(note => note.id === activeId);
  const target = notes.findIndex(note => note.id === activeId);
  const trace = useMemo(() => target < 0 ? null : prepareSearch(notes.length, target), [notes.length, target]);
  const visibleNotes = notes.filter(note => noteTitle(note).toLocaleLowerCase().includes(filter.toLocaleLowerCase()));

  useEffect(() => {
    if (!initial.writable) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); setSaveError(null); }
    catch { setSaveError('保存できません。JSONを書き出して内容を保存してください。'); }
  }, [notes, initial.writable]);

  function selectNote(id: string) {
    setActiveId(id); setOpenedId(null); setMeasurementStep(null); setMessage('');
  }
  function newNote() {
    if (notes.length >= MAX_NOTES) return;
    const note: Note = { id: crypto.randomUUID(), title: '', body: '', updatedAt: new Date().toISOString() };
    setNotes(previous => [note, ...previous]);
    setActiveId(note.id); setOpenedId(note.id); setFilter(''); setMeasurementStep(null); setMessage('');
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function editNote(field: 'title' | 'body', value: string) {
    if (field === 'body' && openedId !== activeId) return;
    setNotes(previous => previous.map(note => note.id === activeId ? { ...note, [field]: value, updatedAt: new Date().toISOString() } : note));
  }
  function deleteNote() {
    if (!active) return;
    const index = notes.indexOf(active);
    const remaining = notes.filter(note => note.id !== active.id);
    setDeleted({ note: active, index }); setNotes(remaining);
    setActiveId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
    setOpenedId(null); setMeasurementStep(null); setMessage('');
  }
  function undoDelete() {
    if (!deleted || notes.length >= MAX_NOTES) return;
    const restored = [...notes]; restored.splice(deleted.index, 0, deleted.note);
    setNotes(restored); selectNote(deleted.note.id); setDeleted(null); setFilter('');
  }
  function exportNotes() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `notes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function observe() {
    if (!active) return;
    try {
      const start = performance.now();
      const result = observeNote(notes.length, target, measurementStep);
      const found = notes[result.measured];
      if (found) {
        setActiveId(found.id); setOpenedId(found.id); setFilter('');
        setMessage(result.measured === target
          ? `観測しました。${(performance.now() - start).toFixed(2)} ms`
          : `「${noteTitle(active)}」ではなく「${noteTitle(found)}」を観測しました。`);
      } else {
        setOpenedId(null); setMessage('空き状態を観測しました。本文は伏せたままです。');
      }
      setMeasurementStep(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : '観測できませんでした。'); }
  }

  return <div className="notepad">
    <a className="skip-link" href="#note-editor">本文へ移動</a>
    <aside className="sidebar" aria-label="メモ一覧">
      <header className="list-header"><h1>メモ帳</h1><button onClick={newNote} disabled={notes.length >= MAX_NOTES}>新規</button></header>
      <input className="filter" aria-label="タイトルを絞り込む" placeholder="タイトルを絞り込む" value={filter} onChange={event => setFilter(event.target.value)} />
      <nav aria-label="保存したメモ" className="note-list">{visibleNotes.map(note => <button key={note.id} className={note.id === activeId ? 'selected' : ''} aria-current={note.id === activeId ? 'page' : undefined} onClick={() => selectNote(note.id)}>{noteTitle(note)}</button>)}{visibleNotes.length === 0 && <p className="muted">{filter ? '該当するメモはありません。' : 'メモはありません。'}</p>}</nav>
      <footer className="list-footer"><span>{notes.length} / {MAX_NOTES}</span><button className="link-button" onClick={exportNotes}>JSONを書き出す</button></footer>
    </aside>
    <main className="main">
      {saveError && <p role="alert" className="notice error">{saveError}</p>}
      {deleted && <div role="status" className="notice">削除しました。<button className="link-button" onClick={undoDelete} disabled={notes.length >= MAX_NOTES}>元に戻す</button><button className="dismiss" aria-label="削除の通知を閉じる" onClick={() => setDeleted(null)}>×</button></div>}
      {active && trace ? <>
        <header className="note-toolbar"><span className="muted">{saveError ? '未保存' : '自動保存'}</span><div><button onClick={deleteNote}>削除</button><button className="observe-button" onClick={observe}>量子検索</button></div></header>
        <NoteEditor note={active} bodyVisible={openedId === active.id} titleRef={titleRef} onChange={editNote} onHide={() => { setOpenedId(null); setMessage(''); }} />
        <p className="observation-message" role="status">{message}</p>
        <QuantumPanel trace={trace} notes={notes.map(note => ({ id: note.id, title: noteTitle(note) }))} step={measurementStep} onStep={setMeasurementStep} />
      </> : <div className="empty"><p>新規メモを作成してください。</p><button onClick={newNote}>新規</button></div>}
    </main>
  </div>;
}
