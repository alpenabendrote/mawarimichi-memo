import { useState } from 'react';
import type { Note } from './notes';
import type { SedimentRun } from './sedimentation';
import { walkPositionProbabilities } from './quantum/walk';

const amplitude = (r: number, i: number) => Math.abs(i) < 1e-9 ? r.toFixed(5) : r.toFixed(5) + (i < 0 ? ' − ' : ' + ') + Math.abs(i).toFixed(5) + 'i';
export function SedimentPanel({ notes, run, status, open, onOpenChange }: {
  notes: Note[]; run: SedimentRun | null; status: 'idle' | 'running' | 'error'; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const [selection, setSelection] = useState<{ run: SedimentRun; index: number; stage: number } | null>(null);
  const fallback = Math.max(0, run?.outcomes.findIndex(o => o.absorbed) ?? 0);
  const index = run && selection?.run === run ? selection.index : fallback;
  const outcome = run?.outcomes[index], step = outcome?.last;
  const stage = run && selection?.run === run ? selection.stage : step ? 4 : 0;
  const snapshot = step?.snapshots[stage], roster = outcome?.memory.roster ?? [];
  const distribution = snapshot ? walkPositionProbabilities(snapshot.state, roster.length + 1) : [];
  const archive = notes.find(n => n.sediment);
  const title = (id: string) => run?.titles?.[id] ?? notes.find(n => n.id === id)?.title ?? id;
  return <details className="quantum-details sediment-details" open={open} onToggle={e => onOpenChange(e.currentTarget.open)}>
    <summary>堆積の詳細</summary>
    <div className="quantum-content">
      <p className="quantum-caption sediment-status" role="status">{status === 'running' ? '経過時間分の吸収ウォークを計算中…' : status === 'error' ? '堆積を計算できませんでした。メモは変更していません。'
        : run ? '直近の計算：' + new Date(run.at).toLocaleString() + ' ／ ' + run.outcomes.reduce((s, o) => s + o.attempts, 0) + '回測定 ／ ' + run.outcomes.filter(o => o.absorbed).length + '件吸収 ／ ' + run.elapsed.toFixed(2) + ' ms'
        : '通常メモが32件以上になると開始します。7日間使っていないメモが対象です。'}</p>
      <p className="quantum-caption">1日分を1歩としてH → S+ → H → S−を計算し、吸収先にいるかだけを測定します。非吸収なら、残りの位置の重ね合わせと位相を保存します。選択中のメモと「堆積」自体は取り込みません。</p>
      <p className="quantum-caption">1組は通常メモ最大16件と吸収先1か所です。各メモを出発点とする独立したウォークを使います。「堆積」ができた後は、32件未満になっても続きます。読む・選ぶ・編集する操作で、そのメモの7日間を数え直します。</p>
      {run && <div className="bit-position"><label htmlFor="sediment-record">表示するメモの記録</label><select id="sediment-record" value={index} onChange={e => setSelection({ run, index: Number(e.target.value), stage: run.outcomes[Number(e.target.value)].last ? 4 : 0 })}>
        {run.outcomes.map((o, i) => <option key={o.id} value={i}>{title(o.id)}（{o.absorbed ? '吸収' : o.attempts ? '非吸収' : '再準備'}）</option>)}
      </select></div>}
      {outcome && <p className="quantum-caption">このメモの測定：{outcome.attempts}回 ／ 最後のモデル時刻：{new Date(outcome.memory.at).toLocaleString()}{outcome.reset ? ' ／ メモの構成変更により回路を再準備' : ''}</p>}
      {step && snapshot && <>
        <p className="quantum-caption">最後の実測：{step.absorbed ? '吸収' : '非吸収'} ／ 測定直前の吸収確率 {(step.probability * 100).toFixed(4)}% ／ 測定用乱数 {step.sample.toFixed(8)}</p>
        <div className="measurement-position"><label htmlFor="sediment-stage">表示する計算段階</label><input id="sediment-stage" type="range" min={0} max={5} value={stage} onChange={e => setSelection({ run: run!, index, stage: Number(e.target.value) })}/><span>{stage} / 5</span></div>
        <p className="quantum-caption">{snapshot.label}</p>
        <div className="circuit-scroll" tabIndex={0} aria-label="堆積の吸収ウォーク回路">
          <svg width="470" height="120" role="img" aria-label="コインにH、条件付き右移動S+、H、条件付き左移動S−、吸収先だけの射影測定">
            <text x="0" y="34">コイン</text><text x="0" y="94">位置</text>
            <line className="wire" x1="68" x2="460" y1="30" y2="30"/><line className="wire" x1="68" x2="460" y1="90" y2="90"/>
            {['H','S+','H','S−','M吸収'].map((label,i) => {
              const x=100+i*78, y=i%2===0 && i<4?30:90;
              return <g key={i} className={'gate '+(stage>=i+1?'':'unused')}>
                {i===1 || i===3 ? <><line className="control-wire" x1={x} x2={x} y1="30" y2="90"/><circle className={i===3?'open-control':undefined} cx={x} cy="30" r="3"/></>:null}
                <rect x={x-24} y={y-13} width="48" height="26"/><text x={x} y={y+4} textAnchor="middle">{label}</text>
              </g>;
            })}
          </svg>
        </div>
        <div className="state-table-wrap"><table className="state-table"><caption>選んだ段階の振幅と位置確率</caption><thead><tr><th>位置</th><th>メモ</th><th>コイン0の振幅</th><th>コイン1の振幅</th><th>確率</th></tr></thead><tbody>
          {distribution.map((p,x) => <tr key={x} className={x===roster.length?'target':undefined}><td>{x}</td><td>{x===roster.length?'吸収先（堆積）':title(roster[x])}</td><td><code>{amplitude(snapshot.state[4*x],snapshot.state[4*x+1])}</code></td><td><code>{amplitude(snapshot.state[4*x+2],snapshot.state[4*x+3])}</code></td><td>{(p*100).toFixed(4)}%</td></tr>)}
        </tbody></table></div>
      </>}
      {archive?.sediment && <>
        <p className="quantum-caption">「{archive.title}」へ累計{archive.sediment.total}件取り込み。直近16回までの履歴：</p>
        <ul className="quantum-caption">{[...archive.sediment.history].reverse().map((h,i) => <li key={i}>{new Date(h.at).toLocaleString()} ／ {h.count}件：{h.titles.join('、')}</li>)}</ul>
      </>}
      <p className="quantum-caption">本文はタイトル・更新日時と区切りを付けて連結します。アプリを閉じている間の経過は次の起動時に反映し、1回の確認では最大30日分を計算します。メモの構成が変わると現在時刻で回路を再準備し、すでに処理した時間を再利用しません。</p>
      <p className="quantum-caption">記録を見る操作では再測定しません。条件付き量子状態・処理済み時刻・取り込み履歴はメモと一緒に保存します。この詳しいゲート記録は再起動で消えます。操作中は1分ごとと画面に戻った時に確認し、常駐処理は使いません。</p>
    </div>
  </details>;
}

