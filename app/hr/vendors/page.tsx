import { db, requireHr } from "@/lib/i9/server";
import HrNav from "../HrNav";
import { VendorForm } from "./forms";

export default async function Vendors() {
  const hr = await requireHr();
  const [{ data: vendors }, { data: people }] = await Promise.all([
    db().from("stagity_vendors").select("*").order("name"),
    db().from("stagity_people").select("vendor_id").eq("active", true).not("vendor_id", "is", null),
  ]);
  const count = (id: string) => people?.filter((p) => p.vendor_id === id).length ?? 0;
  return (
    <section className="container i9-page">
      <HrNav active="/hr/vendors" email={hr} />
      <h1 className="h2">Vendors</h1>
      <p className="muted">The companies you invoice for each consultant&apos;s work. Assign a vendor and bill rate on each consultant&apos;s profile (People).</p>
      <div className="form-card">
        <h2 className="i9-h3">Add a vendor</h2>
        <VendorForm />
      </div>
      {vendors?.map((v) => (
        <details key={v.id} className="form-card">
          <summary className="i9-h3" style={{ cursor: "pointer" }}>
            {v.name} <span className="muted i9-small" style={{ fontWeight: 400 }}>· {v.ap_email} · {v.billing_cycle} · Net {v.payment_terms_days} · {count(v.id)} consultant{count(v.id) === 1 ? "" : "s"}{v.active ? "" : " · inactive"}</span>
          </summary>
          <VendorForm v={v} />
        </details>
      ))}
    </section>
  );
}
