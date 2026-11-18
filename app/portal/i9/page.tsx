import Link from "next/link";
import { db } from "@/lib/i9/server";
import { requirePerson } from "@/lib/portal/server";
import Section1Form from "./Section1Form";

export default async function PortalI9() {
  const p = await requirePerson();
  const { data: c } = await db()
    .from("stagity_i9_cases")
    .select("id, status, first_day")
    .eq("person_id", p.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <section className="container i9-page" style={{ maxWidth: 880 }}>
      <p><Link href="/portal">← Portal home</Link></p>
      <div>
        <p className="eyebrow">Form I-9 · Employment Eligibility Verification</p>
        <h1 className="h2">Form I-9</h1>
      </div>
      {!c ? (
        <p className="lead">HR hasn&apos;t started a Form I-9 for you.</p>
      ) : c.status !== "invited" ? (
        <div className="form-card">
          <h2 className="i9-h3">Section 1 is complete</h2>
          <p className="text">Thank you. HR will contact you to schedule a short live video call to see your original documents.</p>
        </div>
      ) : (
        <>
          <p className="lead">
            Complete Section 1 and upload your documents{c.first_day ? ` by ${c.first_day}` : ""}. Your information is encrypted and only
            Stagity Solutions HR can see it.
          </p>
          <Section1Form firstName={p.first_name} lastName={p.last_name} email={p.email} />
        </>
      )}
    </section>
  );
}
