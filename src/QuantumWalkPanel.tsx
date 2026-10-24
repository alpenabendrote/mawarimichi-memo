import { useEffect, useRef, useState } from 'react';
import { basisLabel } from './quantum/simulator';
import { walkPositionProbabilities, type WalkRun, type WalkSnapshot } from './quantum/walk';

export interface WalkRecord { run: WalkRun; notes: { id: string; title: string }[] }

function WalkCircuit({ run, position }: { run: WalkRun; position: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const left = 116, cell = 38, gates = run.snapshots.slice(1), width = left + (gates.length + 1) * cell;
  const marker = left + (position - 0.5) * cell;
  useEffect(() => {
    const container = scrollRef.current;
    if (container) container.scrollTo({ left: Math.max(0, marker - container.clientWidth / 2), behavior: 'instant' });
  }, [marker]);
  return <div ref={scrollRef} className="circuit-scroll" tabIndex={0} aria-label="量子ウォークの回路。横にスクロールできます。">
    <svg width={width} height="146" role="img" aria-label={`${run.positionQubits + 1}量子ビット。コインと位置の2行にまとめた${run.steps}歩の回路。H、S+、H、S−を繰り返し、候補を正規化して位置を1回測定。`}>
      <text x="0" y="44">q0 |+i⟩</text><text x="0" y="104">位置 {run.positionQubits}q</text>
      {[40, 100].map(y => <line key={y} className="wire" x1="96" x2={width - 8} y1={y} y2={y} />)}
      {gates.map((gate, index) => {
        const x = left + index * cell, y = gate.operation === 'H' ? 40 : 100;
        const shift = gate.operation === 'S+' || gate.operation === 'S−';
        return <g key={index} className={`gate ${index < position ? '' : 'unused'}`}><title>{gate.label}</title>
          {shift && <><line className="control-wire" x1={x} x2={x} y1="40" y2="100" /><circle className={gate.operation === 'S−' ? 'open-control' : undefined} cx={x} cy="40" r="3" /></>}
          <rect x={x - 15} y={y - 12} width="30" height="24" /><text x={x} y={y + 4} textAnchor="middle">{gate.operation === 'exclude' ? '除外' : gate.operation}</text>
        </g>;
      })}
      <g className="measurement-marker"><line x1={marker} x2={marker} y1="24" y2="120" /><text x={marker} y="14" textAnchor="middle">表示</text></g>
    </svg>
  </div>;
}

function amplitude(re: number, im: number) {
  const real = Math.abs(re) < 5e-6 ? 0 : re, imaginary = Math.abs(im) < 5e-6 ? 0 : im;
  return imaginary === 0 ? real.toFixed(4) : `${real.toFixed(4)} ${imaginary >= 0 ? '+' : '−'} ${Math.abs(imaginary).toFixed(4)}i`;
}

export function QuantumWalkPanel({ record, open, onOpenChange }: { record: WalkRecord | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [view, setView] = useState<{ run: WalkRun; position: number } | null>(null);
  const run = record?.run;
  const position = run ? (view?.run === run ? view.position : run.measurementStep) : 0;
  const snapshot: WalkSnapshot | null = run?.snapshots[position] ?? null;
  const distribution = snapshot && run ? walkPositionProbabilities(snapshot.state, run.count) : [];
  return <details className="quantum-details walk-details" open={open} onToggle={event => onOpenChange(event.currentTarget.open)}>
    <summary>おまかせの詳細{run && <span>（測定済み）</span>}</summary>
    <div className="quantum-content">
      {!run || !record || !snapshot ? <p className="quantum-caption">「おまかせ」で、一覧順に並べた輪の上を量子ウォークし、次のメモを1件開きます。計算と測定の記録をここに表示します。メモが2件以上あれば使えます。設定は不要です。</p> : <>
        <p className="quantum-caption" role="status">実際の測定：{record.notes[run.source].title} → {record.notes[run.measured].title} ／ {run.steps}歩 ／ {run.elapsed.toFixed(2)} ms</p>
        <p className="quantum-caption">測定に使った確率：{(run.selectionProbabilities[run.measured] * 100).toFixed(2)}% ／ 位置 |{basisLabel(run.measured, run.positionQubits)}⟩ ／ 測定回数：1回</p>
        <div className="measurement-position"><label htmlFor="walk-record-position">表示する計算段階</label><input id="walk-record-position" aria-label="表示する計算段階" aria-describedby="walk-record-help" type="range" min="0" max={run.snapshots.length - 1} value={position} onChange={event => setView({ run, position: Number(event.target.value) })} /><span>{position} / {run.snapshots.length - 1}</span><button onClick={() => setView({ run, position: run.measurementStep })} disabled={position === run.measurementStep}>測定直前</button></div>
        <p className="quantum-caption">{snapshot.label}</p>
        {open && <WalkCircuit run={run} position={position} />}
        <div className="state-table-wrap"><table className="state-table"><caption>表示中の状態：{snapshot.operation === 'M' ? '測定後' : snapshot.operation === 'exclude' ? '候補の調整後・測定直前' : 'ウォークの計算過程'}</caption><thead><tr><th>位置</th><th>実行時のメモ</th><th>コイン0の振幅</th><th>コイン1の振幅</th><th>位置の確率</th></tr></thead><tbody>{record.notes.map((note, index) => <tr key={note.id} className={index === run.measured ? 'target' : undefined}><td><code>|{basisLabel(index, run.positionQubits)}⟩</code></td><td>{note.title}{index === run.source ? '（出発）' : index === run.measured ? '（測定）' : ''}</td><td><code>{amplitude(snapshot.state[4 * index], snapshot.state[4 * index + 1])}</code></td><td><code>{amplitude(snapshot.state[4 * index + 2], snapshot.state[4 * index + 3])}</code></td><td>{(distribution[index] * 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
        <p className="quantum-caption">1歩はH → S+ → H → S−です。S+はコイン1の成分を右へ、S−はコイン0の成分を左へ移動します。条件に合わない成分は留まります。黒丸は制御1、白丸は制御0です。</p>
        <p className="quantum-caption">歩いている間は測定せず、複素振幅を保持して干渉させます。{run.positionQubits}量子ビットの位置と1量子ビットのコインを使い、歩数はmax(3, メモ数)です。位置は実行時の一覧順で、先頭と末尾がつながっています。本文の類似度は使いません。</p>
        <p className="quantum-caption">ウォーク後に出発メモへ戻る確率は{(run.walkProbabilities[run.source] * 100).toFixed(2)}%でした。「次のメモ」を開くため、最後に出発メモを候補から除き、残り{(run.eligibleProbability * 100).toFixed(2)}%を正規化して位置を1回測定しました。これはウォークの時間発展とは別の選択ルールです。結果を見て引き直す処理は行いません。</p>
        <p className="quantum-caption" id="walk-record-help">このスライダーは実行済みの記録を見るためのものです。動かしても再計算・再測定・メモの移動はしません。薄いゲートは表示中の段階より後の操作です。最後のMでは、測定された位置だけに状態が収縮します。詳細の開閉状態は次の「おまかせ」でも保ちます。</p>
      </>}
    </div>
  </details>;
}
