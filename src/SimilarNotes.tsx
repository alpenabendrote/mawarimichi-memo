import { useEffect, useState } from 'react';
import { noteTitle, type Note } from './notes';
import { similarCandidate, type SimilarityResult } from './similarity';
import { startSimilarityComparison } from './similarityJob';
import SimilarityWorker from './quantum/similarity.worker?worker&inline';

type Activity = { status: 'running'; completed: number; total: number } | { status: 'done'; result: SimilarityResult } | { status: 'error' };

function SwapCircuit({ sourceGates, targetGates }: { sourceGates: number; targetGates: number }) {
  const box = (x: number, y: number, label: string) => <g className="gate"><rect x={x - 22} y={y - 12} width="44" height="24" /><text x={x} y={y + 4} textAnchor="middle">{label}</text></g>;
  return <div className="circuit-scroll" tabIndex={0} aria-label="SWAPテストの回路。横にスクロールできます。">
    <svg width="660" height="174" role="img" aria-label={`13量子ビット。AとBをそれぞれ${sourceGates}個と${targetGates}個の制御Ryで準備し、補助ビットにH、6組の制御SWAP、H、測定。`}>
      {[36, 92, 148].map((y, i) => <g key={i}><text x="0" y={y + 4}>{['補助 |0⟩', 'A 6q |0⟩', 'B 6q |0⟩'][i]}</text><line className="wire" x1="76" x2="650" y1={y} y2={y} /></g>)}
      {box(118, 92, 'U(A)')}{box(118, 148, 'U(B)')}{box(185, 36, 'H')}
      {Array.from({ length: 6 }, (_, q) => {
        const x = 250 + q * 42;
        return <g className="gate" key={q}><title>Aのq{q}とBのq{q}を、補助ビットを制御に交換</title><line className="control-wire" x1={x} x2={x} y1="36" y2="148" /><circle cx={x} cy="36" r="3" />{[92, 148].map(y => <path className="swap-cross" key={y} d={`M${x - 5},${y - 5}l10,10m-10,0l10,-10`} />)}</g>;
      })}
      {box(530, 36, 'H')}{box(605, 36, 'M')}
    </svg>
  </div>;
}

export function SimilarityDetails({ result, notes }: { result: SimilarityResult; notes: readonly Note[] }) {
  const selected = result.candidates[0];
  return <details className="quantum-details similarity-details">
    <summary>比較の詳細</summary>
    <div className="quantum-content">
      {selected ? <>
        <p className="quantum-caption">A：選択中のメモ ／ B：{noteTitle(notes.find(note => note.id === selected.id) ?? { title: '' })}</p>
        <SwapCircuit sourceGates={result.sourcePreparationGates} targetGates={selected.preparationGates} />
        <p className="quantum-caption">U(A)・U(B)は制御Ryによる状態準備です。Aに{result.sourcePreparationGates}回、Bに{selected.preparationGates}回の回転を適用しました。×は対応する量子ビットの交換です。</p>
        <div className="state-table-wrap"><table className="state-table"><caption>実際の測定結果（各メモ {selected.shots.toLocaleString()}回）</caption><thead><tr><th>メモ</th><th>0</th><th>1</th><th>重なりの推定</th></tr></thead><tbody>{result.candidates.map(candidate => <tr key={candidate.id} className={candidate.id === selected.id ? 'target' : undefined}><td>{noteTitle(notes.find(note => note.id === candidate.id) ?? { title: '' })}</td><td>{candidate.counts[0].toLocaleString()}</td><td>{candidate.counts[1].toLocaleString()}</td><td>{(candidate.overlap * 100).toFixed(1)}%</td></tr>)}</tbody></table></div>
        <p className="quantum-caption">上のBについて、回路の振幅から求めた測定前のP(0)：{(selected.probabilityZero * 100).toFixed(2)}% ／ 計算全体：{result.elapsed.toFixed(1)} ms</p>
      </> : <p className="quantum-caption">比較できる文字の特徴がありません。</p>}
      <p className="quantum-caption">タイトルと本文をNFKC正規化し、英字の大文字・小文字を揃え、連続する2文字（1文字の語はその文字）の頻度から共通の最大64特徴を作ります。TF-IDFによる特徴抽出は通常の計算、状態準備とH・制御SWAP・Hは複素状態ベクトルのシミュレーションです。</p>
      <p className="quantum-caption">使用した特徴：{result.featureCount} ／ 次元の上限で省略した特徴：{result.omittedFeatures}。測定ごとに同じ入力を準備した場合の分布から独立に抽選し、2 ×「0の割合」− 1で重なりの二乗を推定します。0〜100%に収め、10%以上の最上位だけを候補にします。測定にはばらつきがあり、文章の意味の一致率ではありません。</p>
      <p className="quantum-caption">本文の抜粋は表示せず、比較の記録も保存しません。計算と測定はブラウザ内で行います。</p>
    </div>
  </details>;
}

export function SimilarNotes({ notes, activeId, onSelect }: { notes: Note[]; activeId: string; onSelect: (id: string) => void }) {
  const [record, setRecord] = useState<{ notes: Note[]; activeId: string; activity: Activity } | null>(null);
  useEffect(() => {
    if (notes.length < 2) return;
    let job: { cancel: () => void } | undefined;
    const update = (activity: Activity) => setRecord({ notes, activeId, activity });
    const timer = setTimeout(() => {
      update({ status: 'running', completed: 0, total: notes.length - 1 });
      job = startSimilarityComparison({ notes: notes.map(({ id, title, body }) => ({ id, title, body })), activeId }, {
        createWorker: () => new SimilarityWorker(),
        onProgress: (completed, total) => update({ status: 'running', completed, total }),
        onDone: result => update({ status: 'done', result }),
        onError: () => update({ status: 'error' }),
      });
    }, 600);
    return () => { clearTimeout(timer); job?.cancel(); };
  }, [notes, activeId]);

  if (notes.length < 2) return null;
  // Do not render stale results even during the render before effect cleanup.
  const activity = record?.notes === notes && record.activeId === activeId ? record.activity : null;
  const result = activity?.status === 'done' ? activity.result : null;
  const best = result && similarCandidate(result);
  const related = best && notes.find(note => note.id === best.id);
  return <section className="similar-notes" aria-label="似たメモ">
    <p className="similar-note-line" role="status">{!activity || activity.status === 'running' ? '似たメモを比較中…' : activity.status === 'error' ? '似たメモを比較できませんでした。' : related && best ? <>似たメモ：<button className="link-button" onClick={() => onSelect(related.id)}>{noteTitle(related)}</button><span className="muted">（推定 {(best.overlap * 100).toFixed(0)}%）</span></> : '似たメモは見つかりませんでした。'}</p>
    {result && <SimilarityDetails key={activeId} result={result} notes={notes} />}
  </section>;
}
