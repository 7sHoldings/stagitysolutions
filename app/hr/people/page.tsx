import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { money } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import Panel from "../Panel";
import { RegisterForm } from "./forms";

export default async function People() {
  const hr = await requireHr();
  const { data: people } = await db()
    .from("stagity_people")
    .select("id, first_name, last_name, email, kind, active, client_name, pay_rate, bill_rate, must_change_password, stagity_vendors(name)")
    .order("last_name");
  return (
    <section className="container hr-page">
      <HrNav active="/hr/people" email={hr} />
      <div className="hr-title">
        <div>
          <h1 className="h2">People</h1>
          <p className="muted">Register consultants and employees; they get a login by email. Pay and bill rates are added on the Vendors page.</p>
        </div>
      </div>
      <Panel label="Register a person" title="Register a person">
        <RegisterForm />
      </Panel>
      <div className="hr-cards">
        {people?.map((p) => {
          const vendor = (p.stagity_vendors as unknown as { name: string } | null)?.name;
          return (
            <Link key={p.id} href={`/hr/people/${p.id}`} className="hr-person">
              <span className="hr-avatar" aria-hidden="true">{(p.first_name[0] ?? "").toUpperCase()}{(p.last_name[0] ?? "").toUpperCase()}</span>
              <span className="hr-person-main">
                <strong>{p.first_name} {p.last_name}</strong>
                <span className="muted i9-small">{p.email}</span>
                <span className="i9-small">
                  {p.kind === "employee" ? "Employee" : vendor ? `${vendor}${p.client_name ? ` · ${p.client_name}` : ""}` : <span style={{ color: "#b45309" }}>Not added to a vendor yet</span>}
                </span>
              </span>
              <span className="hr-person-side">
                <span className={`i9-badge ${!p.active ? "s-cancelled" : p.must_change_password ? "s-section1_complete" : "s-closed"}`}>
                  {!p.active ? "Inactive" : p.must_change_password ? "Invited" : "Active"}
                </span>
                {p.pay_rate != null && (
                  <span className="muted i9-small">Pay {money(Number(p.pay_rate))}/h{p.bill_rate != null ? ` · Bill ${money(Number(p.bill_rate))}/h` : ""}</span>
                )}
              </span>
            </Link>
          );
        })}
        {!people?.length && <p className="muted">No one registered yet.</p>}
      </div>
    </section>
  );
}
