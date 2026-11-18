import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icons.js';

export function Dialog({ id, title, open, onClose, children }: {
  id: string; title: string; open: boolean; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      const input = dialog.querySelector<HTMLInputElement>('input');
      input?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      if (opener.current?.isConnected) opener.current.focus();
    }
  }, [open]);
  return <dialog ref={ref} id={id} aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="dialog-heading">
      <h2 id={`${id}-title`}>{title}</h2>
      <button className="icon-button" type="button" aria-label={`关闭${title}`} onClick={onClose}><Icon name="close" /></button>
    </div>
    <div className="dialog-body">{children}</div>
  </dialog>;
}
