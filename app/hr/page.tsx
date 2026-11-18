import Link from "next/link";
import { db, i9Configured, requireHr } from "@/lib/i9/server";
import { statusLabels } from "@/lib/i9/forms";
import { signOut } from "./login/actions";
import { NewCaseForm } from "./forms";

function businessDaysAfter(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

export default async function HrHome() {
  const cfg = i9Configured();
  if (!cfg.ok) {
    return (
      <section className="container hero" style={{ maxWidth: 720 }}>
        <h1 className="h2">HR portal isn&apos;t set up yet</h1>
        <p className="lead">Add these environment variables in Vercel, then redeploy: {cfg.missing.join(", ")}.</p>
      </section>
    );
  }
  const hr = await requireHr();
  const { data: cases } = await db()
    .from("stagity_i9_cases")
    .select("id, created_at, employee_first_name, employee_last_name, employee_email, first_day, status, everify_case_number")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <section className="container i9-page">
      <div className="hero-row" style={{ alignItems: "center" }}>
        <div>
          <p className="eyebrow">HR portal</p>
          <h1 className="h2">Remote Form I-9</h1>
        </div>
        <form action={signOut} className="i9-signout">
          <span className="muted">{hr}</span>
          <button className="btn btn-outline">Sign out</button>
        </form>
      </div>

      <NewCaseForm />

      <div>
        <h2 className="i9-h3" style={{ marginBottom: 12 }}>Cases</h2>
        {!cases?.length ? (
          <p className="muted">No cases yet.</p>
        ) : (
          <div className="i9-table-wrap">
            <table className="i9-table">
              <thead>
                <tr><th>Employee</th><th>First day</th><th>Section 2 due</th><th>Status</th><th>E-Verify</th></tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/hr/cases/${c.id}`}>{c.employee_first_name} {c.employee_last_name}</Link>
                      <div className="muted i9-small">{c.employee_email}</div>
                    </td>
                    <td>{c.first_day ?? "—"}</td>
                    <td>{c.first_day && ["invited", "section1_complete"].includes(c.status) ? businessDaysAfter(c.first_day, 3) : "—"}</td>
                    <td><span className={`i9-badge s-${c.status}`}>{statusLabels[c.status] ?? c.status}</span></td>
                    <td>{c.everify_case_number ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
