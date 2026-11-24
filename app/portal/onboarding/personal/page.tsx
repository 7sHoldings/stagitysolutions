import { redirect } from "next/navigation";
import { requirePerson } from "@/lib/portal/server";
import { db } from "@/lib/i9/server";
import { decryptPersonal, WORK_STATUSES } from "@/lib/onboarding/server";
import ObPage from "../ObPage";
import { PersonalForm } from "../ObForms";

export const metadata = { title: "Personal information", robots: { index: false, follow: false } };

export default async function Personal() {
  const p = await requirePerson();
  const { data: ob } = await db().from("stagity_onboarding").select("personal_enc").eq("person_id", p.id).maybeSingle();
  if (!ob) redirect("/portal/onboarding");
  const saved = decryptPersonal(ob.personal_enc);
  const d = saved
    ? { ...saved, ssn: undefined, ssnLast4: saved.ssn.slice(-4) }
    : {
        firstName: p.first_name, lastName: p.last_name, street: p.address_line1 ?? "", apt: p.address_line2 ?? "", city: p.city ?? "", state: p.state ?? "", zip: p.zip ?? "",
        cellPhone: p.phone ?? "", personalEmail: p.email,
      };
  return (
    <ObPage step="Step 1 · Personal information" title="Employee Personal Information" intro="Use your legal name as it appears on your Social Security card. All fields are required unless marked optional.">
      <PersonalForm d={d} statuses={WORK_STATUSES} />
    </ObPage>
  );
}
