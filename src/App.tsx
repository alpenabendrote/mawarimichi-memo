import { useEffect, useMemo, useRef, useState } from 'react';
import { loadNotes, noteTitle, type Note } from './notes';
import { MAX_NOTES, prepareSearch } from './quantum/simulator';
import { QuantumPanel } from './QuantumPanel';
import { NoteEditor } from './NoteEditor';
import { observeNote } from './observation';
import { addDuplicate, duplicatePayload, receivedDuplicate } from './duplicateNote';
import { startTextTransfer, type TransferActivity } from './quantum/transfer';
import TeleportWorker from './quantum/teleport.worker?worker&inline';
import { TeleportationPanel } from './TeleportationPanel';
import { SimilarNotes } from './SimilarNotes';
import { HelpDialog } from './HelpDialog';
import { runWalk } from './quantum/walk';
import { QuantumWalkPanel, type WalkRecord } from './QuantumWalkPanel';
import { initializeZenoNotes, orderZenoNotes, readNoteZeno, type ZenoReadRecord } from './zenoNotes';
import { newZenoMemory } from './quantum/zeno';
import { ZenoPanel } from './ZenoPanel';
import { saveNotebook, type LoadedNotebook } from './notebookStorage';
import { exportNotebook, mergeNotebookBackup } from './notebookBackup';
import { coalesceSediments, touchNote } from './sedimentation';
import { useSedimentation } from './useSedimentation';
import { SedimentPanel } from './SedimentPanel';
import { CoolingPanel } from './CoolingPanel';
import { coolingPayload, removeCooledNote, startCoolingDeletion, type CoolingActivity } from './coolingDeletion';
import CoolingWorker from './quantum/cooling.worker?worker&inline';

function initialNotebook(provided?: LoadedNotebook) {
  if (provided) return { ...provided, notes: initializeZenoNotes(coalesceSediments(provided.notes), Date.now()) };
  try {
    const result = loadNotes(window.localStorage);
    return { ...result, notes: initializeZenoNotes(coalesceSediments(result.notes), Date.now()) };
  }
  catch { return loadNotes({ getItem: () => { throw new Error('Storage unavailable'); } }); }
}

