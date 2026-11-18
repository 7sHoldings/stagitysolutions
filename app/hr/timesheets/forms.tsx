"use client";

import { useActionState } from "react";
import { recheckTimesheet, remindConsultant, reviewTimesheet } from "./actions";
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
      <p className="muted i9-small">Check that the hours match the client-approved timesheet and that it shows the client&apos;s approval.</p>
      <label className="field">Note to consultant (required to send back)<textarea name="note" rows={2} style={{ minHeight: 70 }} /></label>
      <Status s={s} />
      <div className="btn-row">
        {status === "submitted" && <button className="btn btn-primary" name="decision" value="approve" disabled={pending}>Approve</button>}
        <button className="btn btn-outline" name="decision" value="reject" disabled={pending}>Send back</button>
      </div>
    </form>
  );
}

export function RecheckButton({ id }: { id: string }) {
  const [s, action, pending] = useActionState(recheckTimesheet, {} as ActionState);
  return (
    <form action={action} className="i9-stack" style={{ gap: 6 }}>
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-outline" disabled={pending} style={{ alignSelf: "flex-start", minHeight: 38, padding: "6px 16px", fontSize: 14 }}>
        {pending ? "Checking…" : "Check again"}
      </button>
      <Status s={s} />
    </form>
  );
}
