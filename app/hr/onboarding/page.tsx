import Link from "next/link";
import { db, requireHr } from "@/lib/i9/server";
import { onboardingSteps } from "@/lib/onboarding/server";
import { todayCT } from "@/lib/portal/dates";
import HrNav from "../HrNav";
import { AddTemplateButton, DisconnectDriveButton, NewHireButton, OfferSettingsForm, StartExistingButton, TemplateToggle } from "./forms";
import { PLACEHOLDERS, companySigner, offerTemplate } from "@/lib/onboarding/offer";
import { OB_BUCKET } from "@/lib/onboarding/server";
import { driveStatus, oauthAvailable } from "@/lib/gdrive";
import { googleRedirectUri } from "@/lib/google-oauth";

const short: Record<string, string> = { details: "Contact", personal: "Personal info", w4: "W-4", deposit: "Deposit", documents: "Documents", i9: "I-9" };

const driveMsg: Record<string, [boolean, string]> = {
  connected: [true, "Google Drive connected. New onboarding files will be copied there."],
  cancelled: [false, "Google sign-in was cancelled."],
  expired: [false, "That sign-in link expired. Please try again."],
  norefresh: [false, "Google didn't return a long-term token. Remove \"Stagity Portal\" from myaccount.google.com/permissions and connect again."],
  noscope: [false, "Please allow access to Google Drive files when Google asks."],
  failed: [false, "Couldn't connect to Google Drive. Please try again."],
};

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ drive?: string }> }) {
  const dm = driveMsg[(await searchParams).drive ?? ""];
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
  const tplOpts = active.map((t) => ({ id: t.id, name: t.title, defaultOn: t.default_for_new }));
  const [tpl, signer] = await Promise.all([offerTemplate(), companySigner()]);
  const sigUrl = signer.imagePath ? (await db().storage.from(OB_BUCKET).createSignedUrl(signer.imagePath, 600)).data?.signedUrl ?? null : null;
  const drive = await driveStatus();
  const canConnect = oauthAvailable();

  return (
    <section className="container hr-page">
      <HrNav active="/hr/onboarding" email={hr} />
      <div className="hr-title">
        <div>
          <h1 className="h2">Onboarding</h1>
          <p className="muted">New-hire paperwork: Personal Information form, Form W-4, Direct Deposit Agreement, documents and e-signatures. {rows.length ? `${done} of ${rows.length} complete.` : ""}</p>
        </div>
        <div className="btn-row" style={{ alignItems: "center" }}>
          <StartExistingButton people={startable} templates={tplOpts} />
          <NewHireButton templates={tplOpts} />
        </div>
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
      <details className="hr-panel ob-settings">
        <summary><h2 className="i9-h3" style={{ display: "inline" }}>Offer letter template &amp; your signature</h2>{!signer.name && <span className="pay-short i9-badge" style={{ marginLeft: 8 }}>Add your signature</span>}</summary>
        <div style={{ marginTop: 14 }}>
          <OfferSettingsForm template={tpl} signerName={signer.name} signerTitle={signer.title} placeholders={PLACEHOLDERS} signatureUrl={sigUrl} />
        </div>
      </details>

      <div className={`hr-panel ${drive ? "" : "ob-drive-off"}`} id="drive">
        <div className="hr-title" style={{ marginBottom: 6 }}>
          <h2 className="i9-h3">Google Drive</h2>
          {drive ? (
            <span className="btn-row" style={{ alignItems: "center" }}><span className="i9-badge s-closed">✓ Connected</span>{drive.mode === "oauth" && <DisconnectDriveButton />}</span>
          ) : canConnect ? (
            <a className="btn btn-primary hr-btn-sm" href="/api/google/connect">Connect Google Drive</a>
          ) : null}
        </div>
        {dm && <p className={`form-status ${dm[0] ? "ok" : "err"}`}>{dm[1]}</p>}
        {drive ? (
          <p className="muted i9-small">
            Saving to <strong>{drive.email}</strong>&apos;s Drive{drive.mode === "oauth" ? <>, folder <strong>Stagity Onboarding</strong></> : ""}: one folder per employee (&ldquo;Last, First&rdquo; → Forms / Documents / Signed). Each person&apos;s page has &ldquo;Copy all to Google Drive&rdquo; for anything submitted earlier.
          </p>
        ) : canConnect ? (
          <p className="muted i9-small">Click <strong>Connect Google Drive</strong> and sign in with <strong>hr@stagitysolutions.com</strong>. The portal can only see the files it creates, not the rest of your Drive.</p>
        ) : (
          <>
            <p className="muted i9-small">Not connected yet. One-time setup in Google Cloud (project &ldquo;Stagity Portal&rdquo;), about 5 minutes:</p>
            <ol className="i9-small" style={{ margin: "6px 0 0 18px", lineHeight: 1.7 }}>
              <li><strong>APIs &amp; Services → OAuth consent screen</strong> (Google Auth Platform): Get started → App name <em>Stagity Portal</em>, support email hr@ → Audience <strong>Internal</strong> → contact email → Create.</li>
              <li><strong>Clients → Create client</strong>: type <strong>Web application</strong>, name <em>Stagity Portal</em>, Authorised redirect URI: <code>{googleRedirectUri()}</code> → Create.</li>
              <li>Copy the <strong>Client ID</strong> and <strong>Client secret</strong> into Vercel → Settings → Environment Variables as <code>GOOGLE_OAUTH_CLIENT_ID</code> and <code>GOOGLE_OAUTH_CLIENT_SECRET</code> (Sensitive), then redeploy.</li>
              <li>Come back here and click <strong>Connect Google Drive</strong>.</li>
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
