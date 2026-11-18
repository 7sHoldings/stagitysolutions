"use client";

import { useActionState, useState } from "react";
import { registerPerson, resetPassword, startI9, updatePerson } from "./actions";
import { Status } from "../forms";
import type { ActionState } from "../actions";

type P = Partial<{
  id: string; first_name: string; last_name: string; email: string; phone: string | null; kind: string;
  client_name: string | null; client_manager_name: string | null; client_manager_email: string | null;
  pay_rate: number | null; start_date: string | null; end_date: string | null; adp_employee_id: string | null;
  vendor_id: string | null; bill_rate: number | null; bill_ot_rate: number | null; po_number: string | null;
}>;
export type VendorOption = { id: string; name: string };

function Fields({ p, isNew, vendors }: { p: P; isNew: boolean; vendors: VendorOption[] }) {
  const [kind, setKind] = useState(p.kind ?? "consultant");
  return (
    <>
      <div className="form-grid">
        <label className="field">Type
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="consultant">Consultant (submits timesheets)</option>
            <option value="employee">Employee (no timesheets)</option>
          </select>
        </label>
        <label className="field">First name<input name="first" defaultValue={p.first_name} required /></label>
        <label className="field">Last name<input name="last" defaultValue={p.last_name} required /></label>
        <label className="field">Email{isNew ? <input name="email" type="email" required /> : <input value={p.email} disabled />}</label>
        <label className="field">Phone<input name="phone" type="tel" defaultValue={p.phone ?? ""} /></label>
        <label className="field">Start date<input name="startDate" type="date" defaultValue={p.start_date ?? ""} /></label>
        <label className="field">Hourly pay rate ($)<input name="payRate" type="number" step="0.01" min="0" defaultValue={p.pay_rate ?? ""} required={kind === "consultant"} /></label>
        <label className="field">ADP employee ID<input name="adpId" defaultValue={p.adp_employee_id ?? ""} placeholder="From ADP RUN" /></label>
        {!isNew && <label className="field">End date<input name="endDate" type="date" defaultValue={p.end_date ?? ""} /></label>}
      </div>
      {kind === "consultant" && (
        <div className="form-grid">
          <label className="field">Client<input name="clientName" defaultValue={p.client_name ?? ""} /></label>
          <label className="field">Client manager<input name="managerName" defaultValue={p.client_manager_name ?? ""} /></label>
          <label className="field">Client manager email<input name="managerEmail" type="email" defaultValue={p.client_manager_email ?? ""} /></label>
          <label className="field">Vendor (who you invoice)
            <select name="vendorId" defaultValue={p.vendor_id ?? ""}>
              <option value="">— none —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label className="field">Bill rate to vendor ($/h)<input name="billRate" type="number" step="0.01" min="0" defaultValue={p.bill_rate ?? ""} /></label>
          <label className="field">PO / reference number<input name="poNumber" defaultValue={p.po_number ?? ""} /></label>
        </div>
      )}
    </>
  );
}

export function RegisterForm({ vendors }: { vendors: VendorOption[] }) {
  const [s, action, pending] = useActionState(registerPerson, {} as ActionState);
  return (
    <form action={action} className="form-card" key={s.ok ? s.message : "new"}>
      <h2 className="i9-h3">Register a person</h2>
      <p className="muted i9-small">They&apos;ll get an email with the portal link and a temporary password (valid 7 days).</p>
      <Fields p={{}} isNew vendors={vendors} />
      <label className="i9-check"><input type="checkbox" name="startI9" defaultChecked /> Start their Form I-9 now (uses the start date as the first day of work)</label>
      <Status s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Registering…" : "Register and send login"}</button>
    </form>
  );
}

export function EditPersonForm({ p, vendors }: { p: P; vendors: VendorOption[] }) {
  const [s, action, pending] = useActionState(updatePerson, {} as ActionState);
  return (
    <form action={action} className="form-card">
      <input type="hidden" name="id" value={p.id} />
      <h2 className="i9-h3">Details</h2>
      <Fields p={p} isNew={false} vendors={vendors} />
      <Status s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "Save"}</button>
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
