import { describe, expect, it } from 'vitest';
import { applySedimentation, coalesceSediments, prepareSedimentation, runSedimentation, touchNote, undoSedimentation } from './sedimentation';
import { loadNotes, parseNotes, type Note } from './notes';
import { SEDIMENT_IDLE_MS, SEDIMENT_STEP_MS } from './sedimentModel';
import { mergeNotebookBackup } from './notebookBackup';
import { pastePayload } from './quantumPaste';
const now = Date.UTC(2026,9,25), day = SEDIMENT_STEP_MS;
function fixture(count=32, age=40*day): Note[] {
  return Array.from({length:count},(_,i)=>({id:'n'+i,title:'メモ '+i,body:'日本語🪐\n本文 '+i,updatedAt:new Date(now-age).toISOString()}));
}
describe('automatic sedimentation', () => {
  it('requires 32 ordinary notes, seven idle days, and protects selected/recently read notes', () => {
    expect(prepareSedimentation(fixture(31),now,null)).toEqual([]);
    expect(prepareSedimentation(fixture(32,SEDIMENT_IDLE_MS-1),now,null)).toEqual([]);
    const notes=fixture(); notes[1]=touchNote(notes[1],now);
    const jobs=prepareSedimentation(notes,now,'n0');
    expect(jobs).toHaveLength(30);
    expect(jobs.some(j=>j.id==='n0'||j.id==='n1')).toBe(false);
    expect(jobs.every(j=>j.steps<=30 && j.roster.length<=16)).toBe(true);
    expect(prepareSedimentation(notes,0,null)).toEqual([]);
  });
  it('persists conditional phase and measurement time, and does not reprocess the same elapsed day', () => {
    const notes=fixture(32,8*day), jobs=prepareSedimentation(notes,now,'n0');
    const run=runSedimentation(jobs,now,()=>0.999999);
    const next=applySedimentation(notes,run).notes;
    const loaded=parseNotes(JSON.stringify(next));
    expect(loaded).toEqual(next);
    expect(prepareSedimentation(loaded,now,'n0')).toEqual([]);
    const nextDay=prepareSedimentation(loaded,now+day,'n0');
    const n1=nextDay.find(j=>j.id==='n1')!;
    expect(n1.steps).toBe(1); expect(n1.state).toEqual(loaded.find(n=>n.id==='n1')!.sedimentWalk!.state);
    expect(n1.state.some((a,i)=>i%2===1 && Math.abs(a)>1e-9)).toBe(true);
    let resized = nextDay;
    for (let i=0; i<32 && !resized.find(j=>j.id==='n31')?.reset; i++) resized=prepareSedimentation([...loaded,{...notes[0],id:'new-'+i}],now+day,'n0');
    const reset=resized.find(j=>j.id==='n31')!;
    expect(reset.reset).toBe(true); expect(reset.steps).toBe(0); expect(reset.at).toBe(now+day);
  });
  it('merges only absorbed sources, retains full text, stays within 128 notes, and continues below threshold', () => {
    const notes=fixture(128), before=JSON.stringify(notes);
    const job=prepareSedimentation(notes,now,'n0').find(j=>j.id==='n15')!;
    const run=runSedimentation([job],now,()=>0);
    expect(run.outcomes[0].absorbed).toBe(true);
    const merged=applySedimentation(notes,run,()=> 'archive');
    expect(merged.notes).toHaveLength(128);
    expect(merged.archive!.body).toContain(notes[15].body);
    expect(merged.archive!.body).toContain(notes[15].title);
    expect(merged.notes.some(n=>n.id==='n15')).toBe(false);
    expect(JSON.stringify(notes)).toBe(before);
    const many=applySedimentation(fixture(),runSedimentation(prepareSedimentation(fixture(),now,'n0'),now,()=>0),()=> 'a');
    expect(many.notes.length).toBeLessThan(32);
    expect(prepareSedimentation(many.notes,now,many.archive!.id).length).toBeGreaterThan(0);
    const previous=many.archive!;
    const more=applySedimentation(many.notes,runSedimentation(prepareSedimentation(many.notes,now,previous.id),now,()=>0));
    expect(more.archive!.id).toBe(previous.id);
    expect(more.archive!.sediment!.total).toBeGreaterThan(previous.sediment!.total);
  });
  it('does not truncate long archives, supports unlimited archive paste, and coalesces imported archives', () => {
    const notes=fixture(); notes[1].body='長'.repeat(210000);
    const job=prepareSedimentation(notes,now,'n0').find(j=>j.id==='n1')!;
    const merged=applySedimentation(notes,runSedimentation([job],now,()=>0),()=> 'a');
    expect(merged.archive!.body).toContain(notes[1].body);
    expect(pastePayload('追記',{value:'長'.repeat(210000),start:210000,end:210000,maxLength:-1,multiline:true})).toBe('追記');
    const imported={...merged.archive!,id:'b',body:'別の堆積'};
    const combined=mergeNotebookBackup(merged.notes,JSON.stringify([imported]));
    expect(combined.notes.filter(n=>n.sediment)).toHaveLength(1);
    expect(combined.notes.find(n=>n.sediment)!.body).toContain('別の堆積');
    expect(combined.firstAddedId).toBe('a');
    expect(coalesceSediments([merged.archive!,imported])[0].sediment!.total).toBe(2);
  });
  it('undoes a batch without erasing new notes, resets idle age, and refuses to overwrite an edited archive', () => {
    const before=fixture(), merged=applySedimentation(before,runSedimentation(prepareSedimentation(before,now,'n0'),now,()=>0),()=> 'a');
    const undo={before,afterArchive:merged.archive!,sourceIds:merged.sources.map(n=>n.id)};
    const current=[{...before[0],id:'new'},...merged.notes];
    const restored=undoSedimentation(current,undo,now)!;
    expect(restored).toHaveLength(33); expect(restored.some(n=>n.id==='new')).toBe(true);
    expect(restored.find(n=>n.id===undo.sourceIds[0])!.lastUsedAt).toBe(now);
    for(const source of before) expect(restored.find(n=>n.id===source.id)!.body).toBe(source.body);
    expect(undoSedimentation(current.map(n=>n.sediment?{...n,body:n.body+'編集'}:n),undo,now)).toBeNull();
    const readArchive=current.map(n=>n.sediment?touchNote(n,now):n);
    expect(undoSedimentation(readArchive,undo,now)).not.toBeNull();
  });
  it('rejects damaged saved quantum state without overwriting its storage', () => {
    const notes=fixture(32,8*day), merged=applySedimentation(notes,runSedimentation(prepareSedimentation(notes,now,'n0'),now,()=>0.999999)).notes;
    const bad=structuredClone(merged); bad[1].sedimentWalk!.state[0]=123;
    expect(loadNotes({getItem:()=>JSON.stringify(bad)}).writable).toBe(false);
    expect(() => parseNotes(JSON.stringify([{...notes[0],sediment:{total:1,history:'bad'}}]))).toThrow();
  });
});

