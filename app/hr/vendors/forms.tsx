"use client";

import { useActionState, useState } from "react";
import { deleteVendor, saveVendor } from "./actions";
import { assignConsultant, unassignConsultant } from "../people/actions";
import { Status } from "../forms";
import type { ActionState } from "../actions";

type V = Partial<{ id: string; name: string; ap_email: string; cc_emails: string | null; address: string | null; payment_terms_days: number; billing_cycle: string; attach_timesheets: boolean; active: boolean; notes: string | null }>;

const opt = <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>;

export function VendorForm({ v, onDone }: { v?: V; onDone?: () => void }) {
  const [s, action, pending] = useActionState(saveVendor, {} as ActionState);
  const isNew = !v?.id;
  return (
    <form action={action} className="i9-stack" key={isNew && s.ok ? s.message : v?.id ?? "new"} style={{ gap: 16 }}>
      {v?.id && <input type="hidden" name="id" value={v.id} />}
      <div className="form-grid">
        <label className="field">Vendor name<input name="name" defaultValue={v?.name} required placeholder="e.g. The Xela Group LLC" /></label>
        <label className="field">Billing
          <select name="cycle" defaultValue={v?.billing_cycle ?? "monthly"}>
            <option value="monthly">Monthly invoice</option>
            <option value="weekly">Weekly invoice</option>
          </select>
        </label>
      </div>
      <label className="field">Send invoices to <span className="muted" style={{ fontWeight: 400 }}>(one or more emails, separated by commas)</span>
        <input name="apEmail" defaultValue={v?.ap_email} required placeholder="accounts@vendor.com, finance@vendor.com" />
      </label>
      <div className="form-grid">
        <label className="field">CC {opt}<input name="ccEmails" defaultValue={v?.cc_emails ?? ""} /></label>
        <label className="field">Expected payment within (days)<input name="terms" type="number" min={0} max={180} defaultValue={v?.payment_terms_days ?? 30} /></label>
      </div>
      <label className="field">Billing address<textarea name="address" defaultValue={v?.address ?? ""} rows={3} style={{ minHeight: 84 }} placeholder={"16803 Dallas Parkway, Suite 300\nAddison, TX 75001"} /></label>
      <label className="i9-check"><input type="checkbox" name="attach" defaultChecked={v?.attach_timesheets ?? true} /> Attach the approved timesheets to invoice emails</label>
      {!isNew && <label className="i9-check"><input type="checkbox" name="active" defaultChecked={v?.active ?? true} /> Active</label>}
      <Status s={s} />
      <div className="btn-row">
        <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Saving…" : isNew ? "Add vendor" : "Save vendor"}</button>
        {onDone && <button type="button" className="btn btn-outline hr-btn-sm" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}

export function EditVendor({ v }: { v: V }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(true)}>Edit vendor</button>;
  return <div className="hr-subpanel hr-full"><VendorForm v={v} onDone={() => setOpen(false)} /></div>;
}

export function DeleteVendorButton({ id, name }: { id: string; name: string }) {
  const [s, action, pending] = useActionState(deleteVendor, {} as ActionState);
  return (
    <form
      action={action}
      onSubmit={(e) => { if (!confirm(`Delete ${name}? Its consultants will be unassigned. This can't be undone.`)) e.preventDefault(); }}
      className="i9-stack"
      style={{ gap: 8 }}
    >
      <input type="hidden" name="id" value={id} />
      <button className="btn hr-btn-danger hr-btn-sm" disabled={pending}>{pending ? "Deleting…" : "Delete vendor"}</button>
      <Status s={s} />
    </form>
  );
}

type Person = { id: string; name: string };
export type Assigned = Person & {
  pay_rate: number | null; bill_rate: number | null; client_name: string | null;
  client_manager_name: string | null; client_manager_email: string | null; po_number: string | null;
};

/** Add a consultant to this vendor (or edit their rates): pay rate, bill rate, client and PO. */
export function AssignForm({ vendorId, people, current, onDone }: { vendorId: string; people: Person[]; current?: Assigned; onDone?: () => void }) {
  const [s, action, pending] = useActionState(assignConsultant, {} as ActionState);
  if (s.ok && !current) return <p className="form-status ok">Consultant added.</p>;
  return (
    <form action={action} className="i9-stack hr-subpanel" style={{ gap: 14 }}>
      <input type="hidden" name="vendorId" value={vendorId} />
      {current ? (
        <input type="hidden" name="personId" value={current.id} />
      ) : (
        <label className="field">Consultant
          <select name="personId" required defaultValue="">
            <option value="" disabled>{people.length ? "Choose a consultant…" : "No one left to add. Register them on People first."}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <div className="form-grid">
        <label className="field">Pay rate ($/h, for payroll)<input name="payRate" type="number" step="0.01" min="0" required defaultValue={current?.pay_rate ?? ""} /></label>
        <label className="field">Bill rate ($/h, for invoices)<input name="billRate" type="number" step="0.01" min="0" required defaultValue={current?.bill_rate ?? ""} /></label>
        <label className="field">Client {opt}<input name="clientName" defaultValue={current?.client_name ?? ""} /></label>
        <label className="field">PO / reference {opt}<input name="poNumber" defaultValue={current?.po_number ?? ""} /></label>
        <label className="field">Client manager {opt}<input name="managerName" defaultValue={current?.client_manager_name ?? ""} /></label>
        <label className="field">Client manager email {opt}<input name="managerEmail" type="email" defaultValue={current?.client_manager_email ?? ""} /></label>
      </div>
      <Status s={s} />
      <div className="btn-row">
        <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Saving…" : current ? "Save rates" : "Add consultant"}</button>
        {onDone && <button type="button" className="btn btn-outline hr-btn-sm" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}

export function AddConsultant({ vendorId, people }: { vendorId: string; people: Person[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(true)}>＋ Add consultant</button>;
  return <AssignForm vendorId={vendorId} people={people} onDone={() => setOpen(false)} />;
}

export function ConsultantRow({ vendorId, c }: { vendorId: string; c: Assigned }) {
  const [edit, setEdit] = useState(false);
  const money = (n: number | null) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);
  return (
    <div className="hr-crow-wrap">
      <div className="hr-crow">
        <span className="hr-crow-name">
          <a href={`/hr/people/${c.id}`}><strong>{c.name}</strong></a>
          <span className="muted i9-small">{[c.client_name, c.po_number ? `PO ${c.po_number}` : ""].filter(Boolean).join(" · ") || "No client set"}</span>
        </span>
        <span className="hr-rate"><span className="muted i9-small">Pay</span>{money(c.pay_rate)}/h</span>
        <span className="hr-rate"><span className="muted i9-small">Bill</span>{money(c.bill_rate)}/h</span>
        <span className="hr-crow-actions">
          <button type="button" className="hr-link" onClick={() => setEdit((e) => !e)}>{edit ? "Close" : "Edit"}</button>
          <form action={unassignConsultant} onSubmit={(e) => { if (!confirm(`Take ${c.name} off this vendor?`)) e.preventDefault(); }}>
            <input type="hidden" name="personId" value={c.id} />
            <button className="hr-link danger">Unassign</button>
          </form>
        </span>
      </div>
      {edit && <AssignForm vendorId={vendorId} people={[]} current={c} onDone={() => setEdit(false)} />}
    </div>
  );
}
