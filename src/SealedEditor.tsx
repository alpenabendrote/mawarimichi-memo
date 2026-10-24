import type { Note } from './notes';
import { noteTitle } from './notes';

export function SealedEditor({ label, openedNote, measuredEmpty, onEdit }: { label: string | null; openedNote?: Note; measuredEmpty: boolean; onEdit: (id: string) => void }) {
  if (openedNote) return <article className="opened-note" aria-label="開封したメモ"><div className="editor-topline"><span className="eyebrow">OPENED / {label}</span><button className="text-button" onClick={() => onEdit(openedNote.id)}>このメモを編集 ↗</button></div><h2>{noteTitle(openedNote)}</h2><p>{openedNote.body || '本文はまだありません。'}</p><div className="opened-caption">測定で得られた、この1枚だけを開封しました。</div></article>;
  return <div className="sealed-editor"><span className="sealed-symbol" aria-hidden="true">{measuredEmpty ? '∅' : '⌑'}</span><span className="eyebrow">{measuredEmpty ? 'EMPTY STATE' : 'SEALED NOTES'}</span><h2>{measuredEmpty ? '今回は、空き状態でした。' : label ? `${label}の中身は、まだ秘密。` : 'どのメモを、開けますか。'}</h2><p>{measuredEmpty ? 'カードを選び直すか、もう一度量子検索してみてください。' : label ? '量子検索で回路を用意し、好きな位置で測定して開封します。' : 'タイトルと本文を伏せて、順番をシャッフルしました。'}</p></div>;
}
