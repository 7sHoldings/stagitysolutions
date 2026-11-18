"use client";

import { useActionState } from "react";
import { saveEverify, saveRecordInfo, type ActionState } from "./actions";

export function Status({ s }: { s: ActionState }) {
  if (s.error) return <p className="form-status err" role="alert">{s.error}</p>;
  if (s.message) return <p className="form-status ok" role="status">{s.message}</p>;
  return null;
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
