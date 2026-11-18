"use client";

import { useActionState, useEffect } from "react";
import { deleteVendor, saveVendor } from "./actions";
import { assignConsultant, unassignConsultant } from "../people/actions";
import { Status } from "../forms";
import { ConfirmAction, ModalButton } from "../Modal";
import type { ActionState } from "../actions";

type V = Partial<{ id: string; name: string; ap_email: string; cc_emails: string | null; address: string | null; payment_terms_days: number; billing_cycle: string; attach_timesheets: boolean; active: boolean; notes: string | null }>;
type Person = { id: string; name: string };
export type Assigned = Person & {
  pay_rate: number | null; bill_rate: number | null; client_name: string | null;
  client_manager_name: string | null; client_manager_email: string | null; po_number: string | null;
};

const L = ({ t, hint }: { t: string; hint?: string }) => <span>{t}{hint && <span className="field-hint"> ({hint})</span>}</span>;
const money = (n: number | null) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);

/** Closes the pop-up a moment after a successful save. */
function useCloseOnSuccess(s: ActionState, close?: () => void) {
  useEffect(() => {
    if (s.ok && close) {
      const t = setTimeout(close, 900);
      return () => clearTimeout(t);
    }
  }, [s, close]);
}

function RateFields({ current }: { current?: Assigned }) {
  return (
    <div className="form-grid">
      <label className="field"><L t="Pay rate ($/h)" hint="payroll" /><input name="payRate" type="number" step="0.01" min="0" defaultValue={current?.pay_rate ?? ""} placeholder="e.g. 55" /></label>
      <label className="field"><L t="Bill rate ($/h)" hint="invoice" /><input name="billRate" type="number" step="0.01" min="0" defaultValue={current?.bill_rate ?? ""} placeholder="e.g. 70" /></label>
      <label className="field"><L t="Client" hint="optional" /><input name="clientName" defaultValue={current?.client_name ?? ""} /></label>
      <label className="field"><L t="PO / reference" hint="optional" /><input name="poNumber" defaultValue={current?.po_number ?? ""} /></label>
    </div>
  );
}

