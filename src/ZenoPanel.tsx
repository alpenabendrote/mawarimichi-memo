import type { Note } from './notes';
import { noteTitle } from './notes';
import { newZenoMemory, prepareZeno } from './quantum/zeno';
import type { ZenoReadRecord } from './zenoNotes';

const amplitude = (real: number, imaginary: number) => {
  const re = Math.abs(real) < 5e-8 ? 0 : real, im = Math.abs(imaginary) < 5e-8 ? 0 : imaginary;
  return im === 0 ? re.toFixed(6) : `${re.toFixed(6)} ${im < 0 ? '−' : '+'} ${Math.abs(im).toFixed(6)}i`;
};
function interval(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return seconds < 60 ? `${seconds}秒` : seconds < 3600 ? `${Math.floor(seconds / 60)}分${seconds % 60}秒` : `${(ms / 3600000).toFixed(2)}時間`;
}

export function ZenoPanel({ note, at, record, open, onOpenChange }: {
  note: Note; at: number; record: ZenoReadRecord | null; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const current = prepareZeno(note.zeno ?? newZenoMemory(at), at);
  const trace = record?.run ?? current;
  const run = record?.run;
  return <details className="quantum-details zeno-details" open={open} onToggle={event => onOpenChange(event.currentTarget.open)}>
    <summary>ゼノン効果の詳細</summary>
    <div className="quantum-content">
      <p className="quantum-caption">一覧の更新時点：「{noteTitle(note)}」の通常の確率 {(current.distribution[0] * 100).toFixed(2)}% ／ 休眠の確率 {(current.distribution[1] * 100).toFixed(2)}%</p>
      <p className="quantum-caption" role="status">{record
        ? `直近の測定：「${record.title}」 → ${record.run.measured === 0 ? '通常 |0⟩' : '休眠 |1⟩'}（${record.reason === 'search' ? '量子検索' : 'おまかせ'}で本文を開いたとき）`
        : 'まだ測定していません。「量子検索」か「おまかせ」で本文を開くと、読むメモの状態を1回測定します。'}</p>
      <p className="quantum-caption">表示中の回路：{record ? `直近に読んだ「${record.title}」の記録` : `「${noteTitle(note)}」の未測定状態`} ／ 経過 {interval(trace.elapsed)} ／ 回転角 {trace.angle.toPrecision(6)} rad</p>
      <div className="circuit-scroll" tabIndex={0} aria-label="ゼノン効果の回路。横にスクロールできます。">
        <svg width="470" height="100" role="img" aria-label={`1量子ビット。初期状態${trace.memory.basis}にRx(${trace.angle.toPrecision(6)})を適用。${run ? `測定結果${run.measured}。` : 'Mは未実行。'}`}>
          <text x="4" y="55">|{trace.memory.basis}⟩</text><line className="wire" x1="36" x2="448" y1="50" y2="50" />
          <g className="gate"><rect x="96" y="35" width="92" height="30" /><text x="142" y="54" textAnchor="middle">Rx(θ)</text></g>
          <g className={`gate ${run ? '' : 'unused'}`}><rect x="270" y="35" width="32" height="30" /><text x="286" y="54" textAnchor="middle">M</text></g>
          <text x="350" y="54">{run ? `|${run.measured}⟩` : '未測定'}</text>
        </svg>
      </div>
      <div className="state-table-wrap"><table className="state-table"><caption>この回路の振幅と確率</caption><thead><tr><th>状態</th><th>回転前の振幅</th><th>回転後の振幅</th><th>測定前の確率</th><th>測定後の振幅</th></tr></thead><tbody>{[0, 1].map(basis => <tr key={basis} className={run?.measured === basis ? 'target' : undefined}>
        <td>{basis === 0 ? '通常 |0⟩' : '休眠 |1⟩'}</td><td><code>{amplitude(trace.initial[2 * basis], trace.initial[2 * basis + 1])}</code></td><td><code>{amplitude(trace.before[2 * basis], trace.before[2 * basis + 1])}</code></td><td>{(trace.distribution[basis] * 100).toFixed(2)}%</td><td><code>{run ? amplitude(run.after[2 * basis], run.after[2 * basis + 1]) : '未測定'}</code></td>
      </tr>)}</tbody></table></div>
      <p className="quantum-caption">各メモの1量子ビットを、経過時間に応じたRxで回転します。通常から24時間で休眠へ、48時間で通常へ戻る周期です。短い間隔で測定すると、通常・休眠のどちらも同じ状態にとどまりやすくなります。古さに比例する点数ではありません。</p>
      <p className="quantum-caption">一覧では休眠の確率が50%を超えるメモを「休眠寄り」として下へまとめます。この仕分けと状態の参照は測定ではありません。並びはメモの選択・作成・編集・削除・読書などの操作時に更新し、自動では動かしません。検索とおまかせは実行時の一覧順を使います。</p>
      <p className="quantum-caption">タイトルや本文を編集すると通常 |0⟩ に準備し直します。新規・複製したメモも通常から始めます。休眠寄りでも本文は読めます。状態と基準時刻はメモと一緒に保存し、直近の回路記録はこの画面だけに保持します。詳細を開閉しても測定しません。</p>
    </div>
  </details>;
}
