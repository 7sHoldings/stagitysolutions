import Link from "next/link";
import { notFound } from "next/navigation";
import { audit, db, decryptJson, I9_BUCKET, requireHr } from "@/lib/i9/server";
import { citizenshipOptions, formatSsn, maskSsn, retainUntil, statusLabels, type DocEntry, type Section1, type Section2 } from "@/lib/i9/forms";
import { cancelCase } from "../../actions";
import { EverifyForm, RecordForm, ResendForm } from "../../forms";
import Section2Form from "./Section2Form";
import PrintButton from "./PrintButton";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }) + " CT" : "—";

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="i9-row"><dt>{k}</dt><dd>{v || "—"}</dd></div>;
}

function DocRows({ label, d }: { label: string; d: DocEntry }) {
  return (
    <>
      <Row k={label} v={d.title} />
      <Row k="Issuing authority" v={d.issuingAuthority} />
      <Row k="Document number" v={d.number} />
      <Row k="Expiration date" v={d.expires} />
    </>
  );
}

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const hr = await requireHr();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: c } = await db().from("stagity_i9_cases").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();

  const s1 = decryptJson<Section1>(c.section1_enc);
  const s2 = decryptJson<Section2>(c.section2_enc);
  const [{ data: docs }, { data: log }] = await Promise.all([
    db().from("stagity_i9_documents").select("*").eq("case_id", id).order("uploaded_at"),
    db().from("stagity_i9_audit").select("at, actor, action, details").eq("case_id", id).order("at", { ascending: false }).limit(100),
  ]);
  const urls = new Map<string, string>();
  if (docs?.length) {
    const { data: signed } = await db().storage.from(I9_BUCKET).createSignedUrls(docs.map((d) => d.storage_path), 600);
    signed?.forEach((x) => x.signedUrl && x.path && urls.set(x.path, x.signedUrl));
  }
  if (s1) await audit(id, `hr:${hr}`, "record_viewed");

  const retain = retainUntil(c.first_day, c.terminated_on);
  const status = citizenshipOptions.find((o) => o.value === s1?.status)?.label;

  return (
    <section className="container i9-page">
      <p className="no-print"><Link href="/hr">← All cases</Link></p>
      <div className="hero-row" style={{ alignItems: "flex-end" }}>
        <div>
          <p className="eyebrow">Form I-9 record</p>
          <h1 className="h2">{c.employee_first_name} {c.employee_last_name}</h1>
          <p className="muted">{c.employee_email}{c.job_title ? ` · ${c.job_title}` : ""}</p>
        </div>
        <div className="i9-stack" style={{ alignItems: "flex-end" }}>
          <span className={`i9-badge s-${c.status}`}>{statusLabels[c.status] ?? c.status}</span>
          {s1 && <PrintButton />}
        </div>
      </div>

      {c.status === "invited" && (
        <div className="form-card no-print">
          <h2 className="i9-h3">Waiting for the employee to complete Section 1</h2>
          <p className="muted">Link expires {fmt(c.token_expires_at)}. Sending a new link cancels the old one.</p>
          <ResendForm id={id} />
          <form action={cancelCase}>
            <input type="hidden" name="id" value={id} />
            <button className="btn btn-outline">Cancel this case</button>
          </form>
        </div>
      )}

      {s1 && (
        <div className="i9-card">
          <h2 className="i9-h3">Section 1: Employee information and attestation</h2>
          <dl className="i9-dl">
            <Row k="Last name" v={s1.lastName} />
            <Row k="First name" v={s1.firstName} />
            <Row k="Middle initial" v={s1.middleInitial} />
            <Row k="Other last names used" v={s1.otherLastNames} />
            <Row k="Address" v={`${s1.address}${s1.apt ? `, Apt ${s1.apt}` : ""}, ${s1.city}, ${s1.state} ${s1.zip}`} />
            <Row k="Date of birth" v={s1.dob} />
            <Row k="Social Security number" v={<details><summary>{maskSsn(s1.ssn)}</summary>{formatSsn(s1.ssn)}</details>} />
            <Row k="Email" v={s1.email} />
            <Row k="Phone" v={s1.phone} />
            <Row k="Citizenship / immigration status" v={status} />
            {s1.status === "lpr" && <Row k="USCIS / A-Number" v={s1.lprNumber} />}
            {s1.status === "authorized_alien" && (
              <>
                <Row k="Work authorization expires" v={s1.workAuthExpires} />
                {s1.alienIdType === "uscis" && <Row k="USCIS / A-Number" v={s1.alienUscisNumber} />}
                {s1.alienIdType === "i94" && <Row k="Form I-94 admission number" v={s1.i94Number} />}
                {s1.alienIdType === "passport" && <Row k="Foreign passport number / country" v={`${s1.foreignPassportNumber} / ${s1.passportCountry}`} />}
              </>
            )}
            <Row k="Employee signature" v={`${s1.signature} (electronically signed)`} />
            <Row k="Signed" v={fmt(c.section1_signed_at)} />
            <Row k="Preparer/translator" v={s1.noPreparer ? "None used" : "—"} />
          </dl>
        </div>
      )}

      {!!docs?.length && (
        <div className="i9-card">
          <h2 className="i9-h3">Document copies</h2>
          <div className="i9-docs">
            {docs.map((d) => {
              const url = urls.get(d.storage_path);
              const isPdf = d.mime_type === "application/pdf";
              return (
                <figure key={d.id} className="i9-doc">
                  {url && !isPdf ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`List ${d.list} ${d.side}`} />
                    </a>
                  ) : (
                    <a href={url} target="_blank" rel="noreferrer" className="i9-pdf">Open PDF</a>
                  )}
                  <figcaption>List {d.list} · {d.side}</figcaption>
                </figure>
              );
            })}
          </div>
          {s1 && (
            <p className="muted i9-small">
              Employee chose: {s1.docChoice.mode === "A" ? s1.docChoice.a : `${s1.docChoice.b} + ${s1.docChoice.c}`}
            </p>
          )}
        </div>
      )}

      {c.status === "section1_complete" && s1 && (
        <div className="no-print">
          <Section2Form id={id} firstDay={c.first_day ?? ""} choice={s1.docChoice} />
        </div>
      )}

      {s2 && (
        <div className="i9-card">
          <h2 className="i9-h3">Section 2: Employer review and verification</h2>
          <dl className="i9-dl">
            {s2.documents.listA.map((d, i) => <DocRows key={i} label={`List A document ${i + 1}`} d={d} />)}
            {s2.documents.listB && <DocRows label="List B" d={s2.documents.listB} />}
            {s2.documents.listC && <DocRows label="List C" d={s2.documents.listC} />}
            <Row k="Additional information" v={s2.additionalInfo} />
            <Row k="Alternative procedure used" v="Yes, documents examined via live video (DHS-authorized alternative procedure)" />
            <Row k="Video call" v={fmt(s2.videoCallAt)} />
            <Row k="First day of employment" v={s2.firstDay} />
            <Row k="Employer representative" v={`${s2.repFirstName} ${s2.repLastName}, ${s2.repTitle}`} />
            <Row k="Signature" v={`${s2.signature} (electronically signed)`} />
            <Row k="Signed" v={fmt(s2.signedAt)} />
            <Row k="Business" v={`${s2.businessName}, ${s2.businessAddress}`} />
          </dl>
        </div>
      )}

      {s2 && (
        <div className="form-card no-print">
          <h2 className="i9-h3">E-Verify</h2>
          <p className="muted">
            Create the case at <a href="https://e-verify.uscis.gov/" target="_blank" rel="noreferrer">e-verify.uscis.gov</a> no
            later than the third business day after the first day of work, then record it here.
          </p>
          <EverifyForm id={id} caseNumber={c.everify_case_number ?? ""} result={c.everify_status ?? ""} />
        </div>
      )}
      {c.everify_case_number && (
        <div className="i9-card print-only">
          <dl className="i9-dl"><Row k="E-Verify case number" v={c.everify_case_number} /><Row k="Result" v={c.everify_status} /></dl>
        </div>
      )}

      {c.status !== "cancelled" && (
        <div className="form-card no-print">
          <h2 className="i9-h3">Record keeping</h2>
          <p className="muted">
            {retain
              ? `Keep this record until ${retain}.`
              : "Keep this record while the person is employed. When they leave, enter the end date to see how long to keep it (3 years after hire or 1 year after leaving, whichever is later)."}
          </p>
          <RecordForm id={id} terminatedOn={c.terminated_on ?? ""} notes={c.notes ?? ""} />
        </div>
      )}

      <details className="i9-card no-print">
        <summary className="i9-h3">Audit trail</summary>
        <table className="i9-table" style={{ marginTop: 12 }}>
          <tbody>
            {log?.map((l, i) => (
              <tr key={i}><td className="i9-small">{fmt(l.at)}</td><td className="i9-small">{l.actor}</td><td className="i9-small">{l.action}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
