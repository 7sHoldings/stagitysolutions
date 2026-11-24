import Link from "next/link";
import { notFound } from "next/navigation";
import { audit, db, requireHr } from "@/lib/i9/server";
import { FILE_KINDS, OB_BUCKET, WORK_STATUSES, decryptDeposit, decryptPersonal, decryptW4, onboardingSteps, requiredDocs } from "@/lib/onboarding/server";
import { money } from "@/lib/portal/dates";
import HrNav from "../../HrNav";
import BackLink from "../../BackLink";
import { AddPersonDocButton, CancelSig, CopyToDriveButton, CountersignButton, DueForm, OfferButton, RequestTemplate, ResendButton, ReturnButton } from "../forms";
import { companySigner, payText } from "@/lib/onboarding/offer";
import { statusLabels } from "@/lib/i9/forms";
import { driveConfigured } from "@/lib/gdrive";

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
  const [{ data: offer }, { data: i9 }, signer, { data: pp }] = await Promise.all([
    db().from("stagity_offers").select("*").eq("person_id", id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db().from("stagity_i9_cases").select("id, status, everify_case_number, everify_status").eq("person_id", id).neq("status", "cancelled").limit(1).maybeSingle(),
    companySigner(),
    db().from("stagity_people").select("start_date, client_name, pay_rate, monthly_pay").eq("id", id).single(),
  ]);
  const offerSig = offer?.signature_id ? (sigs ?? []).find((x) => x.id === offer.signature_id) : null;
  const offerUrl = offerSig ? (await db().storage.from(OB_BUCKET).createSignedUrl(offerSig.signed_path ?? offerSig.source_path, 600)).data?.signedUrl : null;
  const offerDefaults = offer
    ? { jobTitle: offer.job_title, startDate: offer.start_date ?? "", employmentType: offer.employment_type, payType: offer.pay_type, payAmount: Number(offer.pay_amount), paySchedule: offer.pay_schedule, workLocation: offer.work_location ?? "", clientName: offer.client_name ?? "", jobDescription: offer.job_description ?? "", jobDuties: offer.job_duties ?? "", extraTerms: offer.extra_terms ?? "" }
    : { startDate: pp?.start_date ?? "", clientName: pp?.client_name ?? "", payType: pp?.monthly_pay ? "monthly" : "hourly", payAmount: pp?.monthly_pay ? Number(pp.monthly_pay) : pp?.pay_rate ? Number(pp.pay_rate) : undefined };
  const offerStatus: Record<string, string> = { sent: "Waiting for their signature", employee_signed: "Signed by employee: your countersignature needed", completed: "Fully signed", draft: "Draft" };
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
          {driveConfigured() && <CopyToDriveButton personId={id} />}
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
          <div className="hr-title" style={{ marginBottom: 6 }}>
            <h2 className="i9-h3">Offer letter</h2>
            <OfferButton personId={id} d={offerDefaults} label={offer ? (offer.status === "completed" ? "New offer letter" : "Edit / replace") : "Create offer letter"} />
          </div>
          {offer ? (
            <>
              <dl className="i9-dl">
                <Row k="Status" v={<span className={`i9-badge ${offer.status === "completed" ? "s-closed" : offer.status === "employee_signed" ? "pay-short" : "s-section1_complete"}`}>{offerStatus[offer.status] ?? offer.status}</span>} />
                <Row k="Job" v={`${offer.job_title} · ${offer.employment_type}`} />
                <Row k="Pay" v={`${payText(offer)} · ${offer.pay_schedule}`} />
                <Row k="Start date" v={offer.start_date} />
                {offerSig?.signed_at && <Row k="Employee signed" v={`${offerSig.signed_name}, ${when(offerSig.signed_at)}`} />}
                {offer.countersigned_at && <Row k="You countersigned" v={when(offer.countersigned_at)} />}
              </dl>
              <div className="btn-row" style={{ marginTop: 10, alignItems: "center" }}>
                {offerUrl && <a className="btn btn-outline hr-btn-sm" href={offerUrl} target="_blank" rel="noreferrer">View PDF</a>}
                {offer.status === "employee_signed" && <CountersignButton offerId={offer.id} signer={signer.name} />}
              </div>
              {offer.status === "employee_signed" && !signer.name && <p className="ack-warn" style={{ marginTop: 8 }}>Add your name and signature image under Onboarding → Offer letter template first.</p>}
            </>
          ) : <p className="muted">No offer letter yet. Create one: they sign it in the portal, then you countersign.</p>}
        </div>
        <div className="hr-panel">
          <h2 className="i9-h3">Form I-9 &amp; E-Verify</h2>
          {i9 ? (
            <dl className="i9-dl">
              <Row k="Form I-9" v={<><span className={`i9-badge s-${i9.status}`}>{statusLabels[i9.status] ?? i9.status}</span> <Link href={`/hr/cases/${i9.id}`}>Open</Link></>} />
              <Row k="E-Verify" v={i9.everify_case_number ? `Case ${i9.everify_case_number}: ${i9.everify_status ?? "submitted"}` : "Not recorded yet. Run it at e-verify.uscis.gov after Section 2, then enter the case number on the I-9 page."} />
            </dl>
          ) : (
            <p className="muted">Starts automatically when they submit their documents{s.ob.docs_submitted_at ? "" : " (not yet)"}. You can also start it now from their <Link href={`/hr/people/${id}`}>profile</Link>.</p>
          )}
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
                {sigLinks.filter((x) => !x.offer_id).map((x) => (
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
