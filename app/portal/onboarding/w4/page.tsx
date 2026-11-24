import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePerson } from "@/lib/portal/server";
import { db } from "@/lib/i9/server";
import { decryptPersonal, decryptW4 } from "@/lib/onboarding/server";
import ObPage from "../ObPage";
import { W4Form } from "../ObForms";

export const metadata = { title: "Form W-4", robots: { index: false, follow: false } };

export default async function W4Page() {
  const p = await requirePerson();
  const { data: ob } = await db().from("stagity_onboarding").select("personal_enc, w4_enc").eq("person_id", p.id).maybeSingle();
  if (!ob) redirect("/portal/onboarding");
  const personal = decryptPersonal(ob.personal_enc);
  const w = decryptW4(ob.w4_enc);
  return (
    <ObPage step="Step 2 · Tax withholding" title="Form W-4" intro="Your answers fill in the official IRS Form W-4. Your name, SSN and address come from your Personal Information form. If you're unsure, the IRS estimator at irs.gov/W4App can help.">
      {!personal ? (
        <p className="form-status err">Please complete the <Link href="/portal/onboarding/personal">Personal Information form</Link> first.</p>
      ) : (
        <W4Form
          name={`${personal.firstName} ${personal.lastName}`}
          d={w ? { ...w, children: w.children ?? Math.round(w.childrenAmount / 2200), others: w.otherDependents ?? Math.round(w.otherDependentsAmount / 500) } : undefined}
        />
      )}
    </ObPage>
  );
}
