import { useMemo, useState } from 'react';
import type { SaveActivity } from './quantumSave';
import { correctionRecordTrace, decodeCorrectionRecord, type CorrectionTrace } from './quantum/errorCorrection';

function SaveCircuit({ trace, input }: { trace: CorrectionTrace; input: number }) {
  const steps = trace.snapshots.slice(1).map(s => s.step!);
  const width = 100 + steps.length * 50;
  return <div className="circuit-scroll" tabIndex={0} aria-label="保存の位相反転訂正回路。横にスクロールできます。">
    <svg width={width} height="230" role="img" aria-label="データ3量子ビットと検査2量子ビットによる、5量子ビットの位相反転訂正回路。">
      {[0,1,2,3,4].map(q => <g key={q}><text x="0" y={30+q*42}>q{q} |{q===0?input:0}⟩</text><line className="wire" x1="60" x2={width-10} y1={26+q*42} y2={26+q*42}/></g>)}
      {steps.map((step,i)=>{
        const x=90+i*50,y=26+step.target*42;
        return <g key={i} className={'gate '+(step.kind==='I'?'unused':'')}>
          {step.control!==undefined && <><line className="control-wire" x1={x} x2={x} y1={26+step.control*42} y2={y}/><circle cx={x} cy={26+step.control*42} r="3"/></>}
          <rect x={x-13} y={y-11} width="26" height="22"/><text x={x} y={y+4} textAnchor="middle">{step.kind==='CX'?'X':step.kind}</text>
          {step.measured!==undefined && <text x={x} y={y+25} textAnchor="middle">{step.measured}</text>}
        </g>;
      })}
    </svg>
  </div>;
}

export function SavePanel({ activity, open, onOpenChange }: {
  activity: SaveActivity | null; open: boolean; onOpenChange: (open:boolean)=>void;
}) {
  const [record,setRecord]=useState(0),[stage,setStage]=useState<number|null>(null);
  const result=activity && (activity.status==='done'||activity.status==='writing')?activity.result:null;
  const index=result?Math.min(record,Math.max(0,result.records.length-1)):0;
  const value=result?.records[index];
  const bit=value===undefined?null:decodeCorrectionRecord(value);
  const trace=useMemo(()=>value===undefined?null:correctionRecordTrace(value),[value]);
  const step=trace?Math.min(stage??trace.snapshots.length-1,trace.snapshots.length-1):0;
  const snapshot=trace?.snapshots[step];
  const amplitudes=snapshot?Array.from({length:32},(_,i)=>({i,re:snapshot.state[2*i],im:snapshot.state[2*i+1]})).filter(a=>a.re*a.re+a.im*a.im>1e-16):[];
  return <details className="quantum-details save-details" open={open} onToggle={e=>onOpenChange(e.currentTarget.open)}>
    <summary>保存の詳細{activity && <span role="status">{activity.status==='running'?'（訂正中 '+activity.completed.toLocaleString()+' / '+activity.total.toLocaleString()+' bit）':activity.status==='writing'?'（書き込み中）':activity.status==='done'?'（保存完了）':'（未保存）'}</span>}</summary>
    <div className="quantum-content">
      <p className="quantum-caption">文字の入力などで自動実行します。保存データ全体のJSONをUTF-16のビットに分け、3量子ビットの位相反転符号と検査用2量子ビットを計算します。</p>
      {!activity && <p className="quantum-caption">まだ保存の測定記録はありません。</p>}
      {activity?.status==='running' && <p className="quantum-caption">全ビットを符号化・検査・訂正して復元しています。計算が終わり、全文の一致を確認してから保存します。長いメモでは時間がかかります。</p>}
      {activity?.status==='error' && <p role="alert">誤り訂正または書き込みに失敗しました。保存完了にはしていません。JSONを書き出して内容を保管してください。</p>}
      {result && <><p className="quantum-caption" role="status">{result.bitCount.toLocaleString()} bitを計算し、全文一致を確認 ／ 訂正 {result.correctedCount.toLocaleString()} 回 ／ 回路計算 {result.elapsed.toFixed(1)} ms ／ {activity?.status==='done'?'端末への保存完了':'端末へ書き込み中'}</p>
        <div className="state-table-wrap"><table className="state-table"><caption>全ビットの検査測定（q3, q4）</caption><thead><tr><th>測定値</th><th>回数</th><th>訂正操作</th></tr></thead><tbody>{result.syndromeCounts.map((n,i)=><tr key={i}><td><code>{i.toString(2).padStart(2,'0')}</code></td><td>{n.toLocaleString()}</td><td>{['なし','q2にZ','q0にZ','q1にZ'][i]}</td></tr>)}</tbody></table></div>
        <p className="quantum-caption">人工ノイズ：なし {result.noiseCounts[0].toLocaleString()} ／ q0 {result.noiseCounts[1].toLocaleString()} ／ q1 {result.noiseCounts[2].toLocaleString()} ／ q2 {result.noiseCounts[3].toLocaleString()}。各ビットでこの4通りを等確率で選びます。</p>
        <p className="quantum-caption" id="save-record-help">全ビットを計算しています。詳しい記録はメモリを増やし続けないよう、先頭から末尾まで最大256件を等間隔で保持します。選択するのは保存済みデータのビット番号で、文字番号ではありません。表示操作は保存や測定の抽選を行いません。</p>
        {!!result.records.length && <label className="quantum-caption">表示する保存記録 <select aria-label="表示する保存記録" aria-describedby="save-record-help" value={index} onChange={e=>{setRecord(Number(e.target.value));setStage(null);}}>{result.positions.map((position,i)=><option key={position} value={i}>{(position+1).toLocaleString()} bit目</option>)}</select></label>}
      </>}
      {trace && bit && <><SaveCircuit trace={trace} input={bit.input}/><p className="quantum-caption">入力 {bit.input} → 復元 {bit.output} ／ 人工ノイズ：{bit.noise<0?'なし':'q'+bit.noise+'にZ'} ／ 検査 q3q4 = {bit.syndrome.join('')} ／ 訂正：{trace.correction<0?'なし':'q'+trace.correction+'にZ'}</p>
        <div className="measurement-position"><label htmlFor="save-stage">表示する保存の計算段階</label><input id="save-stage" aria-label="表示する保存の計算段階" type="range" min="0" max={trace.snapshots.length-1} value={step} onChange={e=>setStage(Number(e.target.value))}/><span>{step} / {trace.snapshots.length-1}</span></div>
        <p className="quantum-caption">{snapshot?.step?.label??'初期状態'}{snapshot?.step?.measured!==undefined?'：'+snapshot.step.measured:''}。記録された測定分岐から状態を再現しています。</p>
        <div className="state-table-wrap"><table className="state-table"><caption>この段階の非ゼロ振幅（基底は |q4 q3 q2 q1 q0⟩）</caption><thead><tr><th>基底</th><th>実部</th><th>虚部</th><th>確率</th></tr></thead><tbody>{amplitudes.map(a=><tr key={a.i}><td><code>|{a.i.toString(2).padStart(5,'0')}⟩</code></td><td>{a.re.toFixed(6)}</td><td>{a.im.toFixed(6)}</td><td>{((a.re*a.re+a.im*a.im)*100).toFixed(2)}%</td></tr>)}</tbody></table></div>
      </>}
      <p className="quantum-caption">ノイズはシミュレーション内で各組最大1か所のZだけを加えます。検査の測定結果から訂正を選び、復号したq0を実際に測定して文字列を再構成します。保存媒体の故障を直す仕組みではありません。</p>
    </div>
  </details>;
}