export function App({ notebook, persist = saveNotebook }: { notebook?: LoadedNotebook; persist?: (notes: Note[]) => Promise<void> } = {}) {
  const [initial] = useState(() => initialNotebook(notebook));
  const [notes, setNotes] = useState<Note[]>(initial.notes);
  const [activeId, setActiveId] = useState<string | null>(initial.notes[0]?.id ?? null);
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [saveError, setSaveError] = useState<string | null>(initial.error);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [listTime, setListTime] = useState(Date.now);
  const [zenoRecord, setZenoRecord] = useState<ZenoReadRecord | null>(null);
  const [zenoDetailsOpen, setZenoDetailsOpen] = useState(false);
  const [measurementStep, setMeasurementStep] = useState<number | null>(null);
  const [deleted, setDeleted] = useState<{ note: Note; index: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [view, setView] = useState<'note' | 'calculation'>('note');
  const [transferTarget, setTransferTarget] = useState<HTMLDivElement | null>(null);
  const [walkRecord, setWalkRecord] = useState<WalkRecord | null>(null);
  const [walkDetailsOpen, setWalkDetailsOpen] = useState(false);
  const [duplication, setDuplication] = useState<TransferActivity | null>(null);
  const [duplicateDetailsOpen, setDuplicateDetailsOpen] = useState(false);
  const duplicateJob = useRef<{ cancel: () => void } | null>(null);
  const coolingJob = useRef<{ cancel: () => void } | null>(null);
  const [cooling, setCooling] = useState<CoolingActivity | null>(null);
  const [coolingDetailsOpen, setCoolingDetailsOpen] = useState(false);
  const [sedimentDetailsOpen, setSedimentDetailsOpen] = useState(false);
  const currentNotebook = useRef({ notes, activeId });
  currentNotebook.current = { notes, activeId };
  const titleRef = useRef<HTMLInputElement>(null);
  const display = useMemo(() => orderZenoNotes(notes, listTime), [notes, listTime]);
  const orderedNotes = useMemo(() => display.map(entry => entry.note), [display]);
  const active = notes.find(note => note.id === activeId);
  const sedimentation = useSedimentation(notes, activeId, importing || cooling?.status === 'running' || duplication?.status === 'running' || (!!active?.sediment && openedId === activeId), initial.writable, setNotes);
  const target = orderedNotes.findIndex(note => note.id === activeId);
  const trace = useMemo(() => target < 0 ? null : prepareSearch(notes.length, target), [notes.length, target]);
  const visibleNotes = display.filter(({ note }) => noteTitle(note).toLocaleLowerCase().includes(filter.toLocaleLowerCase()));

  useEffect(() => () => { duplicateJob.current?.cancel(); coolingJob.current?.cancel(); }, []);

  useEffect(() => {
    if (!initial.writable) return;
    let current = true; setSaving(true);
    persist(notes).then(() => { if (current) { setSaveError(null); setSaving(false); } }).catch(() => {
      if (current) { setSaveError('保存できません。JSONを書き出して内容を保存してください。'); setSaving(false); }
    });
    return () => { current = false; };
  }, [notes, initial.writable, persist]);

  function cancelCooling() {
    if (!coolingJob.current) return;
    coolingJob.current.cancel(); coolingJob.current = null;
    setCooling(previous => previous ? { title: previous.title, status: 'cancelled' } : null);
  }
  function clearDuplicate() {
    cancelCooling();
    duplicateJob.current?.cancel(); duplicateJob.current = null; setDuplication(null);
  }
  function selectNote(id: string) {
    clearDuplicate();
    setNotes(previous => previous.map(note => note.id === id ? touchNote(note, Date.now()) : note));
    setActiveId(id); setOpenedId(null); setMeasurementStep(null); setMessage('');
    setView('note');
    setListTime(Date.now());
  }
  function newNote() {
    if (notes.length >= MAX_NOTES) return;
    clearDuplicate();
    const now = Date.now();
    const note: Note = { id: crypto.randomUUID(), title: '', body: '', updatedAt: new Date(now).toISOString(), zeno: newZenoMemory(now) };
    setNotes(previous => [note, ...previous]);
    setActiveId(note.id); setOpenedId(note.id); setFilter(''); setMeasurementStep(null); setMessage('');
    setView('note');
    setListTime(now);
    requestAnimationFrame(() => titleRef.current?.focus());
  }
  function editNote(field: 'title' | 'body', value: string) {
    if (field === 'body' && openedId !== activeId) return;
    cancelCooling();
    if (duplicateJob.current) {
      duplicateJob.current.cancel(); duplicateJob.current = null;
      setDuplication({ status: 'cancelled', source: 'タイトル・本文' });
    }
    const now = Date.now();
    setNotes(previous => previous.map(note => note.id === activeId ? { ...touchNote(note, now), [field]: value, updatedAt: new Date(now).toISOString(), zeno: newZenoMemory(now) } : note));
    setListTime(now);
  }
  function deleteNote() {
    if (!active || coolingJob.current || !initial.writable) return;
    const source = { ...active }, payload = coolingPayload(source), title = noteTitle(source);
    clearDuplicate(); setMessage('');
    setCooling({ title, status: 'running', completed: 0, total: payload.length * 16 });
    coolingJob.current = startCoolingDeletion(payload, {
      createWorker: () => new CoolingWorker(),
      commit: () => {
        const latest = currentNotebook.current;
        if (latest.activeId !== source.id) return false;
        const removed = removeCooledNote(latest.notes, source);
        if (!removed) return false;
        const now = Date.now(), ordered = orderZenoNotes(latest.notes, now).map(entry => entry.note);
        const sourceIndex = ordered.findIndex(note => note.id === source.id);
        const remaining = ordered.filter(note => note.id !== source.id);
        setDeleted(removed.deleted); setNotes(removed.notes);
        setActiveId(remaining[Math.min(sourceIndex, remaining.length - 1)]?.id ?? null);
        setOpenedId(null); setMeasurementStep(null); setListTime(now);
        return true;
      },
      onProgress: completed => setCooling({ title, status: 'running', completed, total: payload.length * 16 }),
      onDone: result => { coolingJob.current = null; setCooling({ title, status: 'done', result }); },
      onCancelled: () => { coolingJob.current = null; setCooling({ title, status: 'cancelled' }); },
      onError: () => { coolingJob.current = null; setCooling({ title, status: 'error' }); setMessage('緩和を確認できなかったため、メモは削除していません。'); },
    });
  }
  function undoDelete() {
    if (!deleted || notes.length >= MAX_NOTES) return;
    const restored = [...notes]; restored.splice(deleted.index, 0, deleted.note);
    setNotes(restored); selectNote(deleted.note.id); setDeleted(null); setFilter('');
  }
  async function exportNotes() {
    setExporting(true);
    try { await exportNotebook(notes); }
    catch (error) {
      if (!(error instanceof Error && /cancel/i.test(error.message))) setMessage('JSONを書き出せませんでした。もう一度お試しください。');
    } finally { setExporting(false); }
  }
  async function importNotes(file: File) {
    if (!initial.writable || importing) return;
    setImporting(true);
    try {
      const raw = await file.text();
      const result = mergeNotebookBackup(currentNotebook.current.notes, raw);
      if (result.added) {
        clearDuplicate();
        const now = Date.now();
        setNotes(initializeZenoNotes(result.notes, now)); setListTime(now);
        setActiveId(result.firstAddedId ?? result.notes[0]?.id ?? null); setOpenedId(null);
        setFilter(''); setMeasurementStep(null); setView('note');
      }
      setMessage(result.added ? result.added + '件のメモを読み込みました。' : '同じメモは追加しませんでした。');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'JSONを読み込めませんでした。'); } finally { setImporting(false); }
  }
  function observe() {
    if (!active) return;
    clearDuplicate();
    try {
      const start = performance.now();
      const result = observeNote(notes.length, target, measurementStep);
      const found = orderedNotes[result.measured];
      if (found) {
        recordReading(found.id, 'search');
        setActiveId(found.id); setOpenedId(found.id); setFilter('');
        setMessage(result.measured === target
          ? `観測しました。${(performance.now() - start).toFixed(2)} ms`
          : `「${noteTitle(active)}」ではなく「${noteTitle(found)}」を観測しました。`);
      } else {
        setListTime(Date.now());
        setOpenedId(null); setMessage('空き状態を観測しました。本文は伏せたままです。');
      }
      setMeasurementStep(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : '観測できませんでした。'); }
  }

  function recordReading(id: string, reason: ZenoReadRecord['reason']) {
    const result = readNoteZeno(notes, id, reason, Date.now());
    setNotes(result.notes.map(note => note.id === id ? touchNote(note, result.record.run.at) : note)); setZenoRecord(result.record); setListTime(result.record.run.at);
  }

  function duplicateNote() {
    if (!active || notes.length >= MAX_NOTES || duplication?.status === 'running') return;
    const source = { ...active };
    const payload = duplicatePayload(source);
    clearDuplicate(); setMessage('');
    setDuplication({ status: 'running', source: 'タイトル・本文', completed: 0, total: payload.length * 16 });
    duplicateJob.current = startTextTransfer(payload, {
      createWorker: () => new TeleportWorker(),
      receive: output => {
        const latest = currentNotebook.current;
        const original = latest.notes.find(note => note.id === source.id);
        if (latest.activeId !== source.id || !original || original.title !== source.title || original.body !== source.body) return false;
        const now = Date.now();
        const copy = { ...receivedDuplicate(output, crypto.randomUUID(), new Date(now).toISOString()), zeno: newZenoMemory(now) };
        const next = addDuplicate(latest.notes, source.id, copy);
        if (!next) return false;
        setNotes(next); setActiveId(copy.id); setOpenedId(copy.id);
        setFilter(''); setMeasurementStep(null);
        setListTime(now);
        return true;
      },
      onProgress: completed => setDuplication({ status: 'running', source: 'タイトル・本文', completed, total: payload.length * 16 }),
      onDone: result => { duplicateJob.current = null; setDuplication({ status: 'done', source: 'タイトル・本文', result }); },
      onCancelled: () => { duplicateJob.current = null; setDuplication({ status: 'cancelled', source: 'タイトル・本文' }); },
      onError: () => { duplicateJob.current = null; setDuplication({ status: 'error', source: 'タイトル・本文' }); },
    });
  }

  function openNextNote() {
    if (!active || notes.length < 2) return;
    clearDuplicate();
    try {
      const run = runWalk(notes.length, target);
      const found = orderedNotes[run.measured];
      recordReading(found.id, 'walk');
      setWalkRecord({ run, notes: orderedNotes.map(note => ({ id: note.id, title: noteTitle(note) })) });
      setActiveId(found.id); setOpenedId(found.id); setFilter(''); setMeasurementStep(null);
      setMessage(`おまかせで「${noteTitle(found)}」を開きました。`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'おまかせを実行できませんでした。'); }
  }

  return <div className="notepad">
    <a className="skip-link" href="#note-editor">本文へ移動</a>
    <aside className="sidebar" aria-label="メモ一覧">
      <header className="list-header"><h1>遠回りメモ</h1><button onClick={newNote} disabled={notes.length >= MAX_NOTES}>新規</button></header>
      <input className="filter" aria-label="タイトルを絞り込む" placeholder="タイトルを絞り込む" value={filter} onChange={event => setFilter(event.target.value)} />
      <nav aria-label="保存したメモ" className="note-list">{visibleNotes.map(({ note, dormant, normalProbability }) => <button key={note.id} className={note.id === activeId ? 'selected' : ''} aria-label={noteTitle(note)} title={`通常の確率 ${(normalProbability * 100).toFixed(2)}%${dormant ? '・休眠寄り' : ''}（一覧の更新時点）`} aria-current={note.id === activeId ? 'page' : undefined} onClick={() => selectNote(note.id)}><span className="note-list-title">{noteTitle(note)}</span>{note.sediment && <small className="dormant-label">堆積</small>}{dormant && <small className="dormant-label">休眠寄り</small>}</button>)}{visibleNotes.length === 0 && <p className="muted">{filter ? '該当するメモはありません。' : 'メモはありません。'}</p>}</nav>
      <footer className="list-footer"><span>{notes.length} / {MAX_NOTES}</span><button className="link-button" onClick={() => setHelpOpen(true)}>ヘルプ</button><button className="link-button" onClick={exportNotes} disabled={exporting}>JSONを書き出す</button><button className="link-button" disabled={!initial.writable || importing} onClick={() => importRef.current?.click()}>JSONを読み込む</button></footer>
    </aside>
    <input ref={importRef} type="file" accept="application/json,.json" disabled={importing || !initial.writable} hidden aria-label="読み込むJSONファイル" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void importNotes(file); }} />
    <main className="main">
      {saveError && <p role="alert" className="notice error">{saveError}</p>}
      {sedimentation.undo && <div role="status" className="notice">{sedimentation.undo.sourceIds.length}件のメモが堆積しました。<button className="link-button" onClick={sedimentation.restore} disabled={!sedimentation.canUndo} title={sedimentation.canUndo ? undefined : "堆積への追記・編集、IDの重複、または件数上限のため戻せません。"}>取り込みを戻す</button><button className="dismiss" aria-label="堆積の通知を閉じる" onClick={sedimentation.dismiss}>×</button></div>}
      {deleted && <div role="status" className="notice">削除しました。<button className="link-button" onClick={undoDelete} disabled={notes.length >= MAX_NOTES}>元に戻す</button><button className="dismiss" aria-label="削除の通知を閉じる" onClick={() => setDeleted(null)}>×</button></div>}
      <>
        <header className="note-toolbar"><span className="muted">{saveError ? '未保存' : saving ? '保存中…' : '自動保存'}</span><div>{active && trace && <><button onClick={deleteNote} disabled={cooling?.status === 'running' || !initial.writable} aria-busy={cooling?.status === 'running'}>{cooling?.status === 'running' ? '消去中…' : '削除'}</button><button onClick={duplicateNote} disabled={notes.length >= MAX_NOTES || duplication?.status === 'running'} aria-busy={duplication?.status === 'running'} title={notes.length >= MAX_NOTES ? `メモは最大${MAX_NOTES}件です。` : undefined}>複製</button><button onClick={openNextNote} disabled={notes.length < 2} title={notes.length < 2 ? '別のメモが必要です。' : undefined}>おまかせ</button><button className="observe-button" onClick={observe}>量子検索</button></>}</div></header>
        <div className="view-switch" role="group" aria-label="表示する欄">
          <button aria-pressed={view === 'note'} aria-controls="note-pane" onClick={() => setView('note')}>メモ</button>
          <button aria-pressed={view === 'calculation'} aria-controls="calculation-pane" onClick={() => setView('calculation')}>回路・計算</button>
        </div>
        <div className={`workspace view-${view}`}>
          <section id="note-pane" className="note-pane" aria-label="メモ欄" tabIndex={0}>
            {active && trace ? <NoteEditor note={active} bodyVisible={openedId === active.id} titleRef={titleRef} transferTarget={transferTarget} onChange={editNote} onHide={() => { clearDuplicate(); setOpenedId(null); setMessage(''); }} /> : <div className="empty"><p>新規メモを作成してください。</p><button onClick={newNote}>新規</button></div>}
          </section>
          <section id="calculation-pane" className="calculation-pane" aria-label="回路・計算欄" tabIndex={0}>
            <SedimentPanel notes={notes} run={sedimentation.run} status={sedimentation.status} open={sedimentDetailsOpen} onOpenChange={setSedimentDetailsOpen} />
            <CoolingPanel activity={cooling} open={coolingDetailsOpen} onOpenChange={setCoolingDetailsOpen} />
            {active && trace && <><QuantumPanel trace={trace} notes={orderedNotes.map(note => ({ id: note.id, title: noteTitle(note) }))} step={measurementStep} onStep={setMeasurementStep} />
            <ZenoPanel note={active} at={listTime} record={zenoRecord} open={zenoDetailsOpen} onOpenChange={setZenoDetailsOpen} />
            <QuantumWalkPanel record={walkRecord} open={walkDetailsOpen} onOpenChange={setWalkDetailsOpen} />
            <TeleportationPanel activity={duplication} operation="duplicate" open={duplicateDetailsOpen} onOpenChange={setDuplicateDetailsOpen} />
            <div ref={setTransferTarget} />
            <SimilarNotes notes={orderedNotes} activeId={active.id} onSelect={selectNote} /></>}
          </section>
        </div>
      </>
      <p className="observation-message" role="status">{message}</p>
    </main>
    {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
  </div>;
}
