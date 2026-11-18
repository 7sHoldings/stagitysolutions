import Link from "next/link";
import { notFound } from "next/navigation";
import { db, requireHr } from "@/lib/i9/server";
import { statusLabels } from "@/lib/i9/forms";
import { money, sheetLabel } from "@/lib/portal/dates";
import HrNav from "../../HrNav";
import { setActive } from "../actions";
import { DeletePersonButton, EditPersonForm, ResetPasswordForm, StartI9Form } from "../forms";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const hr = await requireHr();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: p } = await db().from("stagity_people").select("*, stagity_vendors(name)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: i9 }, { data: sheets }] = await Promise.all([
    db().from("stagity_i9_cases").select("id, status").eq("person_id", id).neq("status", "cancelled").limit(1).maybeSingle(),
    db().from("stagity_timesheets").select("id, week_start, status, total_hours").eq("person_id", id).order("week_start", { ascending: false }).limit(12),
  ]);
  const vendor = (p.stagity_vendors as { name: string } | null)?.name;

  return (
    <section className="container hr-page">
      <HrNav active="/hr/people" email={hr} />
      <div className="hr-title">
        <div>
          <p><Link href="/hr/people">← People</Link></p>
          <h1 className="h2">{p.first_name} {p.last_name}</h1>
          <p className="muted">
            {p.email} · {p.kind === "employee" ? "Employee" : "Consultant"}
            {p.last_login_at ? ` · last signed in ${new Date(p.last_login_at).toLocaleDateString("en-US")}` : " · hasn't signed in yet"}
          </p>
        </div>
        <span className={`i9-badge ${!p.active ? "s-cancelled" : p.must_change_password ? "s-section1_complete" : "s-closed"}`}>
          {!p.active ? "Inactive" : p.must_change_password ? "Invited" : "Active"}
        </span>
      </div>

      <div className="hr-two">
        <div className="hr-panel">
          <h2 className="i9-h3">Personal details</h2>
          <EditPersonForm p={p} />
        </div>

        <div className="hr-stack">
          {p.kind === "consultant" && (
            <div className="hr-panel">
              <h2 className="i9-h3">Vendor &amp; rates</h2>
              {p.vendor_id ? (
                <dl className="i9-dl">
                  <div className="i9-row"><dt>Vendor</dt><dd>{vendor ?? "—"}</dd></div>
                  <div className="i9-row"><dt>Client</dt><dd>{p.client_name ?? "—"}{p.client_manager_name ? ` · ${p.client_manager_name}` : ""}</dd></div>
                  <div className="i9-row"><dt>Pay rate</dt><dd>{p.pay_rate != null ? `${money(Number(p.pay_rate))}/h` : "—"}</dd></div>
                  <div className="i9-row"><dt>Bill rate</dt><dd>{p.bill_rate != null ? `${money(Number(p.bill_rate))}/h` : "—"}</dd></div>
                  <div className="i9-row"><dt>PO / reference</dt><dd>{p.po_number ?? "—"}</dd></div>
                </dl>
              ) : (
                <p className="muted">Not added to a vendor yet, so there&apos;s no pay rate for payroll or bill rate for invoices.</p>
              )}
              <Link href="/hr/vendors" className="btn btn-outline hr-btn-sm">{p.vendor_id ? "Edit on Vendors page" : "Add to a vendor"}</Link>
            </div>
          )}

          <div className="hr-panel">
            <h2 className="i9-h3">Portal login</h2>
            <p className="muted i9-small">
              {p.must_change_password ? "They haven't set their own password yet." : "They've set their own password."} A new temporary password signs them out everywhere.
            </p>
            <ResetPasswordForm id={id} />
          </div>

          <div className="hr-panel">
            <h2 className="i9-h3">Form I-9</h2>
            {i9 ? (
              <p><Link href={`/hr/cases/${i9.id}`}>Open Form I-9</Link> · <span className={`i9-badge s-${i9.status}`}>{statusLabels[i9.status]}</span></p>
            ) : (
              <StartI9Form id={id} startDate={p.start_date ?? ""} />
            )}
          </div>
        </div>
      </div>

      {p.kind === "consultant" && (
        <div className="hr-panel">
          <h2 className="i9-h3">Recent timesheets</h2>
          {sheets?.length ? (
            <div className="i9-weeks">
              {sheets.map((s) => (
                <Link key={s.id} href={`/hr/timesheets/${s.id}`} className="i9-week">
                  <strong>{sheetLabel(s.week_start)}</strong>
                  <span className="i9-week-right"><span className="i9-small muted">{Number(s.total_hours)} h</span><span className={`i9-dot ${s.status}`}>{s.status}</span></span>
                </Link>
              ))}
            </div>
          ) : <p className="muted">None yet.</p>}
        </div>
      )}

      <div className="hr-panel hr-danger">
        <h2 className="i9-h3">Remove</h2>
        <p className="muted i9-small">
          <strong>Deactivate</strong> stops their login and reminders but keeps their records. <strong>Delete</strong> removes them completely. It&apos;s
          only possible if they have no sent invoices, locked payroll or completed Form I-9, which must be kept.
        </p>
        <div className="btn-row">
          <form action={setActive}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="active" value={p.active ? "false" : "true"} />
            <button className="btn btn-outline hr-btn-sm">{p.active ? "Deactivate" : "Reactivate"}</button>
          </form>
          <DeletePersonButton id={id} name={`${p.first_name} ${p.last_name}`} />
        </div>
      </div>
    </section>
  );
}
