import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePerson } from "@/lib/portal/server";
import { db } from "@/lib/i9/server";
import { FILE_KINDS, OPTIONAL_DOCS, requiredDocs } from "@/lib/onboarding/server";
import ObPage from "../ObPage";
import { SubmitDocsButton } from "../ObForms";
import DocUploader from "./DocUploader";

export const metadata = { title: "Documents", robots: { index: false, follow: false } };

export default async function Documents() {
  const p = await requirePerson();
  const [{ data: ob }, { data: files }] = await Promise.all([
    db().from("stagity_onboarding").select("work_status, docs_submitted_at, personal_submitted_at").eq("person_id", p.id).maybeSingle(),
    db().from("stagity_onboarding_files").select("id, kind, original_name, expires_on").eq("person_id", p.id).order("created_at"),
  ]);
  if (!ob) redirect("/portal/onboarding");
  const required = requiredDocs(ob.work_status);
  const optional = OPTIONAL_DOCS.filter((k) => !required.includes(k));
  const byKind = (k: string) => (files ?? []).filter((f) => f.kind === k).map((f) => ({ id: f.id, name: f.original_name ?? "file", expires: f.expires_on }));
  const missing = required.filter((k) => !byKind(k).length);
  return (
    <ObPage step="Step 4 · Documents" title="Upload your documents" intro="Take a clear photo with your phone or upload a PDF. Make sure all four corners and the text are readable.">
      {!ob.personal_submitted_at && (
        <p className="hr-notice">Tip: complete the <Link href="/portal/onboarding/personal">Personal Information form</Link> first. Your working status decides which documents are needed.</p>
      )}
      <div className="i9-stack" style={{ gap: 10 }}>
        <p className="hr-section-label" style={{ margin: 0 }}>Required</p>
        {required.map((k) => <DocUploader key={k} kind={k} label={FILE_KINDS[k]} required files={byKind(k)} />)}
        <p className="hr-section-label" style={{ margin: "10px 0 0" }}>Also send if you have them</p>
        {optional.map((k) => <DocUploader key={k} kind={k} label={FILE_KINDS[k]} required={false} files={byKind(k)} />)}
      </div>
      {ob.docs_submitted_at && !missing.length ? (
        <p className="form-status ok">✓ Documents submitted. You can still add more.</p>
      ) : (
        <>
          {missing.length > 0 && <p className="muted i9-small">Still needed: {missing.map((k) => FILE_KINDS[k]).join(", ")}.</p>}
          <SubmitDocsButton ready={!missing.length} />
        </>
      )}
    </ObPage>
  );
}
