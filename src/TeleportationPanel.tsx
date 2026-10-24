import { useState } from 'react';
import { decodeRecord } from './quantum/teleportation';
import type { CopyActivity } from './useQuantumCopy';

function TeleportCircuit({ record }: { record: number }) {
  const { input, m0, m1, output } = decodeRecord(record);
  const box = (x: number, y: number, label: string, active = true) => <g className={`gate ${active ? '' : 'unused'}`}><rect x={x - 14} y={y - 12} width="28" height="24" /><text x={x} y={y + 4} textAnchor="middle">{label}</text></g>;
  const cx = (x: number, control: number, target: number) => <g className="gate"><line className="control-wire" x1={x} x2={x} y1={control} y2={target} /><circle cx={x} cy={control} r="3" />{box(x, target, 'X')}</g>;
  return <div className="circuit-scroll" tabIndex={0} aria-label="コピーの量子テレポーテーション回路。横にスクロールできます。">
    <svg width="680" height="190" role="img" aria-label={`3量子ビットの回路。入力${input}、m0=${m0}、m1=${m1}、受信${output}。m1でX、m0でZを補正。`}>
      {[40, 95, 150].map((y, q) => <g key={q}><text x="0" y={y + 4}>q{q} |{q === 0 ? input : 0}⟩</text><line className="wire" x1="60" x2={q === 2 ? '660' : '380'} y1={y} y2={y} /></g>)}
      {box(100, 95, 'H')}{cx(170, 95, 150)}{cx(240, 40, 95)}{box(310, 40, 'H')}
      {box(380, 40, 'M')}{box(380, 95, 'M')}
      <path className="classical-wire" d="M394 95 H450 V136 M394 40 H520 V136" />
      <text x="405" y="31">m0={m0}</text><text x="405" y="86">m1={m1}</text>
      {box(450, 150, 'X', Boolean(m1))}{box(520, 150, 'Z', Boolean(m0))}{box(590, 150, 'M')}
      <text x="615" y="154">{output}</text><text x="425" y="185">m1でX</text><text x="495" y="185">m0でZ</text>
    </svg>
  </div>;
}

export function TeleportationPanel({ activity }: { activity: CopyActivity }) {
  const [bit, setBit] = useState(0);
  const result = activity.status === 'done' ? activity.result : null;
  const index = result ? Math.min(bit, result.bitCount - 1) : 0;
  const measured = result ? decodeRecord(result.records[index]) : null;
  return <details className="quantum-details copy-details">
    <summary>コピーの詳細<span role="status">{activity.status === 'running' ? `（コピー中 ${activity.completed.toLocaleString()} / ${activity.total.toLocaleString()} bit）` : activity.status === 'done' ? '（コピー完了）' : '（コピー失敗）'}</span></summary>
    <div className="quantum-content">
      {activity.status === 'running' && <p className="quantum-caption">{activity.source}の選択範囲を転送しています。{activity.completed.toLocaleString()} / {activity.total.toLocaleString()} bit</p>}
      {activity.status === 'error' && <p role="alert">{activity.reason === 'clipboard' ? 'クリップボードに書き込めませんでした。ブラウザの書き込み許可を確認してから、もう一度コピーしてください。' : '転送をシミュレーションできなかったため、コピーを中止しました。'}</p>}
      {result && measured && <>
        <p className="quantum-caption" role="status">{activity.source}の選択範囲：{result.bitCount.toLocaleString()} bit ／ {result.matches ? '全ビット一致' : '不一致あり'} ／ {result.elapsed.toFixed(1)} ms</p>
        <div className="bit-position"><label>ビット <input aria-label="転送したビットの番号" type="number" min="1" max={result.bitCount} value={index + 1} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setBit(Math.max(0, Math.min(result.bitCount - 1, Math.trunc(value) - 1))); }} /></label><span>/ {result.bitCount.toLocaleString()}</span></div>
        <TeleportCircuit record={result.records[index]} />
        <p className="quantum-caption">このビット：入力 {measured.input} → 受信 {measured.output} ／ m0 = {measured.m0}、m1 = {measured.m1} ／ 補正：{[measured.m1 ? 'X' : '', measured.m0 ? 'Z' : ''].filter(Boolean).join(' → ') || 'なし'}</p>
        <div className="state-table-wrap"><table className="state-table"><caption>全ビットの途中測定（m0, m1）</caption><thead><tr><th>測定値</th><th>回数</th><th>割合</th></tr></thead><tbody>{result.counts.map((count, pair) => <tr key={pair}><td><code>{pair.toString(2).padStart(2, '0')}</code></td><td>{count.toLocaleString()}</td><td>{(count / result.bitCount * 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
        <p className="quantum-caption">q0は入力、q1・q2はもつれたペアです。q0・q1を測定し、その2ビットでq2を補正してから測定します。灰色の補正ゲートは実行していません。</p>
      </>}
      <p className="quantum-caption">選択範囲をブラウザ内で転送し、受信した測定結果から復元した文字列をコピーします。UTF-16の各文字コードを上位ビットから処理し、1ビットごとに3量子ビットを使います。コピーし直すと結果を更新します。</p>
    </div>
  </details>;
}
