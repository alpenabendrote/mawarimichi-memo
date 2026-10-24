import { useEffect, useRef, useState } from 'react';
import { loadNotes, noteTitle, STORAGE_KEY, type Note } from './notes';
import { MAX_NOTES, runSearch } from './quantum/simulator';
import { QuantumPanel, type DisplayRun } from './QuantumPanel';

function initialNotebook() {
  // Accessing window.localStorage itself can throw, before getItem is called.
  try { return loadNotes(window.localStorage); }
  catch { return loadNotes({ getItem: () => { throw new Error('Storage unavailable'); } }); }
}

export function App() {
  const [initial] = useState(initialNotebook);
  const [notes, setNotes] = useState<Note[]>(initial.notes);
  const [activeId, setActiveId] = useState<string | null>(initial.notes[0]?.id ?? null);
  const [filter, setFilter] = useState('');
  const [saveError, setSaveError] = useState<string | null>(initial.error);
  const [run, setRun] = useState<DisplayRun | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState<Note | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const active = notes.find(note => note.id === activeId);
  const visibleNotes = notes.filter(note => `${note.title}\n${note.body}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));

  useEffect(() => {
    if (!initial.writable) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
      setSaveError(null);
    } catch { setSaveError('ブラウザに保存できません。内容を失わないよう、JSONを書き出してください。'); }
  }, [notes, initial.writable]);

  function selectNote(id: string) {
    setActiveId(id); setConfirmDelete(false);
  }
  function newNote() {
    if (notes.length >= MAX_NOTES) return;
    const note: Note = { id: crypto.randomUUID(), title: '', body: '', updatedAt: new Date().toISOString() };
    setNotes(previous => [note, ...previous]);
    setActiveId(note.id); setFilter(''); setRun(null); setConfirmDelete(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function editNote(field: 'title' | 'body', value: string) {
    setNotes(previous => previous.map(note => note.id === activeId ? { ...note, [field]: value, updatedAt: new Date().toISOString() } : note));
  }
  function deleteNote() {
    if (!active) return;
    const remaining = notes.filter(note => note.id !== active.id);
    setDeleted(active); setNotes(remaining); setActiveId(remaining[0]?.id ?? null);
    setConfirmDelete(false); setRun(null);
  }
  function undoDelete() {
    if (!deleted || notes.length >= MAX_NOTES) return;
    setNotes(previous => [deleted, ...previous]); setActiveId(deleted.id);
    setDeleted(null); setRun(null); setFilter('');
  }
  function exportNotes() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = `quantum-notes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function search() {
    if (!active) return;
    try {
      setRunError(null);
      const target = notes.findIndex(note => note.id === active.id);
      const start = performance.now();
      const result = runSearch(notes.length, target);
      setRun({ result, notes: notes.map(note => ({ id: note.id, title: noteTitle(note) })), elapsed: performance.now() - start });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : '計算を完了できませんでした。');
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#note-editor">メモ本文へ移動</a>
      <aside className="sidebar" aria-label="メモの一覧">
        <div className="brand"><span className="brand-mark" aria-hidden="true">q<span>n</span></span><div>Quantum Notes<small>A LITTLE UNNECESSARY.</small></div></div>
        <div className="notebook-label"><span>NOTEBOOK</span><span>{String(notes.length).padStart(2, '0')} / 16</span></div>
        <button className="new-note" onClick={newNote} disabled={notes.length >= MAX_NOTES}><span aria-hidden="true">＋</span> 新しいメモ</button>
        <label className="filter-box"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20"><circle cx="8" cy="8" r="5.5"/><path d="m12 12 5 5"/></svg><input aria-label="メモを絞り込む" placeholder="メモを絞り込む" value={filter} onChange={event => setFilter(event.target.value)} /></label>
        <nav className="note-list" aria-label="保存したメモ">
          {visibleNotes.map((note, index) => <button key={note.id} className={`note-card ${note.id === activeId ? 'selected' : ''}`} aria-current={note.id === activeId ? 'page' : undefined} onClick={() => selectNote(note.id)}>
            <span className="note-card-top"><span className="note-index">{String(notes.indexOf(note) + 1).padStart(2, '0')}</span>{index === 0 && !filter && <span className="small-dot" aria-hidden="true" />}</span>
            <strong>{noteTitle(note)}</strong>
            <span className="note-excerpt">{note.body.replace(/\s+/g, ' ').trim() || 'まだ何も書いていません。'}</span>
          </button>)}
          {visibleNotes.length === 0 && <p className="list-empty">{filter ? '該当するメモがありません。' : '最初のメモを書いてみましょう。'}</p>}
        </nav>
        <div className="sidebar-footer"><span><span className="status-dot" />このブラウザに保存</span><button className="text-button" onClick={exportNotes}>JSONを書き出す ↗</button><small>メモ本文はサーバーへ送信されません。</small></div>
      </aside>

      <main className="workspace">
        <header className="workspace-header"><span className="eyebrow">YOUR THOUGHTS, AT REST.</span><span className={`save-status ${saveError ? 'has-error' : ''}`}><span className="status-dot" />{saveError ? '保存を確認してください' : '保存済み'}</span></header>
        {saveError && <div role="alert" className="notice error-notice">{saveError}<button onClick={exportNotes}>JSONを書き出す</button></div>}
        {deleted && <div role="status" className="notice">メモを削除しました。<button onClick={undoDelete} disabled={notes.length >= MAX_NOTES}>元に戻す</button><button onClick={() => setDeleted(null)} aria-label="削除の通知を閉じる">×</button></div>}
        <section className="editor" id="note-editor" aria-label="メモの編集">
          {active ? <>
            <div className="editor-topline"><span className="eyebrow">NOTE {String(notes.indexOf(active) + 1).padStart(2, '0')}</span>
              <div className="delete-controls">{confirmDelete ? <><span>このメモを削除しますか？</span><button className="text-button danger" onClick={deleteNote}>削除する</button><button className="text-button" onClick={() => setConfirmDelete(false)}>キャンセル</button></> : <button className="text-button" onClick={() => setConfirmDelete(true)}>削除</button>}</div>
            </div>
            <input className="note-title" ref={titleRef} aria-label="メモのタイトル" placeholder="無題のメモ" value={active.title} maxLength={120} onChange={event => editNote('title', event.target.value)} />
            <textarea className="note-body" aria-label="メモ本文" placeholder="考えを、ここに置いておく。" value={active.body} maxLength={200000} onChange={event => editNote('body', event.target.value)} spellCheck={false} />
            <div className="editor-bottom"><span>{Array.from(active.body).length.toLocaleString()} 文字</span><span>{new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(active.updatedAt))} 更新</span></div>
          </> : <div className="empty-editor"><span className="empty-symbol" aria-hidden="true">∅</span><h1>まだ、何も決まっていない。</h1><p>新しいメモから、始めましょう。</p><button className="primary-button" onClick={newNote}>最初のメモを書く</button></div>}
        </section>

        <section className="quantum-area" aria-label="量子検索">
          <div className="quantum-heading"><div><div className="eyebrow"><span className="quantum-symbol" aria-hidden="true">⟨ψ⟩</span> A LITTLE QUANTUM</div><h1>わかっている答えを、探しなおす。</h1><p>選択中のメモを、グローバーのアルゴリズムでもう一度。</p></div><button className="primary-button search-button" onClick={search} disabled={!active}><span aria-hidden="true">⌕</span> 量子検索 <span aria-hidden="true">↗</span></button></div>
          {active && <div className="search-context"><span>検索対象</span><strong>{noteTitle(active)}</strong><span className="context-count">全 {notes.length} 件から</span></div>}
          {runError && <p role="alert" className="error-notice">{runError}</p>}
          {run ? <QuantumPanel key={run.result.snapshots.length + '-' + run.elapsed} run={run} onOpenNote={selectNote} /> : <div className="quantum-idle"><div className="idle-sequence"><span>H</span><i /><span>O</span><i /><span>D</span><i /><span>M</span></div><div><strong>回路は、まだ静かです。</strong><p>検索すると、実行したゲートと状態の変化をここに記録します。</p></div></div>}
          <div className="quantum-footnote"><span>STATE-VECTOR SIMULATION</span><details><summary>この検索のこと</summary><p>選択したメモの番号からオラクルを作り、H・X・多重制御Xゲートでグローバーの回路を構成します。複素振幅を計算し、最後に測定確率に従って1件を抽選します。計算はこのブラウザ内で完結します。</p><p>候補数を次の2のべき乗に切り上げるため、空き状態が含まれる場合があります。測定が目標以外になることもあります。絞り込みに関係なく全メモが候補です。1件の場合は量子ビット不要、2件の場合は成功確率50%です。初期版は最大16件です。</p><p>通常のPCで量子回路を再現するシミュレーションです。量子実機は使用せず、検索の高速化も目的としていません。</p></details></div>
        </section>
        <footer className="workspace-footer"><span>小さなメモと、少し無駄な計算。</span><span>QUANTUM NOTES / 0.1</span></footer>
      </main>
    </div>
  );
}
