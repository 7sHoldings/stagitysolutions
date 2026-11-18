"use client";

import { useActionState, useEffect, useState } from "react";
import { checkReadyNow, markPaid, markUnpaid, sendInvoice, updateDraft, voidInvoice } from "./actions";
import { Modal } from "../Modal";
import { Status } from "../forms";
import type { ActionState } from "../actions";

/** "Approve & send": asks for confirmation in a pop-up, then emails the vendor. */
export function SendButton({ id, label, vendor, total, to }: { id: string; label?: string; vendor: string; total: string; to?: string }) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(sendInvoice, {} as ActionState);
  if (s.ok) return <span className="form-status ok" style={{ padding: "8px 14px" }}>✓ {s.message}</span>;
  return (
    <>
      <button type="button" className="btn btn-primary hr-btn-sm" onClick={() => setOpen(true)}>{label ?? "Approve & send"}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Send this invoice?">
        <form action={action} className="i9-stack" style={{ gap: 16 }}>
          <input type="hidden" name="id" value={id} />
          <p className="text">
            Send the <strong>{total}</strong> invoice to <strong>{vendor}</strong>{to ? <> ({to})</> : null} now, with the approved timesheets attached?
          </p>
          <p className="muted i9-small">The invoice number is assigned now. Once sent, it can&apos;t be changed (only voided).</p>
          {s.error && <p className="form-status err">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Sending…" : "Yes, send to vendor"}</button>
          </div>
        </form>
      </Modal>
    </>
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

/** "Mark paid" button that asks for the date the payment arrived. */
export function MarkPaidButton({ id, number, amount, vendor, today }: { id: string; number: string; amount: string; vendor: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(markPaid, {} as ActionState);
  useEffect(() => { if (s.ok) setOpen(false); }, [s]);
  if (s.ok) return <span className="hr-sent">✓ Paid</span>;
  return (
    <>
      <button type="button" className="btn hr-btn-xs inv-paid-btn" onClick={() => setOpen(true)}>Mark paid</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Record payment">
        <form action={action} className="i9-stack" style={{ gap: 16 }}>
          <input type="hidden" name="id" value={id} />
          <p className="text">Did <strong>{vendor}</strong> pay invoice <strong>#{number}</strong> for <strong>{amount}</strong>?</p>
          <label className="field" style={{ maxWidth: 260 }}>Payment received on<input type="date" name="paidOn" defaultValue={today} max={today} required /></label>
          {s.error && <p className="form-status err">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Saving…" : "Yes, mark as paid"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function UnpaidButton({ id }: { id: string }) {
  const [s, action, pending] = useActionState(markUnpaid, {} as ActionState);
  return (
    <form action={action} className="i9-stack" style={{ gap: 6 }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-outline hr-btn-sm" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "Marked by mistake? Set back to unpaid"}</button>
      <Status s={s} />
    </form>
  );
}

export function VoidForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(voidInvoice, {} as ActionState);
  if (s.ok) return <p className="form-status ok">{s.message}</p>;
  return (
    <>
      <button type="button" className="btn hr-btn-danger hr-btn-sm" onClick={() => setOpen(true)}>Void invoice…</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Void this invoice?">
        <form action={action} className="i9-stack" style={{ gap: 16 }}>
          <input type="hidden" name="id" value={id} />
          <p className="text">Voiding cancels it in our records and puts its hours back on a new draft. Tell the vendor separately that it&apos;s cancelled.</p>
          <label className="field">Reason<input name="reason" placeholder="e.g. wrong hours, will reissue" required /></label>
          {s.error && <p className="form-status err">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn hr-btn-solid-danger hr-btn-sm" disabled={pending}>{pending ? "Voiding…" : "Yes, void it"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Checks for invoices that just became ready and emails the team to review them. Never sends to vendors. */
export function CheckNowButton() {
  const [s, action, pending] = useActionState(checkReadyNow, {} as ActionState);
  return (
    <form action={action} className="i9-stack" style={{ gap: 6 }}>
      <button className="btn btn-outline hr-btn-sm" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Checking…" : "Check for ready invoices"}</button>
      {s.message && <span className="hr-sent" style={{ maxWidth: 420 }}>✓ {s.message}</span>}
      {s.error && <span className="i9-small" style={{ color: "#b91c1c", maxWidth: 420 }}>{s.error}</span>}
    </form>
  );
}
