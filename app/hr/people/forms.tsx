"use client";

import { useActionState } from "react";
import { deletePerson, registerPerson, resetPassword, sendPendingLogins, setPay, setSignupDue, startI9, updatePerson } from "./actions";
import { Status } from "../forms";
import type { ActionState } from "../actions";
import { ConfirmAction, ModalButton } from "../Modal";

/** "+ Register a person" button that opens the form in a pop-up. */
export function RegisterButton() {
  return (
    <ModalButton label={<><span aria-hidden="true">＋</span> Register a person</>} title="Register a person" wide>
      {(close) => <RegisterForm close={close} />}
    </ModalButton>
  );
}

type P = Partial<{
  id: string; first_name: string; last_name: string; email: string | null; phone: string | null; kind: string;
  client_name: string | null; client_manager_name: string | null; client_manager_email: string | null;
  pay_rate: number | null; start_date: string | null; end_date: string | null; adp_employee_id: string | null;
  vendor_id: string | null; bill_rate: number | null; bill_ot_rate: number | null; po_number: string | null;
}>;
const inDays = (n: number) => {
  const d = new Date(Date.now() + n * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export type VendorOption = { id: string; name: string };

function Fields({ p, isNew }: { p: P; isNew: boolean }) {
  return (
    <div className="form-grid">
      <label className="field">First name<input name="first" defaultValue={p.first_name} required /></label>
      <label className="field">Last name<input name="last" defaultValue={p.last_name} required /></label>
      <label className="field">
        <span>Email (their login){isNew && <span className="field-hint"> (employees: leave empty for payroll only)</span>}</span>
        {isNew ? <input name="email" type="email" placeholder="name@email.com" /> : p.email ? <input value={p.email} disabled /> : <input name="email" type="email" placeholder="Add an email to give them a login" />}
      </label>
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

export function RegisterForm({ close }: { close?: () => void }) {
  const [s, action, pending] = useActionState(registerPerson, {} as ActionState);
  if (s.ok) {
    return (
      <div className="i9-stack" style={{ gap: 16 }}>
        <p className="form-status ok">{s.message}</p>
        <p className="muted i9-small">Next: add them to their vendor on the Vendors page with their pay rate and bill rate.</p>
        <div className="hr-modal-actions">
          <a className="btn btn-outline hr-btn-sm" href="/hr/vendors">Go to Vendors</a>
          {close && <button type="button" className="btn btn-primary hr-btn-sm" onClick={close}>Done</button>}
        </div>
      </div>
    );
  }
  return (
    <form action={action} className="i9-stack" style={{ gap: 18 }}>
      <p className="muted i9-small">They&apos;ll get an email with the portal link and a temporary password (valid 7 days).</p>
      <Fields p={{}} isNew />
      <label className="field" style={{ maxWidth: 300 }}>
        <span>Finish sign-up by<span className="field-hint"> (daily reminder until then)</span></span>
        <input type="date" name="signupDue" defaultValue={inDays(7)} />
      </label>
      <label className="i9-check"><input type="checkbox" name="startOnboarding" defaultChecked /> Start onboarding (Personal Information, W-4, direct deposit, documents, company documents to sign)</label>
      <label className="i9-check"><input type="checkbox" name="startI9" defaultChecked /> Start their Form I-9 now (uses the start date as the first day of work)</label>
      <Status s={s} />
      <div className="hr-modal-actions">
        {close && <button type="button" className="btn btn-outline hr-btn-sm" onClick={close}>Cancel</button>}
        <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Registering…" : "Register and send login"}</button>
      </div>
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
  return (
    <ConfirmAction
      action={deletePerson}
      fields={{ id }}
      label="Delete permanently"
      title="Delete this person?"
      message={<>Are you sure you want to delete <strong>{name}</strong>? Their account, timesheets and uploads will be removed. This can&apos;t be undone.</>}
      confirmLabel="Yes, delete"
    />
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

/** Payroll pay for someone not on a vendor: flat monthly amount and/or hourly rate. */
export function PayForm({ id, payRate, monthlyPay }: { id: string; payRate: number | null; monthlyPay: number | null }) {
  const [s, action, pending] = useActionState(setPay, {} as ActionState);
  return (
    <form action={action} className="i9-stack" style={{ gap: 14 }}>
      <input type="hidden" name="personId" value={id} />
      <div className="form-grid">
        <label className="field"><span>Flat monthly pay ($)<span className="field-hint"> (paid every month)</span></span><input name="monthlyPay" type="number" step="0.01" min="0" defaultValue={monthlyPay ?? ""} placeholder="e.g. 100" /></label>
        <label className="field"><span>Or hourly rate ($/h)<span className="field-hint"> (from timesheets)</span></span><input name="payRate" type="number" step="0.01" min="0" defaultValue={payRate ?? ""} /></label>
      </div>
      <Status s={s} />
      <button className="btn btn-primary hr-btn-sm" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "Save pay"}</button>
    </form>
  );
}

/** Date until which daily "please set up your account" reminders go out. Empty = stop. */
export function SignupDueForm({ id, due }: { id: string; due: string }) {
  const [s, action, pending] = useActionState(setSignupDue, {} as ActionState);
  return (
    <form action={action} className="i9-stack" style={{ gap: 8 }}>
      <input type="hidden" name="id" value={id} />
      <label className="field" style={{ maxWidth: 260 }}>Remind them daily until<input type="date" name="signupDue" defaultValue={due} /></label>
      <Status s={s} />
      <button className="btn btn-outline hr-btn-sm" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "Save date"}</button>
    </form>
  );
}

/** One tap: send the welcome/login email to everyone added without one yet. */
export function SendLoginsButton({ count }: { count: number }) {
  const [s, action, pending] = useActionState(sendPendingLogins, {} as ActionState);
  return (
    <form action={action} className="i9-stack" style={{ gap: 8 }}>
      {!s.ok && <button className="btn btn-primary hr-btn-sm" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Sending…" : `Send login emails to ${count}`}</button>}
      <Status s={s} />
    </form>
  );
}
