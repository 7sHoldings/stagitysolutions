import "server-only";
import { audit, db } from "@/lib/i9/server";
import { hashPassword, tempPassword } from "@/lib/portal/server";

const TEMP_DAYS = 7;

/** Not server actions: callers must check the admin session first. */
export async function issueTempPassword(id: string) {
  const pw = tempPassword();
  const { data: p } = await db()
    .from("stagity_people")
    .select("session_version")
    .eq("id", id)
    .single();
  await db()
    .from("stagity_people")
    .update({
      password_hash: await hashPassword(pw),
      must_change_password: true,
      temp_password_expires_at: new Date(Date.now() + TEMP_DAYS * 86400_000).toISOString(),
      session_version: (p?.session_version ?? 1) + 1,
      failed_logins: 0,
      locked_until: null,
    })
    .eq("id", id);
  return pw;
}

export async function openI9(personId: string, hr: string, p: { first_name: string; last_name: string; email: string; job?: string | null }, firstDay: string | null) {
  const { data: existing } = await db().from("stagity_i9_cases").select("id").eq("person_id", personId).neq("status", "cancelled").limit(1).maybeSingle();
  if (existing) return false;
  const { data } = await db()
    .from("stagity_i9_cases")
    .insert({ created_by: hr, person_id: personId, employee_first_name: p.first_name, employee_last_name: p.last_name, employee_email: p.email, first_day: firstDay })
    .select("id")
    .single();
  if (data) await audit(data.id, `hr:${hr}`, "case_created", { personId, firstDay });
  return true;
}

