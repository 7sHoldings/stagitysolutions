"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ActionState } from "./actions";

/** Centered pop-up window with a dimmed background. Closes with ✕, Escape or a click outside. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // Rendered at the end of <body> so it's always centred, even when opened from inside a table.
  return createPortal(
    <div className="hr-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`hr-modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="hr-modal-head">
          <h2 className="i9-h3">{title}</h2>
          <button type="button" className="hr-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="hr-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A button that opens a form in a pop-up window. */
export function ModalButton({ label, title, children, className, wide }: { label: React.ReactNode; title: string; children: (close: () => void) => React.ReactNode; className?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? "btn btn-primary hr-add"} onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title} wide={wide}>
        {open && children(() => setOpen(false))}
      </Modal>
    </>
  );
}

/**
 * A button that asks "Are you sure?" in a pop-up before running a server action
 * (delete, unassign…). Shows the action's error, if any, inside the pop-up.
 */
export function ConfirmAction({
  action, fields, label, title, message, confirmLabel, danger = true, className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: React.ReactNode;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [s, run, pending] = useActionState(action, {} as ActionState);
  useEffect(() => {
    if (s.ok) setOpen(false);
  }, [s]);
  return (
    <>
      <button type="button" className={className ?? (danger ? "btn hr-btn-danger hr-btn-sm" : "btn btn-outline hr-btn-sm")} onClick={() => setOpen(true)}>
        {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <form action={run} className="i9-stack" style={{ gap: 18 }}>
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <div className="text">{message}</div>
          {s.error && <p className="form-status err" role="alert">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className={`btn hr-btn-sm ${danger ? "hr-btn-solid-danger" : "btn-primary"}`} disabled={pending}>{pending ? "Working…" : confirmLabel}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
