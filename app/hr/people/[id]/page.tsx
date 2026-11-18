import Link from "next/link";
import { notFound } from "next/navigation";
import { db, requireHr } from "@/lib/i9/server";
import { statusLabels } from "@/lib/i9/forms";
import { sheetLabel } from "@/lib/portal/dates";
import HrNav from "../../HrNav";
import { setActive } from "../actions";
import { EditPersonForm, ResetPasswordForm, StartI9Form } from "../forms";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const hr = await requireHr();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: p } = await db().from("stagity_people").select("*").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [{ data: i9 }, { data: sheets }, { data: vendors }] = await Promise.all([
    db().from("stagity_i9_cases").select("id, status").eq("person_id", id).neq("status", "cancelled").limit(1).maybeSingle(),
    db().from("stagity_timesheets").select("id, week_start, status, total_hours").eq("person_id", id).order("week_start", { ascending: false }).limit(12),
    db().from("stagity_vendors").select("id, name").order("name"),
  ]);

  return (
    <section className="container i9-page">
      <HrNav active="/hr/people" email={hr} />
      <div>
        <p><Link href="/hr/people">← People</Link></p>
        <h1 className="h2">{p.first_name} {p.last_name}</h1>
        <p className="muted">{p.email}{p.last_login_at ? ` · last signed in ${new Date(p.last_login_at).toLocaleDateString("en-US")}` : " · hasn't signed in yet"}</p>
      </div>

      <EditPersonForm p={p} vendors={vendors ?? []} />

      <div className="form-card">
        <h2 className="i9-h3">Portal login</h2>
        <p className="muted i9-small">
          {p.must_change_password ? "They haven't set their own password yet." : "They've set their own password."} Sending a new temporary
          password signs them out everywhere.
        </p>
        <ResetPasswordForm id={id} />
        <form action={setActive}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value={p.active ? "false" : "true"} />
          <button className="btn btn-outline">{p.active ? "Deactivate account" : "Reactivate account"}</button>
        </form>
      </div>

      <div className="form-card">
        <h2 className="i9-h3">Form I-9</h2>
        {i9 ? (
          <p><Link href={`/hr/cases/${i9.id}`}>Open Form I-9</Link> · <span className={`i9-badge s-${i9.status}`}>{statusLabels[i9.status]}</span></p>
        ) : (
          <StartI9Form id={id} startDate={p.start_date ?? ""} />
        )}
      </div>

      {p.kind === "consultant" && (
        <div className="i9-card">
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
    </section>
  );
}
