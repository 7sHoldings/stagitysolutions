"use client";

import { useActionState } from "react";
import { createRun, saveItem } from "./actions";
import type { ActionState } from "../actions";

export function NewRunForm({ defaultMonth }: { defaultMonth: string }) {
  const [s, action, pending] = useActionState(createRun, {} as ActionState);
  return (
    <form action={action} className="form-card">
      <h2 className="i9-h3">Start a payroll</h2>
      <div className="form-grid" style={{ alignItems: "end" }}>
        <label className="field">Month worked<input type="month" name="month" defaultValue={defaultMonth} required /></label>
        <button className="btn btn-primary" disabled={pending}>{pending ? "Calculating…" : "Calculate payroll"}</button>
      </div>
      {s.error && <p className="form-status err">{s.error}</p>}
    </form>
  );
}

export function ItemEditor({ id, bonus, reimbursement, note }: { id: string; bonus: number; reimbursement: number; note: string }) {
  const [s, action, pending] = useActionState(saveItem, {} as ActionState);
  return (
    <form action={action} className="i9-item-edit">
      <input type="hidden" name="id" value={id} />
      <input name="bonus" type="number" step="0.01" min="0" defaultValue={bonus || ""} placeholder="Bonus" aria-label="Bonus" />
      <input name="reimbursement" type="number" step="0.01" min="0" defaultValue={reimbursement || ""} placeholder="Reimb." aria-label="Reimbursement" />
      <input name="note" defaultValue={note} placeholder="Note" aria-label="Note" />
      <button className="btn btn-outline" disabled={pending}>{pending ? "…" : s.ok ? "Saved" : "Save"}</button>
      {s.error && <span className="i9-small" style={{ color: "#b91c1c" }}>{s.error}</span>}
    </form>
  );
}
