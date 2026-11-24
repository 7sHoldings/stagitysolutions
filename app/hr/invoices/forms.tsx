"use client";

import { useActionState, useEffect, useState } from "react";
import { acceptDifference, checkReadyNow, editImported, emailShortPayment, markPaid, removeImported, markUnpaid, sendInvoice, updateDraft, voidInvoice } from "./actions";
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

/** "Record payment": amount received (defaults to what's left / expected) and the date it arrived. */
export function MarkPaidButton({ id, number, amount, vendor, today, remaining, label = "Mark paid", noAmount = false }: {
  id: string; number: string; amount: string; vendor: string; today: string; remaining?: number; label?: string; noAmount?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(markPaid, {} as ActionState);
  useEffect(() => { if (s.ok) setOpen(false); }, [s]);
  if (s.ok) return <span className="hr-sent">✓ {s.message}</span>;
  return (
    <>
      <button type="button" className="btn hr-btn-xs inv-paid-btn" onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Record payment received">
        <form action={action} className="i9-stack" style={{ gap: 16 }}>
          <input type="hidden" name="id" value={id} />
          <p className="text">Payment from <strong>{vendor}</strong> for invoice <strong>#{number}</strong>{noAmount ? "" : ` (${amount})`}.</p>
          {noAmount ? (
            <label className="field" style={{ maxWidth: 260 }}>Paid on <span className="field-hint">(approximate is fine)</span><input type="date" name="paidOn" defaultValue={today} max={today} required /></label>
          ) : (
            <>
              <div className="form-grid">
                <label className="field">Amount received ($)<input type="number" name="amount" step="0.01" min="0.01" defaultValue={remaining != null ? remaining.toFixed(2) : ""} required /></label>
                <label className="field">Received on<input type="date" name="paidOn" defaultValue={today} max={today} required /></label>
              </div>
              <label className="field">Note <span className="field-hint">(optional, e.g. check number)</span><input name="note" /></label>
              <p className="muted i9-small">If they paid less than the invoice, enter what actually arrived. You can then email them about the difference or accept it (e.g. a VMS fee).</p>
            </>
          )}
          {s.error && <p className="form-status err">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Saving…" : "Save payment"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** For a short-paid invoice: email the vendor about it, or accept the difference and close it. */
export function ShortPayActions({ id, diff, vendor, to, preview, emailedAt }: { id: string; diff: string; vendor: string; to: string; preview: string[]; emailedAt: string | null }) {
  const [mail, setMail] = useState(false);
  const [accept, setAccept] = useState(false);
  const [ms, mailAction, mailing] = useActionState(emailShortPayment, {} as ActionState);
  const [as, acceptAction, accepting] = useActionState(acceptDifference, {} as ActionState);
  useEffect(() => { if (ms.ok) setMail(false); }, [ms]);
  useEffect(() => { if (as.ok) setAccept(false); }, [as]);
  return (
    <>
      <button type="button" className="hr-link" onClick={() => setMail(true)}>{emailedAt ? "Email again" : "Email vendor"}</button>
      <button type="button" className="hr-link" onClick={() => setAccept(true)}>Accept difference</button>
      {(ms.message || as.message) && <span className="hr-sent">✓ {ms.message ?? as.message}</span>}
      <Modal open={mail} onClose={() => setMail(false)} title={`Email ${vendor} about the short payment`} wide>
        <form action={mailAction} className="i9-stack" style={{ gap: 14 }}>
          <input type="hidden" name="id" value={id} />
          <p className="muted i9-small">To: {to} · from accounts@ · copy to accounts@ · the invoice PDF is attached</p>
          <div className="ack-body" style={{ borderTop: 0, paddingTop: 0 }}>
            {preview.map((p, i) => <p key={i} style={{ whiteSpace: "pre-line" }}>{p}</p>)}
          </div>
          <label className="field">Add a message <span className="field-hint">(optional, added before the sign-off)</span><textarea name="message" rows={3} style={{ minHeight: 80 }} /></label>
          {ms.error && <p className="form-status err">{ms.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setMail(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={mailing}>{mailing ? "Sending…" : "Send email"}</button>
          </div>
        </form>
      </Modal>
      <Modal open={accept} onClose={() => setAccept(false)} title="Accept the difference?">
        <form action={acceptAction} className="i9-stack" style={{ gap: 14 }}>
          <input type="hidden" name="id" value={id} />
          <p className="text">Close this invoice as paid and accept <strong>{diff}</strong> less than invoiced.</p>
          <label className="field">Reason
            <select name="reason" required defaultValue="">
              <option value="" disabled>Choose…</option>
              <option>VMS fee</option>
              <option>Discount</option>
              <option>Timesheet correction</option>
              <option>Other</option>
            </select>
          </label>
          <label className="field">Note <span className="field-hint">(optional)</span><input name="note" /></label>
          {as.error && <p className="form-status err">{as.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setAccept(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={accepting}>{accepting ? "Saving…" : "Accept and close"}</button>
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
      <button className="btn btn-outline hr-btn-sm" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "Recorded by mistake? Clear payments"}</button>
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

/** Edit an old invoice (sent before the portal): amount, invoice number and date. Also lets you remove it. */
export function EditOldButton({ id, number, issueDate, total, label = "Edit" }: { id: string; number: string; issueDate: string; total: number; label?: string }) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(editImported, {} as ActionState);
  const [rs, removeAction, removing] = useActionState(removeImported, {} as ActionState);
  useEffect(() => { if (s.ok || rs.ok) setOpen(false); }, [s, rs]);
  return (
    <>
      <button type="button" className="hr-link" onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Old invoice">
        <form action={action} className="i9-stack" style={{ gap: 14 }}>
          <input type="hidden" name="id" value={id} />
          <p className="muted i9-small">An invoice you sent before the portal. Enter the amount if it&apos;s still unpaid, so it counts as outstanding.</p>
          <div className="form-grid">
            <label className="field">Invoice amount ($)<input name="total" type="number" step="0.01" min="0" defaultValue={total ? total.toFixed(2) : ""} placeholder="e.g. 11200" autoFocus /></label>
            <label className="field">Invoice number<input name="number" defaultValue={number} required /></label>
            <label className="field">Invoice date<input name="issueDate" type="date" defaultValue={issueDate} required /></label>
          </div>
          <p className="muted i9-small">The expected payment date is recalculated from the invoice date and this consultant&apos;s payment terms.</p>
          {s.error && <p className="form-status err">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </form>
        <form action={removeAction} style={{ borderTop: "1px solid #e5e7eb", marginTop: 16, paddingTop: 12 }}>
          <input type="hidden" name="id" value={id} />
          <p className="muted i9-small" style={{ margin: "0 0 8px" }}>Not working that month / no invoice was sent?</p>
          <button className="btn hr-btn-danger hr-btn-sm" disabled={removing}>{removing ? "Removing…" : "Remove this month"}</button>
          {rs.error && <p className="form-status err">{rs.error}</p>}
        </form>
      </Modal>
    </>
  );
}
