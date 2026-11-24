import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { onboardingSteps } from "@/lib/onboarding/server";
import { todayCT } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import { AddTemplateButton, StartButton, TemplateToggle } from "./forms";

const short: Record<string, string> = { details: "Contact", personal: "Personal info", w4: "W-4", deposit: "Deposit", documents: "Documents", i9: "I-9" };

export default async function Onboarding() {
  const hr = await requireHr();
  const today = todayCT();
  const [{ data: obs }, { data: people }, { data: templates }] = await Promise.all([
    db().from("stagity_onboarding").select("person_id, due_date, completed_at, started_at, stagity_people(first_name, last_name, email, active)").order("started_at", { ascending: false }),
    db().from("stagity_people").select("id, first_name, last_name, email, active").eq("active", true).not("email", "is", null).order("last_name"),
    db().from("stagity_doc_templates").select("*").order("created_at"),
  ]);
  const rows = await Promise.all((obs ?? []).map(async (o) => ({ o, p: o.stagity_people as unknown as { first_name: string; last_name: string; email: string }, s: await onboardingSteps(o.person_id) })));
  rows.sort((a, b) => Number(!!a.o.completed_at) - Number(!!b.o.completed_at) || a.p.last_name.localeCompare(b.p.last_name));
  const startable = (people ?? []).filter((p) => !(obs ?? []).some((o) => o.person_id === p.id)).map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));
  const active = (templates ?? []).filter((t) => t.active);
  const done = rows.filter((r) => r.o.completed_at).length;

  return (
    <section className="container hr-page">
      <HrNav active="/hr/onboarding" email={hr} />
      <div className="hr-title">
        <div>
          <h1 className="h2">Onboarding</h1>
          <p className="muted">New-hire paperwork: Personal Information form, Form W-4, Direct Deposit Agreement, documents and e-signatures. {rows.length ? `${done} of ${rows.length} complete.` : ""}</p>
        </div>
        <StartButton people={startable} templates={active.map((t) => ({ id: t.id, name: t.title, defaultOn: t.default_for_new }))} />
      </div>

      <div className="hr-panel">
        <h2 className="i9-h3">People</h2>
        {rows.length ? (
          <div className="i9-table-wrap">
            <table className="i9-table">
              <thead><tr><th>Name</th><th>Progress</th><th>Finish by</th><th></th></tr></thead>
              <tbody>
                {rows.map(({ o, p, s }) => (
                  <tr key={o.person_id}>
                    <td><strong>{p.first_name} {p.last_name}</strong><div className="muted i9-small">{p.email}</div></td>
                    <td>
                      {o.completed_at ? <span className="i9-badge s-closed">✓ Complete</span> : <span className="i9-badge s-section1_complete">{s?.done ?? 0} of {s?.total ?? 0} done</span>}
                      <div className="ob-chips" style={{ marginTop: 6 }}>
                        {s?.steps.map((x) => <span key={x.key} className={`ob-chip ${x.done ? "done" : ""}`}>{x.key.startsWith("sign:") ? x.label.replace("Sign: ", "✍ ") : short[x.key] ?? x.label}</span>)}
                      </div>
                    </td>
                    <td>{o.completed_at ? <span className="muted i9-small">done {new Date(o.completed_at).toLocaleDateString("en-US")}</span> : o.due_date ? <span style={{ color: o.due_date < today ? "#b91c1c" : undefined }}>{o.due_date}{o.due_date < today ? " (late)" : ""}</span> : "—"}</td>
                    <td><Link href={`/hr/onboarding/${o.person_id}`} className="btn btn-outline hr-btn-sm">Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No one yet. Tap <strong>Start onboarding</strong> to send the new-hire paperwork to your consultants.</p>
        )}
      </div>

      <div className="hr-panel">
        <div className="hr-title" style={{ marginBottom: 8 }}>
          <div>
            <h2 className="i9-h3">Company documents to sign</h2>
            <p className="muted i9-small">PDFs everyone signs, e.g. employee handbook acknowledgment, NDA, policies. Personal documents (offer letters) are added on each person&apos;s page.</p>
          </div>
          <AddTemplateButton />
        </div>
        {templates?.length ? (
          <div className="i9-table-wrap">
            <table className="i9-table">
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} style={{ opacity: t.active ? 1 : 0.55 }}>
                    <td><strong>{t.title}</strong>{t.description && <div className="muted i9-small">{t.description}</div>}</td>
                    <td className="i9-small">{t.active ? (t.default_for_new ? "Included for new hires" : "Optional") : "Archived"}</td>
                    <td className="hr-td-actions">
                      {t.active && <TemplateToggle id={t.id} field="default_for_new" value={t.default_for_new} label={t.default_for_new ? "Make optional" : "Include by default"} />}
                      <TemplateToggle id={t.id} field="active" value={t.active} label={t.active ? "Archive" : "Restore"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted i9-small">None yet.</p>}
      </div>
    </section>
  );
}
