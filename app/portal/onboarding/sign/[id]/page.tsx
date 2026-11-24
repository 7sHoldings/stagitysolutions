import { notFound } from "next/navigation";
import { requirePerson } from "@/lib/portal/server";
import { db } from "@/lib/i9/server";
import { OB_BUCKET } from "@/lib/onboarding/server";
import ObPage from "../../ObPage";
import { SignForm } from "../../ObForms";

export const metadata = { title: "Sign document", robots: { index: false, follow: false } };

export default async function SignPage({ params }: { params: Promise<{ id: string }> }) {
  const p = await requirePerson();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: s } = await db().from("stagity_signatures").select("*").eq("id", id).eq("person_id", p.id).neq("status", "cancelled").maybeSingle();
  if (!s) notFound();
  const path = s.status === "signed" && s.signed_path ? s.signed_path : s.source_path;
  const { data: url } = await db().storage.from(OB_BUCKET).createSignedUrl(path, 60 * 30);
  return (
    <ObPage step="Sign" title={s.title} intro={s.status === "signed" ? `Signed by ${s.signed_name} on ${new Date(s.signed_at).toLocaleString("en-US", { timeZone: "America/Chicago" })} CT.` : "Read the document below, then sign at the bottom."}>
      {url?.signedUrl && (
        <>
          <iframe className="ob-frame" src={url.signedUrl} title={s.title} />
          <a className="btn btn-outline hr-btn-sm" href={url.signedUrl} target="_blank" rel="noreferrer" style={{ alignSelf: "flex-start" }}>Open the document in a new tab</a>
        </>
      )}
      {s.status === "pending" ? <SignForm id={s.id} name={`${p.first_name} ${p.last_name}`} /> : <p className="form-status ok">✓ You signed this document. A signature page was added to the end.</p>}
    </ObPage>
  );
}
