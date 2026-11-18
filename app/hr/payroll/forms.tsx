"use client";

import { useActionState, useEffect, useState } from "react";
import { addItem, createRun, resetItem, saveItem } from "./actions";
import { ModalButton } from "../Modal";
import { Status } from "../forms";
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

export type Line = {
  id: string; name: string; regular_hours: number; overtime_hours: number; rate: number; flat_amount: number | null;
  bonus: number; reimbursement: number; note: string | null; manual: boolean;
};

const L = ({ t, hint }: { t: string; hint?: string }) => <span>{t}{hint && <span className="field-hint"> ({hint})</span>}</span>;

function LineForm({ line, close }: { line: Line; close: () => void }) {
  const [s, action, pending] = useActionState(saveItem, {} as ActionState);
  const [reset, resetAction, resetting] = useActionState(resetItem, {} as ActionState);
  const [type, setType] = useState<"hourly" | "flat">(line.flat_amount != null ? "flat" : "hourly");
  useEffect(() => {
    if (s.ok || reset.ok) {
      const t = setTimeout(close, 700);
      return () => clearTimeout(t);
    }
  }, [s, reset, close]);
  return (
    <div className="i9-stack" style={{ gap: 16 }}>
      <form action={action} className="i9-stack" style={{ gap: 16 }}>
        <input type="hidden" name="id" value={line.id} />
        <input type="hidden" name="payType" value={type} />
        <div className="hr-seg" role="radiogroup" aria-label="Pay type">
          <button type="button" className={type === "hourly" ? "on" : ""} onClick={() => setType("hourly")}>Hours × rate</button>
          <button type="button" className={type === "flat" ? "on" : ""} onClick={() => setType("flat")}>Flat amount</button>
        </div>
        {type === "flat" ? (
          <label className="field"><L t="Amount for this month ($)" /><input name="flat" type="number" step="0.01" min="0" defaultValue={line.flat_amount ?? ""} placeholder="e.g. 7000" autoFocus /></label>
        ) : null}
        <div className="form-grid">
          <label className="field"><L t="Regular hours" hint={type === "flat" ? "for reference" : undefined} /><input name="regular" type="number" step="0.01" min="0" defaultValue={line.regular_hours} /></label>
          <label className="field"><L t="Overtime hours" hint={type === "flat" ? "for reference" : "paid 1.5×"} /><input name="overtime" type="number" step="0.01" min="0" defaultValue={line.overtime_hours} /></label>
          {type === "hourly" && <label className="field"><L t="Pay rate ($/h)" /><input name="rate" type="number" step="0.01" min="0" defaultValue={line.rate} /></label>}
          {type === "flat" && <input type="hidden" name="rate" value={line.rate} />}
          <label className="field"><L t="Bonus ($)" hint="optional" /><input name="bonus" type="number" step="0.01" min="0" defaultValue={line.bonus || ""} /></label>
          <label className="field"><L t="Reimbursement ($)" hint="optional" /><input name="reimbursement" type="number" step="0.01" min="0" defaultValue={line.reimbursement || ""} /></label>
        </div>
        <label className="field"><L t="Note" hint="optional" /><input name="note" defaultValue={line.note ?? ""} /></label>
        <Status s={s} />
        <div className="hr-modal-actions">
          <button type="button" className="btn btn-outline hr-btn-sm" onClick={close}>Cancel</button>
          <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        </div>
      </form>
      {line.manual && (
        <form action={resetAction} className="i9-stack" style={{ gap: 6, borderTop: "1px solid var(--line, #e5e7eb)", paddingTop: 12 }}>
          <input type="hidden" name="id" value={line.id} />
          <p className="muted i9-small">You changed this line by hand, so recalculating keeps your numbers.</p>
          <button className="btn btn-outline hr-btn-sm" disabled={resetting} style={{ alignSelf: "flex-start" }}>{resetting ? "Recalculating…" : "Undo my changes (recalculate)"}</button>
          <Status s={reset} />
        </form>
      )}
    </div>
  );
}

/** "Edit" on a payroll line: opens a pop-up to change hours, rate, flat amount, bonus, etc. */
export function EditLineButton({ line }: { line: Line }) {
  return (
    <ModalButton label="Edit" title={`Edit pay: ${line.name}`} className="btn btn-outline hr-btn-xs">
      {(close) => <LineForm line={line} close={close} />}
    </ModalButton>
  );
}

/** Adds someone who isn't on this payroll yet, with a flat amount. */
export function AddLineButton({ runId, people }: { runId: string; people: { id: string; name: string }[] }) {
  return (
    <ModalButton label={<><span aria-hidden="true">＋</span> Add someone</>} title="Add to this payroll" className="btn btn-outline hr-btn-sm">
      {(close) => <AddLineForm runId={runId} people={people} close={close} />}
    </ModalButton>
  );
}

function AddLineForm({ runId, people, close }: { runId: string; people: { id: string; name: string }[]; close: () => void }) {
  const [s, action, pending] = useActionState(addItem, {} as ActionState);
  useEffect(() => {
    if (s.ok) {
      const t = setTimeout(close, 700);
      return () => clearTimeout(t);
    }
  }, [s, close]);
  return (
    <form action={action} className="i9-stack" style={{ gap: 16 }}>
      <input type="hidden" name="runId" value={runId} />
      <label className="field"><L t="Person" />
        <select name="personId" required defaultValue="">
          <option value="" disabled>{people.length ? "Choose…" : "Everyone is already on this payroll"}</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="field"><L t="Amount ($)" /><input name="amount" type="number" step="0.01" min="0" required /></label>
      <label className="field"><L t="Note" hint="optional" /><input name="note" /></label>
      <Status s={s} />
      <div className="hr-modal-actions">
        <button type="button" className="btn btn-outline hr-btn-sm" onClick={close}>Cancel</button>
        <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
      </div>
    </form>
  );
}
