"use client";

import { useActionState } from "react";
import { markPaid, sendInvoice, updateDraft, voidInvoice } from "./actions";
import { Status } from "../forms";
import type { ActionState } from "../actions";

export function SendButton({ id, label, vendor, total }: { id: string; label?: string; vendor: string; total: string }) {
  const [s, action, pending] = useActionState(sendInvoice, {} as ActionState);
  if (s.ok) return <span className="form-status ok" style={{ padding: "6px 12px" }}>{s.message}</span>;
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm(`Send this ${total} invoice to ${vendor} now?`)) e.preventDefault(); }}
      className="i9-stack"
      style={{ gap: 6 }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-primary" disabled={pending} style={{ minHeight: 40, padding: "8px 18px", fontSize: 14.5 }}>
        {pending ? "Sending…" : label ?? "Approve & send"}
      </button>
      {s.error && <span className="i9-small" style={{ color: "#b91c1c", maxWidth: 260 }}>{s.error}</span>}
    </form>
  );
}

export function DraftEditForm({ id, poNumber, notes }: { id: string; poNumber: string; notes: string }) {
  const [s, action, pending] = useActionState(updateDraft, {} as ActionState);
  return (
    <form action={action} className="i9-stack">
      <input type="hidden" name="id" value={id} />
      <label className="field">PO / reference number<input name="poNumber" defaultValue={poNumber} /></label>
      <label className="field">Note on the invoice (optional)<textarea name="notes" defaultValue={notes} rows={2} style={{ minHeight: 70 }} /></label>
      <Status s={s} />
      <button className="btn btn-outline" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "Save changes"}</button>
    </form>
  );
}

export function PaidForm({ id, today }: { id: string; today: string }) {
  const [s, action, pending] = useActionState(markPaid, {} as ActionState);
  return (
    <form action={action} className="i9-stack">
      <input type="hidden" name="id" value={id} />
      <label className="field" style={{ maxWidth: 240 }}>Payment received on<input type="date" name="paidOn" defaultValue={today} /></label>
      <Status s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "Mark as paid"}</button>
    </form>
  );
}

export function VoidForm({ id }: { id: string }) {
  const [s, action, pending] = useActionState(voidInvoice, {} as ActionState);
  return (
    <form action={action} className="i9-stack" onSubmit={(e) => { if (!confirm("Void this invoice? Tell the vendor separately that it's cancelled.")) e.preventDefault(); }}>
      <input type="hidden" name="id" value={id} />
      <label className="field">Reason<input name="reason" placeholder="e.g. wrong hours, will reissue" /></label>
      <Status s={s} />
      <button className="btn btn-outline" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Voiding…" : "Void invoice"}</button>
    </form>
  );
}
