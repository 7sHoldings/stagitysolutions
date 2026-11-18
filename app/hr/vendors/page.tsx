import { db, requireHr } from "@/lib/i9/server";
import HrNav from "../HrNav";
import Panel from "../Panel";
import { AddConsultant, ConsultantRow, DeleteVendorButton, EditVendor, VendorForm, type Assigned } from "./forms";

export default async function Vendors() {
  const hr = await requireHr();
  const [{ data: vendors }, { data: people }] = await Promise.all([
    db().from("stagity_vendors").select("*").order("name"),
    db()
      .from("stagity_people")
      .select("id, first_name, last_name, active, kind, vendor_id, pay_rate, bill_rate, client_name, client_manager_name, client_manager_email, po_number")
      .eq("kind", "consultant")
      .order("last_name"),
  ]);
  const toAssigned = (p: NonNullable<typeof people>[number]): Assigned => ({ ...p, name: `${p.first_name} ${p.last_name}` });
  const unassigned = (people ?? []).filter((p) => p.active && !p.vendor_id).map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));

  return (
    <section className="container hr-page">
      <HrNav active="/hr/vendors" email={hr} />
      <div className="hr-title">
        <div>
          <h1 className="h2">Vendors</h1>
          <p className="muted">The companies you invoice. Add each consultant to their vendor with their pay rate (payroll) and bill rate (invoice).</p>
        </div>
      </div>

      {unassigned.length > 0 && (
        <p className="form-status err">Not on a vendor yet: {unassigned.map((p) => p.name).join(", ")}. Add them below so they get paid and invoiced.</p>
      )}

      <Panel label="Add a vendor" title="Add a vendor">
        <VendorForm />
      </Panel>

      {vendors?.map((v) => {
        const list = (people ?? []).filter((p) => p.vendor_id === v.id).map(toAssigned);
        return (
          <article key={v.id} className={`hr-vendor ${v.active ? "" : "inactive"}`}>
            <div className="hr-vendor-head">
              <div>
                <h2 className="i9-h3">{v.name}{!v.active && <span className="i9-badge s-cancelled" style={{ marginLeft: 10 }}>Inactive</span>}</h2>
                <p className="muted i9-small">
                  Invoices to {v.ap_email}{v.cc_emails ? ` (cc ${v.cc_emails})` : ""} · {v.billing_cycle === "weekly" ? "weekly" : "monthly"} · {v.payment_terms_days} days
                </p>
              </div>
              <div className="btn-row">
                <EditVendor v={v} />
                <DeleteVendorButton id={v.id} name={v.name} />
              </div>
            </div>
            <div className="hr-crows">
              {list.map((c) => <ConsultantRow key={c.id} vendorId={v.id} c={c} />)}
              {!list.length && <p className="muted i9-small" style={{ padding: "6px 0" }}>No consultants yet.</p>}
            </div>
            <AddConsultant vendorId={v.id} people={unassigned} />
          </article>
        );
      })}
      {!vendors?.length && <p className="muted">No vendors yet. Add your first one above.</p>}
    </section>
  );
}