export function VendorForm({ v, close, consultants = [] }: { v?: V; close?: () => void; consultants?: Person[] }) {
  const [s, action, pending] = useActionState(saveVendor, {} as ActionState);
  useCloseOnSuccess(s, close);
  const isNew = !v?.id;
  return (
    <form action={action} className="i9-stack" style={{ gap: 16 }}>
      {v?.id && <input type="hidden" name="id" value={v.id} />}
      <div className="form-grid">
        <label className="field"><L t="Vendor name" /><input name="name" defaultValue={v?.name} required placeholder="e.g. The Xela Group LLC" /></label>
        <label className="field"><L t="Invoice" />
          <select name="cycle" defaultValue={v?.billing_cycle ?? "monthly"}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
      </div>
      <label className="field"><L t="Send invoices to" hint="one or more emails, separated by commas" />
        <input name="apEmail" defaultValue={v?.ap_email} required placeholder="accounts@vendor.com, finance@vendor.com" />
      </label>
      <div className="form-grid">
        <label className="field"><L t="CC" hint="optional" /><input name="ccEmails" defaultValue={v?.cc_emails ?? ""} /></label>
        <label className="field"><L t="Expected payment within (days)" /><input name="terms" type="number" min={0} max={180} defaultValue={v?.payment_terms_days ?? 30} /></label>
      </div>
      <label className="field"><L t="Billing address" /><textarea name="address" defaultValue={v?.address ?? ""} rows={3} style={{ minHeight: 84 }} placeholder={"16803 Dallas Parkway, Suite 300\nAddison, TX 75001"} /></label>
      <label className="i9-check"><input type="checkbox" name="attach" defaultChecked={v?.attach_timesheets ?? true} /> Attach the approved timesheets to invoice emails</label>
      {!isNew && <label className="i9-check"><input type="checkbox" name="active" defaultChecked={v?.active ?? true} /> Active</label>}

      {isNew && (
        <>
          <p className="hr-section-label">Consultant on this vendor <span className="field-hint" style={{ textTransform: "none", letterSpacing: 0 }}>(optional, you can add more later)</span></p>
          <label className="field"><L t="Consultant" />
            <select name="personId" defaultValue="">
              <option value="">{consultants.length ? "Skip for now" : "No unassigned consultants. Register them on People first."}</option>
              {consultants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <RateFields />
        </>
      )}

      <Status s={s} />
      <div className="hr-modal-actions">
        {close && <button type="button" className="btn btn-outline hr-btn-sm" onClick={close}>Cancel</button>}
        <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Saving…" : isNew ? "Add vendor" : "Save vendor"}</button>
      </div>
    </form>
  );
}

/** Add a consultant to a vendor (or edit their rates). */
export function AssignForm({ vendorId, people, current, close }: { vendorId: string; people: Person[]; current?: Assigned; close?: () => void }) {
  const [s, action, pending] = useActionState(assignConsultant, {} as ActionState);
  useCloseOnSuccess(s, close);
  return (
    <form action={action} className="i9-stack" style={{ gap: 16 }}>
      <input type="hidden" name="vendorId" value={vendorId} />
      {current ? (
        <input type="hidden" name="personId" value={current.id} />
      ) : (
        <label className="field"><L t="Consultant" />
          <select name="personId" required defaultValue="">
            <option value="" disabled>{people.length ? "Choose a consultant…" : "No one left to add. Register them on People first."}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <RateFields current={current} />
      <div className="form-grid">
        <label className="field"><L t="Client manager" hint="optional" /><input name="managerName" defaultValue={current?.client_manager_name ?? ""} /></label>
        <label className="field"><L t="Client manager email" hint="optional" /><input name="managerEmail" type="email" defaultValue={current?.client_manager_email ?? ""} /></label>
      </div>
      <Status s={s} />
      <div className="hr-modal-actions">
        {close && <button type="button" className="btn btn-outline hr-btn-sm" onClick={close}>Cancel</button>}
        <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Saving…" : current ? "Save rates" : "Add consultant"}</button>
      </div>
    </form>
  );
}

export function AddVendorButton({ consultants }: { consultants: Person[] }) {
  return (
    <ModalButton label={<><span aria-hidden="true">＋</span> Add vendor</>} title="Add a vendor" wide>
      {(close) => <VendorForm close={close} consultants={consultants} />}
    </ModalButton>
  );
}

export function VendorActions({ v }: { v: V & { id: string; name: string } }) {
  return (
    <div className="btn-row">
      <ModalButton label="Edit" title={`Edit ${v.name}`} className="btn btn-outline hr-btn-sm" wide>
        {(close) => <VendorForm v={v} close={close} />}
      </ModalButton>
      <ConfirmAction
        action={deleteVendor}
        fields={{ id: v.id }}
        label="Delete"
        title="Delete vendor?"
        message={<>Are you sure you want to delete <strong>{v.name}</strong>? Its consultants will be unassigned. This can&apos;t be undone.</>}
        confirmLabel="Yes, delete vendor"
      />
    </div>
  );
}

export function AddConsultant({ vendorId, vendorName, people }: { vendorId: string; vendorName: string; people: Person[] }) {
  return (
    <ModalButton label={<><span aria-hidden="true">＋</span> Add consultant</>} title={`Add a consultant to ${vendorName}`} className="btn btn-outline hr-btn-sm hr-add-row" wide>
      {(close) => <AssignForm vendorId={vendorId} people={people} close={close} />}
    </ModalButton>
  );
}

export function ConsultantRow({ vendorId, c }: { vendorId: string; c: Assigned }) {
  const margin = c.pay_rate != null && c.bill_rate != null ? Number(c.bill_rate) - Number(c.pay_rate) : null;
  return (
    <tr>
      <td>
        <a href={`/hr/people/${c.id}`}><strong>{c.name}</strong></a>
        {c.po_number && <div className="muted i9-small">PO {c.po_number}</div>}
      </td>
      <td>{c.client_name ?? <span className="muted">—</span>}</td>
      <td className="i9-num">{money(c.pay_rate)}</td>
      <td className="i9-num">{money(c.bill_rate)}</td>
      <td className="i9-num">{margin == null ? "—" : <span style={{ color: margin < 0 ? "#b91c1c" : "#15803d" }}>{money(margin)}</span>}</td>
      <td className="hr-td-actions">
        <ModalButton label="Edit" title={`Rates for ${c.name}`} className="hr-link" wide>
          {(close) => <AssignForm vendorId={vendorId} people={[]} current={c} close={close} />}
        </ModalButton>
        <ConfirmAction
          action={unassignConsultant}
          fields={{ personId: c.id }}
          label="Unassign"
          className="hr-link danger"
          title="Unassign consultant?"
          message={<>Take <strong>{c.name}</strong> off this vendor? Their timesheets won&apos;t be invoiced until you add them to a vendor again.</>}
          confirmLabel="Yes, unassign"
        />
      </td>
    </tr>
  );
}
