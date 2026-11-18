"use client";

import { useActionState } from "react";
import { remindConsultant, reviewTimesheet } from "./actions";
import { Status } from "../forms";
import type { ActionState } from "../actions";

export function RemindButton({ personId, month }: { personId: string; month: string }) {
  const [s, action, pending] = useActionState(remindConsultant, {} as ActionState);
  if (s.ok) return <span className="i9-small muted">Sent</span>;
  return (
    <form action={action}>
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="month" value={month} />
      <button className="btn btn-outline" style={{ minHeight: 34, padding: "4px 12px", fontSize: 13 }} disabled={pending} title={s.error}>
        {pending ? "…" : s.error ? "Retry" : "Remind"}
      </button>
    </form>
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
