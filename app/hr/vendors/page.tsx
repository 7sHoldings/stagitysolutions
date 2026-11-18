import { db, requireHr } from "@/lib/i9/server";
import HrNav from "../HrNav";
import { AddConsultant, AddVendorButton, ConsultantRow, VendorActions, type Assigned } from "./forms";

export default async function Vendors() {
  const hr = await requireHr();
  const [{ data: vendors }, { data: people }] = await Promise.all([
    db().from("stagity_vendors").select("*").order("name"),
    db()
      .from("stagity_people")
      .select("id, first_name, last_name, active, kind, vendor_id, pay_rate, bill_rate, client_name, client_manager_name, client_manager_email, po_number, payment_terms_days, monthly_pay")
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
          <p className="muted">The companies you invoice, and the consultants on each with their pay rate (payroll) and bill rate (invoice).</p>
        </div>
        <AddVendorButton consultants={unassigned} />
      </div>

      {unassigned.length > 0 && (
        <div className="hr-notice">
          <strong>{unassigned.length} consultant{unassigned.length === 1 ? " isn't" : "s aren't"} on a vendor yet:</strong> {unassigned.map((p) => p.name).join(", ")}.
          Add them to a vendor so they can be paid and invoiced.
        </div>
      )}

      {vendors?.map((v) => {
        const list = (people ?? []).filter((p) => p.vendor_id === v.id).map(toAssigned);
        return (
          <article key={v.id} className={`hr-vendor ${v.active ? "" : "inactive"}`}>
            <div className="hr-vendor-head">
              <div className="hr-vendor-id">
                <span className="hr-vendor-logo" aria-hidden="true">{v.name.trim()[0]?.toUpperCase()}</span>
                <div>
                  <h2 className="i9-h3">{v.name}</h2>
                  <div className="hr-chips">
                    {v.send_invoices === false ? (
                      <span className="hr-chip off">We don&apos;t invoice</span>
                    ) : (
                      <>
                        <span className="hr-chip">{v.billing_cycle === "weekly" ? "Weekly invoice" : "Monthly invoice"}</span>
                        <span className="hr-chip">Net {v.payment_terms_days} default</span>
                      </>
                    )}
                    <span className="hr-chip">{list.length} consultant{list.length === 1 ? "" : "s"}</span>
                    {!v.active && <span className="hr-chip off">Inactive</span>}
                  </div>
                </div>
              </div>
              <VendorActions v={v} />
            </div>
            <p className="muted i9-small hr-vendor-mail">
              {v.send_invoices === false
                ? <>No invoices are made or emailed. Consultants still submit timesheets and are paid through payroll.</>
                : <>Invoices go to <strong>{v.ap_email}</strong>{v.cc_emails ? <> · cc {v.cc_emails}</> : null}</>}
            </p>
            {v.notes && <p className="muted i9-small">{v.notes}</p>}

            {list.length > 0 ? (
              <div className="i9-table-wrap">
                <table className="i9-table hr-ctable">
                  <thead><tr><th>Consultant</th><th>Client</th><th className="i9-num">Pay rate</th><th className="i9-num">Bill rate</th><th className="i9-num">Margin</th><th></th></tr></thead>
                  <tbody>{list.map((c) => <ConsultantRow key={c.id} vendorId={v.id} c={c} invoiced={v.send_invoices !== false} />)}</tbody>
                </table>
              </div>
            ) : (
              <p className="muted i9-small">No consultants on this vendor yet.</p>
            )}
            <AddConsultant vendorId={v.id} vendorName={v.name} people={unassigned} invoiced={v.send_invoices !== false} />
          </article>
        );
      })}
      {!vendors?.length && (
        <div className="hr-empty">
          <strong>No vendors yet</strong>
          <span className="muted">Add the first company you invoice. You can add its consultant and their rates at the same time.</span>
        </div>
      )}
    </section>
  );
}
