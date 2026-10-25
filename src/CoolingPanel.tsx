import { useMemo, useState } from 'react';
import type { CoolingActivity } from './coolingDeletion';
import { coolingSnapshot, decodeCoolingRecord, type CoolingResult } from './quantum/cooling';

const amplitude = (r: number, i: number) => Math.abs(i) < 1e-9 ? r.toFixed(6) : r.toFixed(6) + (i < 0 ? ' − ' : ' + ') + Math.abs(i).toFixed(6) + 'i';

export function CoolingPanel({ activity, open, onOpenChange }: {
  activity: CoolingActivity | null; open: boolean; onOpenChange: (value: boolean) => void;
}) {
  const result = activity?.status === 'done' ? activity.result : null;
  const firstExcited = useMemo(() => Math.max(0, result?.records.findIndex(record => record >>> 7 === 1) ?? 0), [result]);
  const [selection, setSelection] = useState<{ result: CoolingResult; index: number; round: number } | null>(null);
  const index = result && selection?.result === result ? selection.index : firstExcited;
  const record = result?.records[index];
  const decoded = record === undefined ? null : decodeCoolingRecord(record);
  const round = result && selection?.result === result ? selection.round : decoded?.steps ?? 1;
  const snapshot = record === undefined ? null : coolingSnapshot(record, round);
  return <details className="quantum-details cooling-details" open={open} onToggle={event => onOpenChange(event.currentTarget.open)}>
    <summary>削除の詳細</summary>
    <div className="quantum-content">
      <p className="quantum-caption" role="status">{!activity ? '「削除」を押すと、タイトル・本文の全ビットを冷ましてからメモを削除します。'
        : activity.status === 'running' ? '「' + activity.title + '」を消去中… ' + activity.completed.toLocaleString() + ' / ' + activity.total.toLocaleString() + 'ビット'
        : activity.status === 'cancelled' ? '削除を中止しました。メモは消していません。'
        : activity.status === 'error' ? '緩和を確認できなかったため、メモは削除していません。もう一度「削除」で試せます。'
        : '「' + activity.title + '」の消去完了。' + activity.result.finalZeroCount.toLocaleString() + 'ビットすべての最終測定が0でした。'}</p>
      <p className="quantum-caption">各ビットsを、新しい環境e = |0⟩と結合します。減衰率γ = 0.5、制御Ryの角度θ = π/2。環境の測定で励起が移ったことを確認し、sを最後に測定します。</p>
      {result && decoded && <div className="bit-position">
        <label htmlFor="cooling-bit">表示するビットの記録</label>
        <input id="cooling-bit" type="number" min={1} max={result.bitCount} value={index + 1} onChange={event => {
          const n = Number(event.target.value);
          if (Number.isInteger(n) && n >= 1 && n <= result.bitCount) setSelection({ result, index: n - 1, round: decodeCoolingRecord(result.records[n - 1]).steps });
        }} />
        <span>/ {result.bitCount.toLocaleString()}</span>
      </div>}
      {result && decoded && <div className="bit-position">
        <label htmlFor="cooling-round">このビットの結合回</label>
        <input id="cooling-round" type="number" min={1} max={decoded.steps} value={round} onChange={event => {
          const n = Number(event.target.value);
          if (Number.isInteger(n) && n >= 1 && n <= decoded.steps) setSelection({ result, index, round: n });
        }} />
        <span>/ {decoded.steps}回</span>
      </div>}
      <p className="quantum-caption">{decoded ? '入力ビット ' + decoded.input + ' ／ 環境の測定 e = ' + snapshot!.environment + ' ／ ' + (snapshot!.final ? '最終測定 s = 0' : 'まだ励起しているため次の新しい環境へ')
        : 's = メモの1ビット、e = 環境の1ビット。回路は各ビット・各結合回で使い直します。'}</p>
      <div className="circuit-scroll" tabIndex={0} aria-label="振幅減衰による削除の回路。横にスクロールできます。">
        <svg width="530" height="140" role="img" aria-label="sからeへ制御Ry、eからsへCNOT、eを測定。sの最終測定は最後の結合回のみ。">
          <text x="4" y="42">s |{decoded?.input ?? 'b'}⟩</text><text x="4" y="102">e |0⟩</text>
          <line className="wire" x1="55" x2="520" y1="38" y2="38"/><line className="wire" x1="55" x2="520" y1="98" y2="98"/>
          <g className="gate"><line className="control-wire" x1="130" x2="130" y1="38" y2="98"/><circle cx="130" cy="38" r="3"/><rect x="94" y="83" width="72" height="30"/><text x="130" y="102" textAnchor="middle">Ry(π/2)</text></g>
          <g className="gate"><line className="control-wire" x1="240" x2="240" y1="38" y2="98"/><circle cx="240" cy="98" r="3"/><rect x="225" y="23" width="30" height="30"/><text x="240" y="42" textAnchor="middle">X</text></g>
          <g className="gate"><rect x="324" y="83" width="30" height="30"/><text x="339" y="102" textAnchor="middle">M</text></g>
          <text x="375" y="102">{snapshot ? 'e = ' + snapshot.environment : 'e = …'}</text>
          <g className={'gate ' + (snapshot?.final ? '' : 'unused')}><rect x="434" y="23" width="30" height="30"/><text x="449" y="42" textAnchor="middle">M</text></g>
          <text x="475" y="42">{snapshot?.final ? 's = 0' : '最終回'}</text>
        </svg>
      </div>
      {snapshot && <div className="state-table-wrap"><table className="state-table"><caption>この結合回の複素振幅（基底は |環境 メモ⟩）</caption><thead><tr><th>状態</th><th>結合前</th><th>制御Ry後</th><th>CNOT後</th><th>環境の測定後</th></tr></thead><tbody>
        {[0, 1, 2, 3].map(basis => <tr key={basis}><td><code>|{basis.toString(2).padStart(2, '0')}⟩</code></td>{[snapshot.initial, snapshot.rotated, snapshot.coupled, snapshot.collapsed].map((state, column) => <td key={column}><code>{amplitude(state[2 * basis], state[2 * basis + 1])}</code></td>)}</tr>)}
      </tbody></table></div>}
      {result && <>
        <p className="quantum-caption">環境の測定：0が{result.environmentCounts[0].toLocaleString()}回、1が{result.environmentCounts[1].toLocaleString()}回 ／ 計算 {result.elapsed.toFixed(2)} ms</p>
        <div className="state-table-wrap"><table className="state-table"><caption>全ビットの実行記録を結合回ごとに集計</caption><thead><tr><th>結合回</th><th>結合数</th><th>環境へ移った励起</th><th>実際に残った1</th><th>未測定なら残る1の期待数</th></tr></thead><tbody>
          {result.rounds.map(row => <tr key={row.round}><td>{row.round}</td><td>{row.interactions.toLocaleString()}</td><td>{row.emitted.toLocaleString()}</td><td>{row.remaining.toLocaleString()}</td><td>{(result.initialExcited * (1 - result.gamma) ** row.round).toFixed(3)}</td></tr>)}
        </tbody></table></div>
      </>}
      <p className="quantum-caption">番号は削除の設定ではなく、実行済みの記録を見る操作です。タイトルと本文をJSON配列にまとめ、UTF-16の16ビット単位で全ビットを計算します。回路の表示・開閉では再測定しません。</p>
      <p className="quantum-caption">0へ戻ったビットには追加の結合を行いません。64回で緩和を確認できなければ削除を中止します。表の期待数は未測定の振幅減衰モデル、残った1は環境を測定した実際の軌跡です。結合回は実時間や実機の温度を表しません。</p>
      <p className="quantum-caption">「元に戻す」用の本文は通常のデータとして別に保持します。元の文字列を物理的に消去する機能ではありません。回路記録はこの画面だけに保持し、再読み込みで消えます。</p>
    </div>
  </details>;
}

