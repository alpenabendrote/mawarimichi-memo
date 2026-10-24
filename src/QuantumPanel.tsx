import { useEffect, useRef, useState } from 'react';
import { basisLabel, describeGate, probabilities, stageNames, type PreparedSearch } from './quantum/simulator';

function Circuit({ trace, step }: { trace: PreparedSearch; step: number }) {
  const markerRef = useRef<SVGGElement | null>(null);
  useEffect(() => { markerRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' }); }, [step]);
  if (trace.qubits === 0) return <p className="muted">メモが1件のため、量子ビットは不要です。</p>;
  const gates = trace.gates.slice(0, -1);
  const left = 48, cell = 34, row = 35, top = 40;
  const width = left + (gates.length + 1) * cell;
  const markerX = left + (step - 0.5) * cell;
  return <div className="circuit-scroll" tabIndex={0} aria-label="量子回路。横にスクロールできます。">
    <svg width={width} height={top + trace.qubits * row + 5} role="img" aria-label={`${trace.qubits}量子ビットの回路。縦線Mの位置で測定します。`}>
      {Array.from({ length: trace.qubits }, (_, q) => <g key={q}><text x="4" y={top + q * row + 4}>q{q}</text><line className="wire" x1="28" x2={width - 8} y1={top + q * row} y2={top + q * row} /></g>)}
      {gates.map((gate, i) => {
        const x = left + i * cell;
        const y = top + gate.target! * row;
        return <g key={i} className={`gate ${i < step ? '' : 'unused'}`}><title>{i + 1}. {stageNames[gate.stage]}：{describeGate(gate)}</title>
          {gate.controls.length > 0 && <line className="control-wire" x1={x} x2={x} y1={top + Math.min(...gate.controls, gate.target!) * row} y2={top + Math.max(...gate.controls, gate.target!) * row} />}
          {gate.controls.map(q => <circle key={q} cx={x} cy={top + q * row} r="3" />)}
          <rect x={x - 11} y={y - 11} width="22" height="22" /><text x={x} y={y + 4} textAnchor="middle">{gate.kind === 'MCX' ? 'X' : gate.kind}</text>
        </g>;
      })}
      <g ref={markerRef} className="measurement-marker"><line x1={markerX} x2={markerX} y1="22" y2={top + (trace.qubits - 1) * row + 15} /><text x={markerX} y="13" textAnchor="middle">M</text></g>
    </svg>
  </div>;
}

export function QuantumPanel({ trace, notes, step, onStep }: {
  trace: PreparedSearch;
  notes: { id: string; title: string }[];
  step: number | null;
  onStep: (step: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const last = trace.snapshots.length - 1;
  const position = step ?? last;
  const snapshot = trace.snapshots[position];
  const distribution = probabilities(snapshot.state);
  return <details className="quantum-details" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>回路と状態</summary>
    <div className="quantum-content">
      <div className="measurement-position"><label htmlFor="measurement-position">測定位置</label><input id="measurement-position" aria-label="測定位置" type="range" min="0" max={last} value={position} onChange={event => onStep(Number(event.target.value))} /><span>{position} / {last}</span><button onClick={() => onStep(null)} disabled={step === null}>最後</button></div>
      <p className="quantum-caption">次の観測：{notes[trace.target].title} ／ 目標の確率 {(distribution[trace.target] * 100).toFixed(2)}%</p>
      <p className="quantum-caption">{describeGate(snapshot.gate)}の後{position === last ? '（最後）' : ''}</p>
      {open && <Circuit trace={trace} step={position} />}
      <div className="state-table-wrap"><table className="state-table"><caption>測定前の状態</caption><thead><tr><th>状態</th><th>メモ</th><th>振幅</th><th>確率</th></tr></thead><tbody>{distribution.map((p, index) => <tr key={index} className={index === trace.target ? 'target' : undefined}><td><code>|{basisLabel(index, trace.qubits)}⟩</code></td><td>{notes[index]?.title ?? '空き状態'}{index === trace.target ? '（目標）' : ''}</td><td><code>{formatAmplitude(snapshot.state[2 * index], snapshot.state[2 * index + 1])}</code></td><td>{(p * 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
      <p className="quantum-caption">測定位置は次の「量子検索」に適用します。途中状態を見るだけでは測定しません。q0は最下位ビットです。</p>
    </div>
  </details>;
}

function formatAmplitude(real: number, imaginary: number): string {
  const re = Math.abs(real) < 5e-7 ? 0 : real;
  const im = Math.abs(imaginary) < 5e-7 ? 0 : imaginary;
  return im === 0 ? re.toFixed(5) : `${re.toFixed(5)} ${im >= 0 ? '+' : '−'} ${Math.abs(im).toFixed(5)}i`;
}
