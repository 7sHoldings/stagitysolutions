import "server-only";
import { audit, db } from "@/lib/i9/server";
import { requestSignatures, sendOnboardingInvite } from "./server";

/** Shared with registration ("Start onboarding" tick box). */
/** Not a server action: callers must check the admin session first. */
export async function startFor(ids: string[], templateIds: string[], due: string, notify: boolean, hr: string) {
  const started: string[] = [];
  const failed: string[] = [];
  const { data: people } = await db().from("stagity_people").select("id, first_name, email").in("id", ids);
  for (const p of people ?? []) {
    await db().from("stagity_onboarding").upsert({ person_id: p.id, started_by: hr, due_date: due }, { onConflict: "person_id", ignoreDuplicates: true });
    await db().from("stagity_onboarding").update({ due_date: due }).eq("person_id", p.id).is("completed_at", null);
    await requestSignatures(p.id, templateIds, hr);
    await audit(null, `hr:${hr}`, "onboarding_started", { personId: p.id, due, templates: templateIds.length });
    started.push(p.first_name);
    if (notify && p.email && !(await sendOnboardingInvite(p.email, p.first_name, due))) failed.push(p.first_name);
  }
  return { started, failed };
}

