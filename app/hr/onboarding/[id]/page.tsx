import Link from "next/link";
import { notFound } from "next/navigation";
import { audit, db, requireHr } from "@/lib/i9/server";
import { FILE_KINDS, OB_BUCKET, WORK_STATUSES, decryptDeposit, decryptPersonal, decryptW4, onboardingSteps, requiredDocs } from "@/lib/onboarding/server";
import { money } from "@/lib/portal/dates";
import HrNav from "../../HrNav";
import BackLink from "../../BackLink";
import { AddPersonDocButton, CancelSig, DueForm, RequestTemplate, ResendButton, ReturnButton } from "../forms";

const fs: Record<string, string> = { single: "Single or Married filing separately", married_joint: "Married filing jointly", head: "Head of household" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }) : "");
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="i9-row"><dt>{k}</dt><dd>{v || "—"}</dd></div>;

export default async function PersonOnboarding({ params }: { params: Promise<{ id: string }> }) {
  const hr = await requireHr();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [s, { data: p }, { data: files }, { data: sigs }, { data: templates }] = await Promise.all([
    onboardingSteps(id),
    db().from("stagity_people").select("first_name, last_name, email, phone, emergency_name, emergency_phone, emergency_relationship").eq("id", id).maybeSingle(),
    db().from("stagity_onboarding_files").select("*").eq("person_id", id).order("created_at"),
    db().from("stagity_signatures").select("*").eq("person_id", id).neq("status", "cancelled").order("requested_at"),
    db().from("stagity_doc_templates").select("id, title").eq("active", true).order("title"),
  ]);
  if (!p || !s) notFound();
  await audit(null, `hr:${hr}`, "onboarding_viewed", { personId: id });
  const personal = decryptPersonal(s.ob.personal_enc);
  const w4 = decryptW4(s.ob.w4_enc);
  const dep = decryptDeposit(s.ob.deposit_enc);
  const sign = async (path: string) => (await db().storage.from(OB_BUCKET).createSignedUrl(path, 600)).data?.signedUrl ?? "#";
  const fileLinks = await Promise.all((files ?? []).map(async (f) => ({ ...f, url: await sign(f.storage_path) })));
  const sigLinks = await Promise.all((sigs ?? []).map(async (x) => ({ ...x, url: await sign(x.signed_path ?? x.source_path) })));
  const required = requiredDocs(s.ob.work_status);
  const kinds = [...new Set([...required, ...fileLinks.map((f) => f.kind)])];

  return (
    <section className="container hr-page">
      <HrNav active="/hr/onboarding" email={hr} />
      <BackLink href="/hr/onboarding" label="All onboarding" />
      <div className="hr-detail-head">
        <div>
          <h1 className="h2">{p.first_name} {p.last_name}</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>{p.email} · {s.ob.completed_at ? `completed ${when(s.ob.completed_at)}` : `${s.done} of ${s.total} done`}</p>
        </div>
        <div className="hr-detail-actions">
          <span className={`i9-badge ${s.ob.completed_at ? "s-closed" : "s-section1_complete"}`}>{s.ob.completed_at ? "Complete" : "In progress"}</span>
          <a className="btn btn-primary hr-btn-sm" href={`/hr/onboarding/${id}/pdf?form=all`} target="_blank" rel="noreferrer">Download forms (PDF)</a>
        </div>
      </div>
      {s.ob.returned_note && !s.ob.completed_at && <p className="ack-warn"><strong>Sent back:</strong> {s.ob.returned_note}</p>}

      <div className="hr-panel">
        <div className="ob-chips">{s.steps.map((x) => <span key={x.key} className={`ob-chip ${x.done ? "done" : ""}`}>{x.done ? "✓ " : ""}{x.label}</span>)}</div>
        <div className="btn-row" style={{ marginTop: 14, alignItems: "flex-end" }}>
          <DueForm personId={id} due={s.ob.due_date ?? ""} />
          <ResendButton personId={id} />
          <ReturnButton personId={id} />
        </div>
      </div>

      <div className="hr-two">
        <div className="hr-panel">
          <div className="hr-title" style={{ marginBottom: 6 }}><h2 className="i9-h3">Personal information</h2>{personal && <a className="hr-link" href={`/hr/onboarding/${id}/pdf?form=personal`} target="_blank" rel="noreferrer">PDF</a>}</div>
          {personal ? (
            <dl className="i9-dl">
              <Row k="Name" v={`${personal.firstName} ${personal.middleInitial} ${personal.lastName}`} />
              <Row k="Address" v={`${personal.street}${personal.apt ? `, ${personal.apt}` : ""}, ${personal.city}, ${personal.state} ${personal.zip}`} />
              <Row k="SSN" v={`***-**-${personal.ssn.slice(-4)} (full number in the PDF)`} />
              <Row k="Date of birth" v={personal.dob} />
              <Row k="Working status" v={`${WORK_STATUSES.find((w) => w.value === personal.workStatus)?.label ?? personal.workStatus}${personal.statusNumber ? ` · #${personal.statusNumber}` : ""}${personal.statusExpires ? ` · expires ${personal.statusExpires}` : ""}`} />
              <Row k="Phones" v={[personal.cellPhone && `cell ${personal.cellPhone}`, personal.homePhone && `home ${personal.homePhone}`].filter(Boolean).join(" · ")} />
              <Row k="Personal email" v={personal.personalEmail} />
              <Row k="Work" v={[personal.workAddress, personal.workPhone, personal.workEmail].filter(Boolean).join(" · ")} />
              <Row k="Emergency contact" v={p.emergency_name ? `${p.emergency_name} (${p.emergency_relationship}) ${p.emergency_phone}` : ""} />
            </dl>
          ) : <p className="muted">Not submitted yet.</p>}
        </div>
        <div className="hr-stack">
          <div className="hr-panel">
            <div className="hr-title" style={{ marginBottom: 6 }}><h2 className="i9-h3">Form W-4</h2>{w4 && personal && <a className="hr-link" href={`/hr/onboarding/${id}/pdf?form=w4`} target="_blank" rel="noreferrer">Official W-4 PDF</a>}</div>
            {w4 ? (
              <dl className="i9-dl">
                <Row k="Filing status" v={fs[w4.filingStatus]} />
                <Row k="Step 2(c) two jobs" v={w4.multipleJobs ? "Yes" : "No"} />
                <Row k="Step 3 dependents" v={money(w4.childrenAmount + w4.otherDependentsAmount)} />
                <Row k="Step 4 (a / b / c)" v={`${money(w4.otherIncome)} / ${money(w4.deductions)} / ${money(w4.extraWithholding)}`} />
                {w4.exempt && <Row k="Exempt" v="Yes" />}
                <Row k="Signed" v={`${w4.signedName}, ${when(w4.signedAt)}`} />
              </dl>
            ) : <p className="muted">Not signed yet.</p>}
          </div>
          <div className="hr-panel">
            <div className="hr-title" style={{ marginBottom: 6 }}><h2 className="i9-h3">Direct deposit</h2>{dep && <a className="hr-link" href={`/hr/onboarding/${id}/pdf?form=deposit`} target="_blank" rel="noreferrer">Signed form PDF</a>}</div>
            {dep ? (
              <dl className="i9-dl">
                <Row k="Bank" v={`${dep.bankName} (${dep.bankState})`} />
                <Row k="Routing #" v={dep.routing} />
                <Row k="Account #" v={`${dep.account} (${dep.accountType})`} />
                <Row k="Signed" v={`${dep.signedName}, ${when(dep.signedAt)}`} />
              </dl>
            ) : <p className="muted">Not signed yet.</p>}
          </div>
        </div>
      </div>

      <div className="hr-panel">
        <h2 className="i9-h3">Documents</h2>
        <div className="i9-table-wrap">
          <table className="i9-table">
            <tbody>
              {kinds.map((k) => {
                const fl = fileLinks.filter((f) => f.kind === k);
                return (
                  <tr key={k}>
                    <td><strong>{FILE_KINDS[k] ?? k}</strong>{required.includes(k) && <span className="muted i9-small"> · required</span>}</td>
                    <td>
                      {fl.length ? fl.map((f) => (
                        <div key={f.id}><a href={f.url} target="_blank" rel="noreferrer">{f.original_name ?? "file"}</a>{f.expires_on && <span className="muted i9-small"> · expires {f.expires_on}</span>}<span className="muted i9-small"> · {new Date(f.created_at).toLocaleDateString("en-US")}</span></div>
                      )) : <span style={{ color: "#b45309" }}>Missing</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hr-panel">
        <div className="hr-title" style={{ marginBottom: 6 }}>
          <h2 className="i9-h3">Documents to sign</h2>
          <AddPersonDocButton personId={id} />
        </div>
        {sigLinks.length ? (
          <div className="i9-table-wrap">
            <table className="i9-table">
              <tbody>
                {sigLinks.map((x) => (
                  <tr key={x.id}>
                    <td><a href={x.url} target="_blank" rel="noreferrer"><strong>{x.title}</strong></a></td>
                    <td>{x.status === "signed" ? <span className="i9-badge s-closed">✓ Signed by {x.signed_name}, {when(x.signed_at)}</span> : <span className="i9-badge s-section1_complete">Waiting for signature</span>}</td>
                    <td className="hr-td-actions">{x.status === "pending" && <CancelSig id={x.id} title={x.title} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted i9-small">Nothing to sign yet. Upload their offer letter, or add a company document.</p>}
        <div style={{ marginTop: 10 }}><RequestTemplate personId={id} templates={(templates ?? []).filter((t) => !sigLinks.some((x) => x.template_id === t.id)).map((t) => ({ id: t.id, name: t.title }))} /></div>
      </div>
      <p className="muted i9-small">Form I-9 is handled separately: <Link href="/hr/i9">Form I-9</Link> tab, or start it from their profile.</p>
    </section>
  );
}
