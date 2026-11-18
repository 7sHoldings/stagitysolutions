"use client";

import { useActionState } from "react";
import { deletePerson, registerPerson, resetPassword, startI9, updatePerson } from "./actions";
import { Status } from "../forms";
import type { ActionState } from "../actions";

type P = Partial<{
  id: string; first_name: string; last_name: string; email: string; phone: string | null; kind: string;
  client_name: string | null; client_manager_name: string | null; client_manager_email: string | null;
  pay_rate: number | null; start_date: string | null; end_date: string | null; adp_employee_id: string | null;
  vendor_id: string | null; bill_rate: number | null; bill_ot_rate: number | null; po_number: string | null;
}>;
export type VendorOption = { id: string; name: string };

function Fields({ p, isNew }: { p: P; isNew: boolean }) {
  return (
    <div className="form-grid">
      <label className="field">First name<input name="first" defaultValue={p.first_name} required /></label>
      <label className="field">Last name<input name="last" defaultValue={p.last_name} required /></label>
      <label className="field">Email (their login){isNew ? <input name="email" type="email" required placeholder="name@email.com" /> : <input value={p.email} disabled />}</label>
      <label className="field">Phone<input name="phone" type="tel" defaultValue={p.phone ?? ""} /></label>
      <label className="field">Type
        <select name="kind" defaultValue={p.kind ?? "consultant"}>
          <option value="consultant">Consultant (submits timesheets)</option>
          <option value="employee">Employee (no timesheets)</option>
        </select>
      </label>
      <label className="field">Start date<input name="startDate" type="date" defaultValue={p.start_date ?? ""} /></label>
      {!isNew && <label className="field">End date<input name="endDate" type="date" defaultValue={p.end_date ?? ""} /></label>}
      {!isNew && <label className="field">ADP employee ID<input name="adpId" defaultValue={p.adp_employee_id ?? ""} placeholder="From ADP RUN" /></label>}
    </div>
  );
}

export function RegisterForm() {
  const [s, action, pending] = useActionState(registerPerson, {} as ActionState);
  return (
    <form action={action} className="i9-stack" key={s.ok ? s.message : "new"} style={{ gap: 18 }}>
      <p className="muted i9-small">They&apos;ll get an email with the portal link and a temporary password (valid 7 days). Add their pay and bill rates when you add them to a vendor.</p>
      <Fields p={{}} isNew />
      <label className="i9-check"><input type="checkbox" name="startI9" defaultChecked /> Start their Form I-9 now (uses the start date as the first day of work)</label>
      <Status s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Registering…" : "Register and send login"}</button>
    </form>
  );
}

export function EditPersonForm({ p }: { p: P }) {
  const [s, action, pending] = useActionState(updatePerson, {} as ActionState);
  return (
    <form action={action} className="i9-stack" style={{ gap: 16 }}>
      <input type="hidden" name="id" value={p.id} />
      <Fields p={p} isNew={false} />
      <Status s={s} />
      <button className="btn btn-primary hr-btn-sm" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "Save details"}</button>
    </form>
  );
}

export function DeletePersonButton({ id, name }: { id: string; name: string }) {
  const [s, action, pending] = useActionState(deletePerson, {} as ActionState);
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm(`Delete ${name} permanently? This removes their account, timesheets and uploads, and can't be undone.`)) e.preventDefault(); }}
      className="i9-stack"
      style={{ gap: 8 }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="btn hr-btn-danger hr-btn-sm" disabled={pending}>{pending ? "Deleting…" : "Delete permanently"}</button>
      <Status s={s} />
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: string }) {
  const [s, action, pending] = useActionState(resetPassword, {} as ActionState);
  return (
    <form action={action} className="i9-stack">
      <input type="hidden" name="id" value={id} />
      <Status s={s} />
      <button className="btn btn-outline" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Sending…" : "Email a new temporary password"}</button>
    </form>
  );
}

export function StartI9Form({ id, startDate }: { id: string; startDate: string }) {
  const [s, action, pending] = useActionState(startI9, {} as ActionState);
  return (
    <form action={action} className="i9-stack">
      <input type="hidden" name="id" value={id} />
      <label className="field" style={{ maxWidth: 260 }}>First day of work<input name="firstDay" type="date" defaultValue={startDate} /></label>
      <Status s={s} />
      <button className="btn btn-outline" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Starting…" : "Start Form I-9"}</button>
    </form>
  );
}
