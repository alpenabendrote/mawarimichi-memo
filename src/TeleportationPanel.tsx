import { useState } from 'react';
import { decodeRecord } from './quantum/teleportation';
import type { TransferActivity } from './quantum/transfer';

function TeleportCircuit({ record }: { record?: number }) {
  const measured = record === undefined ? null : decodeRecord(record);
  const { input, m0, m1, output } = measured ?? { input: 'b', m0: '…', m1: '…', output: '…' };
  const box = (x: number, y: number, label: string, active = true) => <g className={`gate ${active ? '' : 'unused'}`}><rect x={x - 14} y={y - 12} width="28" height="24" /><text x={x} y={y + 4} textAnchor="middle">{label}</text></g>;
  const cx = (x: number, control: number, target: number) => <g className="gate"><line className="control-wire" x1={x} x2={x} y1={control} y2={target} /><circle cx={x} cy={control} r="3" />{box(x, target, 'X')}</g>;
  return <div className="circuit-scroll" tabIndex={0} aria-label="量子テレポーテーション回路。横にスクロールできます。">
    <svg width="680" height="190" role="img" aria-label={measured ? `3量子ビットの回路。入力${input}、m0=${m0}、m1=${m1}、受信${output}。m1でX、m0でZを補正。` : '3量子ビットの量子テレポーテーション回路。測定結果はまだありません。'}>
      {[40, 95, 150].map((y, q) => <g key={q}><text x="0" y={y + 4}>q{q} |{q === 0 ? input : 0}⟩</text><line className="wire" x1="60" x2={q === 2 ? '660' : '380'} y1={y} y2={y} /></g>)}
      {box(100, 95, 'H')}{cx(170, 95, 150)}{cx(240, 40, 95)}{box(310, 40, 'H')}
      {box(380, 40, 'M')}{box(380, 95, 'M')}
      <path className="classical-wire" d="M394 95 H450 V136 M394 40 H520 V136" />
      <text x="405" y="31">m0={m0}</text><text x="405" y="86">m1={m1}</text>
      {box(450, 150, measured ? 'X' : 'Xᵐ¹', !measured || Boolean(m1))}{box(520, 150, measured ? 'Z' : 'Zᵐ⁰', !measured || Boolean(m0))}{box(590, 150, 'M')}
      <text x="615" y="154">{output}</text><text x="425" y="185">m1でX</text><text x="495" y="185">m0でZ</text>
    </svg>
  </div>;
}

export function TeleportationPanel({ activity, operation = 'paste', open, onOpenChange }: {
  activity: TransferActivity | null;
  operation?: 'paste' | 'duplicate';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const action = operation === 'duplicate' ? '複製' : '貼り付け';
  const [localOpen, setLocalOpen] = useState(false);
  const [bit, setBit] = useState(0);
  const result = activity?.status === 'done' ? activity.result : null;
  const index = result ? Math.min(bit, result.bitCount - 1) : 0;
  const measured = result ? decodeRecord(result.records[index]) : null;
  return <details className="quantum-details transfer-details" open={open ?? localOpen} onToggle={event => {
    const next = event.currentTarget.open;
    setLocalOpen(next); onOpenChange?.(next);
  }}>
    <summary>{action}の詳細{activity && <span role="status">{activity.status === 'running' ? `（転送中 ${activity.completed.toLocaleString()} / ${activity.total.toLocaleString()} bit）` : `（${action}${activity.status === 'done' ? '完了' : activity.status === 'cancelled' ? '中止' : '失敗'}）`}</span>}</summary>
    <div className="quantum-content">
      {!activity && <p className="quantum-caption">「{action}」を押すと、この回路で文字を転送します。設定は不要です。完了すると、同じ欄に測定結果を表示します。</p>}
      {activity?.status === 'running' && <p className="quantum-caption">{activity.source}を転送しています。{activity.completed.toLocaleString()} / {activity.total.toLocaleString()} bit。完了後に測定結果を表示します。</p>}
      {activity?.status === 'cancelled' && <p className="quantum-caption">メモが変更されたため、{action}を中止しました。</p>}
      {activity?.status === 'error' && <p role="alert">転送をシミュレーションできなかったため、{action}を中止しました。</p>}
      {result && measured && <>
        <p className="quantum-caption" role="status">{activity!.source}の転送：{result.bitCount.toLocaleString()} bit ／ {result.matches ? '全ビット一致' : '不一致あり'} ／ {result.elapsed.toFixed(1)} ms</p>
        <p className="quantum-caption" id={`transfer-record-help-${operation}`}>文字を0/1に分け、1ビットずつ転送します。下の番号は、転送済みのどの記録を見るかを選ぶものです。番号を変えても再計算せず、{action}する内容も変わりません。</p>
        <div className="bit-position"><label>表示する転送記録 <input aria-label="表示する転送記録の番号" aria-describedby={`transfer-record-help-${operation}`} type="number" min="1" max={result.bitCount} value={index + 1} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) setBit(Math.max(0, Math.min(result.bitCount - 1, Math.trunc(value) - 1))); }} /></label><span>/ {result.bitCount.toLocaleString()} ビット</span></div>
      </>}
      <TeleportCircuit record={result ? result.records[index] : undefined} />
      {result && measured && <>
        <p className="quantum-caption">このビット：入力 {measured.input} → 受信 {measured.output} ／ m0 = {measured.m0}、m1 = {measured.m1} ／ 補正：{[measured.m1 ? 'X' : '', measured.m0 ? 'Z' : ''].filter(Boolean).join(' → ') || 'なし'}</p>
        <div className="state-table-wrap"><table className="state-table"><caption>全ビットの途中測定（m0, m1）</caption><thead><tr><th>測定値</th><th>回数</th><th>割合</th></tr></thead><tbody>{result.counts.map((count, pair) => <tr key={pair}><td><code>{pair.toString(2).padStart(2, '0')}</code></td><td>{count.toLocaleString()}</td><td>{(count / result.bitCount * 100).toFixed(2)}%</td></tr>)}</tbody></table></div>
      </>}
      <p className="quantum-caption">q0は転送する1ビット、q1・q2はもつれたペアです。m0・m1は回路の途中で測定した値で、その結果に応じてq2にX・Zを適用します。{result ? '灰色の補正ゲートは実行していません。' : '「…」は測定結果がまだないことを表します。'}</p>
      <p className="quantum-caption">{operation === 'duplicate' ? 'タイトルと本文をブラウザ内で転送し、受信した測定結果から復元して新しいメモを追加します。' : '貼り付ける文字列をブラウザ内で転送し、受信した測定結果から復元して挿入します。'}各文字コードを16ビットに分け、この3量子ビットの回路を繰り返して全文を転送します。コピー操作とクリップボードの内容は変更しません。</p>
    </div>
  </details>;
}
