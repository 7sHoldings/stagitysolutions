import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { money } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import { RegisterForm } from "./forms";

export default async function People() {
  const hr = await requireHr();
  const { data: people } = await db()
    .from("stagity_people")
    .select("id, first_name, last_name, email, kind, active, client_name, pay_rate, must_change_password, last_login_at")
    .order("last_name");
  return (
    <section className="container i9-page">
      <HrNav active="/hr/people" email={hr} />
      <h1 className="h2">People</h1>
      <RegisterForm />
      <div className="i9-table-wrap">
        <table className="i9-table">
          <thead><tr><th>Name</th><th>Type</th><th>Client</th><th className="i9-num">Rate</th><th>Account</th></tr></thead>
          <tbody>
            {people?.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/hr/people/${p.id}`}>{p.last_name}, {p.first_name}</Link><div className="muted i9-small">{p.email}</div></td>
                <td>{p.kind === "consultant" ? "Consultant" : "Employee"}</td>
                <td>{p.client_name ?? "—"}</td>
                <td className="i9-num">{p.pay_rate != null ? money(Number(p.pay_rate)) + "/h" : "—"}</td>
                <td>
                  <span className={`i9-badge ${!p.active ? "s-cancelled" : p.must_change_password ? "s-section1_complete" : "s-closed"}`}>
                    {!p.active ? "Inactive" : p.must_change_password ? "Hasn't signed in" : "Active"}
                  </span>
                </td>
              </tr>
            ))}
            {!people?.length && <tr><td colSpan={5} className="muted">No one registered yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
