import { redirect } from "next/navigation";
import { requirePerson } from "@/lib/portal/server";
import { db } from "@/lib/i9/server";
import { decryptDeposit, decryptPersonal } from "@/lib/onboarding/server";
import ObPage from "../ObPage";
import { DepositForm } from "../ObForms";

export const metadata = { title: "Direct deposit", robots: { index: false, follow: false } };

export default async function DepositPage() {
  const p = await requirePerson();
  const { data: ob } = await db().from("stagity_onboarding").select("personal_enc, deposit_enc, deposit_last4").eq("person_id", p.id).maybeSingle();
  if (!ob) redirect("/portal/onboarding");
  const personal = decryptPersonal(ob.personal_enc);
  const d = decryptDeposit(ob.deposit_enc);
  return (
    <ObPage step="Step 3 · Payroll" title="Direct Deposit Agreement" intro={d ? `Saved: ${d.bankName} account ending ${ob.deposit_last4}. Submit again only to change it.` : "Your pay is deposited directly into this account."}>
      <DepositForm name={personal ? `${personal.firstName} ${personal.lastName}` : `${p.first_name} ${p.last_name}`} d={d ? { bankName: d.bankName, bankState: d.bankState, accountType: d.accountType } : undefined} />
    </ObPage>
  );
}
