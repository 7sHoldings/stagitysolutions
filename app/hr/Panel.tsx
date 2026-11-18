"use client";

import { useState } from "react";

/** A card that stays folded behind a button until it's needed (e.g. "+ Add vendor"). */
export default function Panel({ label, title, children, defaultOpen = false }: { label: string; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!open) {
    return (
      <button type="button" className="btn btn-primary hr-add" onClick={() => setOpen(true)}>
        <span aria-hidden="true">＋</span> {label}
      </button>
    );
  }
  return (
    <div className="hr-panel">
      <div className="hr-panel-head">
        <h2 className="i9-h3">{title}</h2>
        <button type="button" className="hr-x" onClick={() => setOpen(false)} aria-label="Close">✕</button>
      </div>
      {children}
    </div>
  );
}
