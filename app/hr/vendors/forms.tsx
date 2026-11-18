"use client";

import { useActionState } from "react";
import { saveVendor } from "./actions";
import { Status } from "../forms";
import type { ActionState } from "../actions";

type V = Partial<{ id: string; name: string; ap_email: string; cc_emails: string | null; address: string | null; payment_terms_days: number; billing_cycle: string; attach_timesheets: boolean; active: boolean; notes: string | null }>;

export function VendorForm({ v }: { v?: V }) {
  const [s, action, pending] = useActionState(saveVendor, {} as ActionState);
  const isNew = !v?.id;
  return (
    <form action={action} className="i9-stack" key={isNew && s.ok ? s.message : v?.id ?? "new"}>
      {v?.id && <input type="hidden" name="id" value={v.id} />}
      <div className="form-grid">
        <label className="field">Vendor name<input name="name" defaultValue={v?.name} required /></label>
        <label className="field">Send invoices to (one or more emails, separated by commas)<input name="apEmail" defaultValue={v?.ap_email} required placeholder="accounts@vendor.com, finance@vendor.com" /></label>
        <label className="field">CC (optional, comma-separated)<input name="ccEmails" defaultValue={v?.cc_emails ?? ""} /></label>
        <label className="field">Expected payment within (days, for your tracking)<input name="terms" type="number" min={0} max={180} defaultValue={v?.payment_terms_days ?? 30} /></label>
        <label className="field">Invoice
          <select name="cycle" defaultValue={v?.billing_cycle ?? "monthly"}>
            <option value="monthly">Monthly (one invoice per consultant per month)</option>
            <option value="weekly">Weekly (one invoice per approved week)</option>
          </select>
        </label>
      </div>
      <label className="field">Billing address<textarea name="address" defaultValue={v?.address ?? ""} rows={3} style={{ minHeight: 84 }} placeholder={"Vendor Inc.\n123 Street, Suite 100\nCity, ST 00000"} /></label>
      <label className="i9-check"><input type="checkbox" name="attach" defaultChecked={v?.attach_timesheets ?? true} /> Attach the client-approved timesheets to invoice emails</label>
      {!isNew && <label className="i9-check"><input type="checkbox" name="active" defaultChecked={v?.active ?? true} /> Active</label>}
      <Status s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : isNew ? "Add vendor" : "Save"}</button>
    </form>
  );
}
