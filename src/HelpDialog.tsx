import { useEffect, useRef } from 'react';
import helpContent from './help-content.html?raw';
import './help.css';

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    if (!dialog.open) dialog.showModal();
    // Removing the component removes the dialog. Avoid synthetic close events on
    // StrictMode's effect replay, which could dismiss a freshly reopened help.
  }, []);

  return <dialog ref={dialogRef} className="help-dialog" aria-labelledby="help-dialog-title" onClose={onClose}>
    <header className="help-header"><h2 id="help-dialog-title">ヘルプ</h2><form method="dialog"><button autoFocus>閉じる</button></form></header>
    {/* This is bundled, authored HTML, never note text or externally supplied content. */}
    <div className="help-scroll" dangerouslySetInnerHTML={{ __html: helpContent }} />
  </dialog>;
}
