"use client";

import { useActionState, useState } from "react";
import { createCase, resendInvite, saveEverify, saveRecordInfo, type ActionState } from "./actions";

function Status({ s }: { s: ActionState }) {
  if (s.error) return <p className="form-status err" role="alert">{s.error}</p>;
  if (s.message) return <p className="form-status ok" role="status">{s.message}</p>;
  return null;
}

function CopyLink({ link }: { link?: string }) {
  const [copied, setCopied] = useState(false);
  if (!link) return null;
  return (
    <div className="i9-copy">
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Employee link" />
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function NewCaseForm() {
  const [s, action, pending] = useActionState(createCase, {} as ActionState);
  return (
    <form action={action} className="form-card" key={s.link ?? "new"}>
      <h2 className="i9-h3">Start a new I-9</h2>
      <div className="form-grid">
        <label className="field">First name<input name="first" required autoComplete="off" /></label>
        <label className="field">Last name<input name="last" required autoComplete="off" /></label>
        <label className="field">Employee&apos;s personal email<input name="email" type="email" required autoComplete="off" /></label>
        <label className="field">Job title (optional)<input name="jobTitle" autoComplete="off" /></label>
        <label className="field">First day of work<input name="firstDay" type="date" /></label>
      </div>
      <Status s={s} />
      <CopyLink link={s.link} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Creating…" : "Create and email link"}
      </button>
    </form>
  );
}

export function ResendForm({ id }: { id: string }) {
  const [s, action, pending] = useActionState(resendInvite, {} as ActionState);
  return (
    <form action={action} className="i9-stack">
      <input type="hidden" name="id" value={id} />
      <Status s={s} />
      <CopyLink link={s.link} />
      <button className="btn btn-outline" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Sending…" : "Send a new link"}
      </button>
    </form>
  );
}

export function EverifyForm({ id, caseNumber, result }: { id: string; caseNumber: string; result: string }) {
  const [s, action, pending] = useActionState(saveEverify, {} as ActionState);
  return (
    <form action={action} className="i9-stack">
      <input type="hidden" name="id" value={id} />
      <div className="form-grid">
        <label className="field">E-Verify case number<input name="caseNumber" defaultValue={caseNumber} required /></label>
        <label className="field">
          Result
          <select name="result" defaultValue={result}>
            <option value="">Pending</option>
            <option>Employment Authorized</option>
            <option>Tentative Nonconfirmation (Mismatch)</option>
            <option>Case in Continuance</option>
            <option>Final Nonconfirmation</option>
            <option>Closed</option>
          </select>
        </label>
      </div>
      <Status s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Saving…" : "Save E-Verify details"}
      </button>
    </form>
  );
}

export function RecordForm({ id, terminatedOn, notes }: { id: string; terminatedOn: string; notes: string }) {
  const [s, action, pending] = useActionState(saveRecordInfo, {} as ActionState);
  return (
    <form action={action} className="i9-stack">
      <input type="hidden" name="id" value={id} />
      <label className="field">
        Employment end date (sets the retention date)
        <input name="terminatedOn" type="date" defaultValue={terminatedOn} />
      </label>
      <label className="field">
        Internal notes (not part of the I-9)
        <textarea name="notes" rows={3} defaultValue={notes} style={{ minHeight: 90 }} />
      </label>
      <Status s={s} />
      <button className="btn btn-outline" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
