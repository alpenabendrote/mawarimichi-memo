import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { correctText } from './quantum/errorCorrection';
import { SavePanel } from './SavePanel';

describe('save diagnostics',()=>{
  it('shows actual results and phases while keeping note text out of diagnostics',()=>{
    const payload='秘密の本文です',result=correctText(payload,()=>0.6).result;
    const random=vi.spyOn(crypto,'getRandomValues');
    const html=renderToStaticMarkup(<SavePanel activity={{status:'done',result}} open onOpenChange={()=>{}}/>);
    expect(html).toContain('5量子ビット');
    expect(html).toContain('全文一致を確認');
    expect(html).toContain('端末への保存完了');
    expect(html).toContain('q3q4 = 11');
    expect(html).toContain('q1にZ');
    expect(html).toContain('表示する保存の計算段階');
    expect(html).not.toContain(payload);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
  it('keeps completion distinct from simulation progress and storage errors',()=>{
    const waiting=renderToStaticMarkup(<SavePanel activity={{status:'running',completed:0,total:32}} open onOpenChange={()=>{}}/>);
    expect(waiting).not.toContain('端末への保存完了');
    const result=correctText('a',()=>0.1).result;
    const writing=renderToStaticMarkup(<SavePanel activity={{status:'writing',result}} open onOpenChange={()=>{}}/>);
    expect(writing).toContain('端末へ書き込み中');
    expect(writing).not.toContain('端末への保存完了');
    const failed=renderToStaticMarkup(<SavePanel activity={{status:'error'}} open onOpenChange={()=>{}}/>);
    expect(failed).toContain('未保存');
    expect(failed).not.toContain('全文一致を確認');
  });
});
