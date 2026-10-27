import { describe, expect, it, vi } from 'vitest';
import { serialSaveCommitter, startQuantumSave } from './quantumSave';
import { correctText } from './quantum/errorCorrection';

function setup(raw='["new note"]') {
  const worker = { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null as (()=>void)|null, postMessage:vi.fn(),terminate:vi.fn() };
  const write=vi.fn(async(_raw:string)=>{}),commit=serialSaveCommitter(write);
  const onActivity=vi.fn(),onError=vi.fn();
  let latest=true;
  const job=startQuantumSave(raw,{ createWorker:()=>worker as unknown as Worker,isCurrent:()=>latest,commit,onActivity,onError });
  const deliver=(data:unknown)=>worker.onmessage?.({data} as MessageEvent);
  return {raw,worker,write,commit,onActivity,onError,job,deliver,stale:()=>{latest=false;}};
}
const flush=async()=>{for(let n=0;n<10;n++)await Promise.resolve();};

describe('quantum autosave commit boundary',()=>{
  it('does not save first; writes only after measured reconstruction and actual storage completion',async()=>{
    const s=setup();
    expect(s.write).not.toHaveBeenCalled();
    s.deliver({type:'progress',completed:16,total:s.raw.length*16});
    expect(s.write).not.toHaveBeenCalled();
    const result=correctText(s.raw,()=>0.3);
    s.deliver({type:'done',...result});
    expect(s.onActivity.mock.lastCall?.[0].status).toBe('writing');
    await flush();
    expect(s.write).toHaveBeenCalledExactlyOnceWith(s.raw);
    expect(s.onActivity.mock.lastCall?.[0].status).toBe('done');
    expect(s.worker.terminate).toHaveBeenCalled();
  });
  it('accepts a completed worker message only once while storage is still pending',async()=>{
    const s=setup(),result=correctText(s.raw,()=>0.3);
    s.deliver({type:'done',...result});
    s.deliver({type:'done',...result});
    s.worker.onerror?.();
    await flush();
    expect(s.write).toHaveBeenCalledOnce();
    expect(s.onError).not.toHaveBeenCalled();
    expect(s.onActivity.mock.lastCall?.[0].status).toBe('done');
  });
  it('ignores late results after cancellation or newer edits',async()=>{
    for(const action of ['cancel','stale']){
      const s=setup(),output=correctText(s.raw,()=>0.2);
      if(action==='cancel')s.job.cancel();else s.stale();
      s.deliver({type:'done',...output});await flush();
      expect(s.write).not.toHaveBeenCalled();
      expect(s.onError).not.toHaveBeenCalled();
    }
  });
  it('never falls back to ordinary save on wrong output, bad metadata, worker failure or storage failure',async()=>{
    for(const failure of ['output','counts','records','worker','storage']){
      const s=setup(),output=correctText(s.raw,()=>0.3);
      if(failure==='output')output.output='different';
      if(failure==='counts')output.result.syndromeCounts[0]++;
      if(failure==='records')output.result.records[0]^=1;
      if(failure==='storage')s.write.mockRejectedValueOnce(new Error('disk'));
      s.deliver(failure==='worker'?{type:'error'}:{type:'done',...output});await flush();
      if(failure!=='storage')expect(s.write).not.toHaveBeenCalled();
      expect(s.onError).toHaveBeenCalledOnce();
      expect(s.onActivity.mock.lastCall?.[0].status).toBe('error');
    }
  });
  it('serializes in-flight native writes, skips queued obsolete versions, and recovers from failure',async()=>{
    let release!:()=>void;let current='a';
    const write=vi.fn().mockImplementationOnce(()=>new Promise<void>(r=>{release=r;})).mockResolvedValue(undefined);
    const commit=serialSaveCommitter(write);
    const first=commit('a',()=>current==='a');await flush();
    current='b';const second=commit('b',()=>current==='b');
    current='c';const third=commit('c',()=>current==='c');
    expect(write).toHaveBeenCalledTimes(1);
    release();await first;expect(await second).toBe(false);expect(await third).toBe(true);
    expect(write.mock.calls.map(x=>x[0])).toEqual(['a','c']);
    const failing=vi.fn().mockRejectedValueOnce(new Error('disk')).mockResolvedValue(undefined),again=serialSaveCommitter(failing);
    await expect(again('bad',()=>true)).rejects.toThrow();
    await expect(again('good',()=>true)).resolves.toBe(true);
  });
});
