"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setInvoiceTerms } from "./actions";
import { markUnpaid } from "../invoices/actions";
import { ConfirmAction, Modal } from "../Modal";
import type { ActionState } from "../actions";

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const nice = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** "Net 45 ✎": change the payment terms of one invoice; shows the new expected date as you type. */
export function TermsButton({ id, issueDate, days }: { id: string; issueDate: string; days: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(days));
  const [s, action, pending] = useActionState(setInvoiceTerms, {} as ActionState);
  useEffect(() => { if (s.ok) setOpen(false); }, [s]);
  const n = Number(value);
  return (
    <>
      <button type="button" className="hr-link" onClick={() => setOpen(true)} title="Change payment terms">Net {days} ✎</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Payment terms">
        <form action={action} className="i9-stack" style={{ gap: 16 }}>
          <input type="hidden" name="id" value={id} />
          <label className="field" style={{ maxWidth: 220 }}>Days after the invoice date
            <input name="days" type="number" min={0} max={365} value={value} onChange={(e) => setValue(e.target.value)} required autoFocus />
          </label>
          <p className="text">
            Invoice date <strong>{nice(issueDate)}</strong> + {Number.isFinite(n) ? n : "…"} days ={" "}
            <strong>{Number.isInteger(n) && n >= 0 ? nice(addDays(issueDate, n)) : "…"}</strong>
          </p>
          {s.error && <p className="form-status err">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function UndoReceived({ id, number }: { id: string; number: string }) {
  return (
    <ConfirmAction
      action={markUnpaid}
      fields={{ id }}
      label="Undo"
      className="hr-link"
      danger={false}
      title="Mark as not received?"
      message={<>Set invoice <strong>#{number}</strong> back to <strong>not received</strong>?</>}
      confirmLabel="Yes, not received"
    />
  );
}

/** Vendor dropdown: keeps the current view and month in the link. */
export function VendorFilter({ vendors, value, base }: { vendors: { id: string; name: string }[]; value: string; base: string }) {
  const router = useRouter();
  return (
    <label className="pay-vendor">
      <span className="muted i9-small">Vendor</span>
      <select value={value} onChange={(e) => router.push(`${base}${e.target.value ? `&vendor=${e.target.value}` : ""}`)} aria-label="Filter by vendor">
        <option value="">All vendors</option>
        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
    </label>
  );
}
