import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Modal dialogs get a dim backdrop. The revision sheet is not dimmed so the paragraph stays visible. */
  backdrop?: boolean;
}

/** Moves focus in, traps Tab, closes on Escape, and restores focus to the opener. */
export function Dialog({ label, onClose, children, className = '', backdrop = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus]') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? ref.current)?.focus();
    return () => { if (opener && document.contains(opener)) opener.focus(); };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <>
      {backdrop && <div className="backdrop" onClick={onClose} aria-hidden="true" />}
      <div ref={ref} role="dialog" aria-label={label} aria-modal={backdrop || undefined} tabIndex={-1} className={`dialog ${className}`} onKeyDown={onKeyDown}>
        {children}
      </div>
    </>
  );
}

interface ConfirmProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog label={title} onClose={onCancel} backdrop className="confirm">
      <h2 className="smallcaps">{title}</h2>
      <p>{message}</p>
      <div className="row end">
        <button type="button" className="btn" onClick={onCancel} data-autofocus>Cancel</button>
        <button type="button" className="btn primary" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Dialog>
  );
}
