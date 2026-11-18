import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { money } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import { ConfirmAction } from "../Modal";
import { deletePerson } from "./actions";
import { RegisterButton } from "./forms";

export default async function People() {
  const hr = await requireHr();
  const { data: people } = await db()
    .from("stagity_people")
    .select("id, first_name, last_name, email, kind, active, client_name, pay_rate, bill_rate, must_change_password, monthly_pay, stagity_vendors(name)")
    .order("last_name");
  return (
    <section className="container hr-page">
      <HrNav active="/hr/people" email={hr} />
      <div className="hr-title">
        <div>
          <h1 className="h2">People</h1>
          <p className="muted">Register consultants and employees; they get a login by email. Pay and bill rates are set on the Vendors page.</p>
        </div>
        <RegisterButton />
      </div>

      {people?.length ? (
        <div className="hr-cards">
          {people.map((p) => {
            const vendor = (p.stagity_vendors as unknown as { name: string } | null)?.name;
            const name = `${p.first_name} ${p.last_name}`;
            return (
              <div key={p.id} className="hr-person">
                <span className="hr-avatar" aria-hidden="true">{(p.first_name[0] ?? "").toUpperCase()}{(p.last_name[0] ?? "").toUpperCase()}</span>
                <Link href={`/hr/people/${p.id}`} className="hr-person-main">
                  <strong>{name}</strong>
                  <span className="muted i9-small">{p.email ?? "Payroll only (no login)"}</span>
                  <span className="i9-small">
                    {p.kind === "employee" ? "Employee" : vendor ? `${vendor}${p.client_name ? ` · ${p.client_name}` : ""}` : <span style={{ color: "#b45309" }}>Not on a vendor yet</span>}
                  </span>
                </Link>
                <span className="hr-person-side">
                  <span className={`i9-badge ${!p.active ? "s-cancelled" : !p.email || !p.must_change_password ? "s-closed" : "s-section1_complete"}`}>
                    {!p.active ? "Inactive" : !p.email ? "Active" : p.must_change_password ? "Invited" : "Active"}
                  </span>
                  {p.monthly_pay != null ? (
                    <span className="muted i9-small">Pay {money(Number(p.monthly_pay))}/mo{p.bill_rate != null ? ` · Bill ${money(Number(p.bill_rate))}/h` : ""}</span>
                  ) : p.pay_rate != null && (
                    <span className="muted i9-small">Pay {money(Number(p.pay_rate))}/h{p.bill_rate != null ? ` · Bill ${money(Number(p.bill_rate))}/h` : ""}</span>
                  )}
                  <span className="hr-person-actions">
                    <Link href={`/hr/people/${p.id}`} className="hr-link">Open</Link>
                    <ConfirmAction
                      action={deletePerson}
                      fields={{ id: p.id }}
                      label="Delete"
                      className="hr-link danger"
                      title="Delete this person?"
                      message={<>Are you sure you want to delete <strong>{name}</strong>? Their account, timesheets and uploads will be removed. This can&apos;t be undone.</>}
                      confirmLabel="Yes, delete"
                    />
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hr-empty">
          <strong>No one registered yet</strong>
          <span className="muted">Register your first consultant. They&apos;ll get an email with their login.</span>
        </div>
      )}
    </section>
  );
}
