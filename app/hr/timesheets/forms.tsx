"use client";

import { useActionState, useEffect, useState } from "react";
import { remindAll, remindConsultant, reviewTimesheet } from "./actions";
import { Modal } from "../Modal";
import { Status } from "../forms";
import type { ActionState } from "../actions";

/** Shows exactly what will be emailed, then sends from timesheets@. */
export function RemindButton({ personId, month, name, email, missing, monthName, remindedToday }: {
  personId: string; month: string; name: string; email: string; missing: string[]; monthName: string; remindedToday: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(remindConsultant, {} as ActionState);
  useEffect(() => { if (s.ok) setOpen(false); }, [s]);
  if (s.ok) return <span className="hr-sent">✓ Reminded</span>;
  return (
    <>
      <button type="button" className={`btn hr-btn-xs ${remindedToday ? "btn-outline" : "hr-btn-remind"}`} onClick={() => setOpen(true)}>
        {remindedToday ? "Remind again" : "Send reminder"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Remind ${name}?`}>
        <form action={action} className="i9-stack" style={{ gap: 16 }}>
          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="month" value={month} />
          <div className="hr-preview">
            <p className="muted i9-small">To {email} · from timesheets@stagitysolutions.com</p>
            <p><strong>Reminder: timesheets for {monthName}</strong></p>
            <p className="i9-small">We&apos;re still missing your approved timesheets for:</p>
            <ul className="hr-missing">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          {remindedToday && <p className="muted i9-small">They were already reminded today.</p>}
          {s.error && <p className="form-status err" role="alert">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Sending…" : "Send reminder"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function RemindAllButton({ month, monthName, people }: { month: string; monthName: string; people: { name: string; count: number }[] }) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(remindAll, {} as ActionState);
  useEffect(() => { if (s.ok) setOpen(false); }, [s]);
  if (!people.length) return null;
  return (
    <>
      <button type="button" className="btn btn-primary hr-btn-sm" onClick={() => setOpen(true)}>
        Remind all missing ({people.length})
      </button>
      {s.ok && <span className="hr-sent">✓ {s.message}</span>}
      <Modal open={open} onClose={() => setOpen(false)} title={`Send ${monthName} reminders?`}>
        <form action={action} className="i9-stack" style={{ gap: 16 }}>
          <input type="hidden" name="month" value={month} />
          <p className="text">Each of these consultants gets one email from timesheets@ listing exactly which weeks are missing:</p>
          <ul className="hr-missing">{people.map((p) => <li key={p.name}>{p.name} <span className="muted">· {p.count} week{p.count === 1 ? "" : "s"} missing</span></li>)}</ul>
          {s.error && <p className="form-status err" role="alert">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Sending…" : `Send ${people.length} reminder${people.length === 1 ? "" : "s"}`}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ReviewForm({ id, status }: { id: string; status: string }) {
  const [s, action, pending] = useActionState(reviewTimesheet, {} as ActionState);
  return (
    <form action={action} className="form-card">
      <input type="hidden" name="id" value={id} />
      <h2 className="i9-h3">Review</h2>
      <p className="muted i9-small">Open the attachment above. Approve only if it shows the client&apos;s approval and the hours match. The consultant is emailed either way.</p>
      <label className="field">Comment to consultant (required to reject)<textarea name="note" rows={2} style={{ minHeight: 70 }} placeholder="e.g. The timesheet is not approved. Please upload the approved timesheet." /></label>
      <Status s={s} />
      <div className="btn-row">
        {status === "submitted" && <button className="btn btn-primary" name="decision" value="approve" disabled={pending}>Approve</button>}
        <button className="btn btn-outline" name="decision" value="reject" disabled={pending}>Reject</button>
      </div>
    </form>
  );
}
