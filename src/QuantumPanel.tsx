import { useEffect, useRef, useState } from 'react';
import { basisLabel, describeGate, probabilities, stageNames, type Gate, type SearchRun, type Stage } from './quantum/simulator';

export interface DisplayRun {
  result: SearchRun;
  notes: { id: string; title: string }[];
  elapsed: number;
}

function Circuit({ result, cursor, onCursor }: { result: SearchRun; cursor: number; onCursor: (cursor: number) => void }) {
  const activeRef = useRef<SVGGElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
  }, [cursor]);
  if (result.qubits === 0) return <p className="circuit-note">候補が1件なので、量子ビットを使う操作はありません。</p>;
  const cell = 38, left = 45, top = 39, row = 43;
  const width = left + result.gates.length * cell + 22;
  return <div className="circuit-scroll" tabIndex={0} aria-label="実行した量子回路。横にスクロールできます。">
    <svg width={width} height={top + result.qubits * row + 10} role="img" aria-label={`${result.qubits}量子ビットの回路。q0は最下位ビット。ゲートは左から順に実行。`}>
      {Array.from({ length: result.qubits }, (_, q) => <g key={q}><text x="3" y={top + q * row + 4} className="wire-label">q{q}</text><line x1="29" x2={width - 8} y1={top + q * row} y2={top + q * row} className="wire" /></g>)}
      {result.gates.map((gate, i) => {
        const x = left + i * cell;
        const y = gate.target === null ? top : top + gate.target * row;
        const current = cursor === i + 1;
        const complete = i < cursor;
        return <g key={i} ref={current ? activeRef : null} className={`circuit-gate ${current ? 'current' : ''} ${complete ? 'complete' : ''}`} onClick={() => onCursor(i + 1)} role="button" tabIndex={0} aria-label={`操作${i + 1}：${describeGate(gate)}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onCursor(i + 1); } }}>
          <title>{i + 1}. {stageNames[gate.stage]} / {describeGate(gate)}</title>
          <rect x={x - 16} y={8} width={32} height={result.qubits * row + 10} className="gate-hitbox" />
          {gate.kind === 'M' ? Array.from({ length: result.qubits }, (_, q) => <g key={q}><rect x={x - 12} y={top + q * row - 12} width="24" height="24" rx="4" /><text x={x} y={top + q * row + 4} textAnchor="middle">M</text></g>) : <>
            {gate.controls.length > 0 && <line x1={x} x2={x} y1={top + Math.min(...gate.controls, gate.target!) * row} y2={top + Math.max(...gate.controls, gate.target!) * row} className="control-wire" />}
            {gate.controls.map(q => <circle key={q} cx={x} cy={top + q * row} r="3.5" className="control-dot" />)}
            <rect x={x - 12} y={y - 12} width="24" height="24" rx="4" /><text x={x} y={y + 4} textAnchor="middle">{gate.kind === 'MCX' ? 'X' : gate.kind}</text>
          </>}
        </g>;
      })}
    </svg>
  </div>;
}

export function QuantumPanel({ run, onOpenNote }: { run: DisplayRun; onOpenNote: (id: string) => void }) {
  const { result } = run;
  const [cursor, setCursor] = useState(result.gates.length);
  const [playing, setPlaying] = useState(false);
  const [circuitOpen, setCircuitOpen] = useState(false);
  const snapshot = result.snapshots[cursor];
  const currentGate = snapshot.gate;
  const currentProbabilities = probabilities(snapshot.state);
  const found = result.measured === result.target;
  const measuredNote = run.notes[result.measured];
  const targetNote = run.notes[result.target];
  const selectedProbability = result.probabilities[result.target];
  const stage: Stage | null = currentGate?.stage ?? null;
  const unitaryCount = result.gates.length - 1;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setCursor(previous => Math.min(previous + 1, result.gates.length)), 180);
    return () => window.clearInterval(timer);
  }, [playing, result.gates.length]);
  useEffect(() => { if (cursor === result.gates.length) setPlaying(false); }, [cursor, result.gates.length]);

  function move(next: number) { setPlaying(false); setCursor(next); }
  function replay() {
    if (playing) { setPlaying(false); return; }
    if (cursor === result.gates.length) setCursor(0);
    setPlaying(true);
  }
  function jumpStage(next: Stage) {
    const index = result.gates.findIndex(gate => gate.stage === next);
    if (index >= 0) move(index + 1);
  }
  return <div className="quantum-panel">
    <div className="result-row" role="status"><div className={`result-icon ${found ? '' : 'miss'}`} aria-hidden="true">{found ? '✓' : '↗'}</div><div className="result-copy"><strong>{found ? '指定されたメモを発見しました。' : measuredNote ? '今回は、別のメモが出ました。' : '今回は、空き状態を測定しました。'}</strong><span>{measuredNote?.title ?? 'メモのない基底状態'} <code>|{basisLabel(result.measured, result.qubits)}⟩</code></span></div>{measuredNote && <button className="text-button result-open" onClick={() => onOpenNote(measuredNote.id)}>開く ↗</button>}<span className="elapsed">計算完了 · {run.elapsed.toFixed(2)} ms</span></div>
    <div className="run-metrics"><span><b>{result.qubits}</b> 量子ビット</span><span><b>{result.dimension}</b> 基底状態</span><span><b>{result.iterations}</b> 回の増幅</span><span><b>{unitaryCount}</b> ゲート</span><span className="success-chance">目標の測定確率 <b>{(selectedProbability * 100).toFixed(1)}%</b></span></div>
    <div className="replay-box">
      <div className="replay-header"><span className="eyebrow">GATE RECORD</span><span className="replay-caption">{playing ? '計算済みの操作履歴を再生中' : '計算済みの操作履歴'}</span><span className="step-counter">{cursor} / {result.gates.length}</span></div>
      <div className="stage-track">{(['prepare', 'oracle', 'diffusion', 'measure'] as Stage[]).map((item, index) => <button key={item} className={stage === item ? 'active' : ''} onClick={() => jumpStage(item)} disabled={!result.gates.some(gate => gate.stage === item)}><span>{String(index + 1).padStart(2, '0')}</span>{stageNames[item]}</button>)}</div>
      <div className="operation-line"><span className="operation-symbol" aria-hidden="true">{currentGate ? currentGate.kind === 'MCX' ? 'CX' : currentGate.kind : '0'}</span><div><strong>{describeGate(currentGate)}</strong><small>{currentGate ? currentGate.kind === 'M' ? '測定で状態が確定しました。' : `${stageNames[currentGate.stage]} · 複素振幅を更新した後の状態` : '全振幅を初期化した状態'}</small></div><span className="normalization">Σ |α|² = {currentProbabilities.reduce((a, b) => a + b, 0).toFixed(6)}</span></div>
      <div className="playback-controls"><button className="icon-button" aria-label="最初の状態" onClick={() => move(0)} disabled={cursor === 0}>|‹</button><button className="icon-button" aria-label="前の操作" onClick={() => move(cursor - 1)} disabled={cursor === 0}>‹</button><button className="play-button" onClick={replay}>{playing ? 'Ⅱ 一時停止' : '▷ 操作を再生'}</button><button className="icon-button" aria-label="次の操作" onClick={() => move(cursor + 1)} disabled={cursor === result.gates.length}>›</button><input type="range" min="0" max={result.gates.length} value={cursor} onChange={event => move(Number(event.target.value))} aria-label="ゲート操作の位置" /><span className="playback-tag">REPLAY</span></div>
      <details className="circuit-details" open={circuitOpen} onToggle={event => setCircuitOpen(event.currentTarget.open)}><summary>実際の回路を{circuitOpen ? '閉じる' : '見る'}<span>H / X / MCX / M</span></summary>{circuitOpen && <><Circuit result={result} cursor={cursor} onCursor={move} /><p className="circuit-note">q0 が最下位ビット。MCX は多重制御Xゲートです。ゲートを選ぶと、その直後の状態を表示します。</p></>}</details>
      <details className="state-details"><summary>この操作の後の状態を見る<span>{cursor === result.gates.length ? '測定後' : '測定前'}</span></summary><p className="state-explanation">各行は、その基底状態に対応するメモです。振幅の符号・位相も計算しています。確率は振幅の絶対値の2乗です。</p><div className="state-table-wrap"><table className="state-table"><thead><tr><th>状態 / メモ</th><th>振幅 α</th><th>確率 |α|²</th></tr></thead><tbody>{currentProbabilities.map((p, index) => <tr key={index} className={index === result.target ? 'target-state' : ''}><td><code>|{basisLabel(index, result.qubits)}⟩</code><span>{run.notes[index]?.title ?? '空き状態'}</span>{index === result.target && <small>目標</small>}</td><td><code>{formatAmplitude(snapshot.state[2 * index], snapshot.state[2 * index + 1])}</code></td><td><div className="probability-cell"><span className="probability-track"><i style={{ width: `${Math.min(100, p * 100)}%` }} /></span><span>{(p * 100).toFixed(2)}%</span></div></td></tr>)}</tbody></table></div></details>
    </div>
    <p className="run-caption">対象：{targetNote.title}。測定確率は測定直前の値です。再生は計算結果を変更せず、最後の測定も再抽選しません。</p>
  </div>;
}

function formatAmplitude(real: number, imaginary: number): string {
  const re = Math.abs(real) < 5e-7 ? 0 : real;
  const im = Math.abs(imaginary) < 5e-7 ? 0 : imaginary;
  return im === 0 ? re.toFixed(5) : `${re.toFixed(5)} ${im >= 0 ? '+' : '−'} ${Math.abs(im).toFixed(5)}i`;
}
