import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { statusLabels } from "@/lib/i9/forms";
import { addDays } from "@/lib/portal/dates";
import HrNav from "../HrNav";

function businessDaysAfter(date: string, n: number) {
  let d = date;
  let added = 0;
  while (added < n) {
    d = addDays(d, 1);
    const day = new Date(d + "T00:00:00Z").getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

export default async function I9List() {
  const hr = await requireHr();
  const { data: cases } = await db()
    .from("stagity_i9_cases")
    .select("id, person_id, employee_first_name, employee_last_name, employee_email, first_day, status, everify_case_number")
    .order("created_at", { ascending: false })
    .limit(300);
  return (
    <section className="container hr-page">
      <HrNav active="/hr/i9" email={hr} />
      <h1 className="h2">Form I-9</h1>
      <p className="muted">To start a Form I-9, register the person on the <Link href="/hr/people">People</Link> page (or open them and click &quot;Start Form I-9&quot;).</p>
      <div className="i9-table-wrap">
        <table className="i9-table">
          <thead><tr><th>Employee</th><th>First day</th><th>Section 2 due</th><th>Status</th><th>E-Verify</th></tr></thead>
          <tbody>
            {cases?.map((c) => (
              <tr key={c.id}>
                <td><Link href={`/hr/cases/${c.id}`}>{c.employee_first_name} {c.employee_last_name}</Link><div className="muted i9-small">{c.employee_email}</div></td>
                <td>{c.first_day ?? "—"}</td>
                <td>{c.first_day && ["invited", "section1_complete"].includes(c.status) ? businessDaysAfter(c.first_day, 3) : "—"}</td>
                <td><span className={`i9-badge s-${c.status}`}>{statusLabels[c.status] ?? c.status}</span></td>
                <td>{c.everify_case_number ?? "—"}</td>
              </tr>
            ))}
            {!cases?.length && <tr><td colSpan={5} className="muted">No Form I-9 cases yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
