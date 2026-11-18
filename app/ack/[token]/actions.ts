"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { audit, db } from "@/lib/i9/server";
import { send } from "@/lib/i9/mail";
import { company } from "@/lib/content";

export type AckState = { ok?: boolean; error?: string };

export async function acknowledge(_prev: AckState, formData: FormData): Promise<AckState> {
  const token = String(formData.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { error: "This link isn't valid." };
  const { data: row } = await db().from("stagity_acknowledgments").select("id, name, email, campaign, acknowledged_at").eq("token", token).maybeSingle();
  if (!row) return { error: "This link isn't valid anymore. Please contact us." };
  if (row.acknowledged_at) return { ok: true };
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db().from("stagity_acknowledgments").update({ acknowledged_at: new Date().toISOString(), ack_user_agent: ua }).eq("id", row.id).is("acknowledged_at", null);
  await audit(null, `consultant:${row.email}`, "announcement_acknowledged", { campaign: row.campaign });
  // Let the timesheets inbox know (no reply needed).
  await send(company.timesheetsEmail, `${row.name} acknowledged the new timesheet process`, [
    `${row.name} (${row.email}) acknowledged the new timesheet process announcement.`,
    "You can see everyone's status under Admin portal → Announcements.",
  ], undefined, { from: "timesheets", signature: "Stagity Solutions Portal" });
  revalidatePath("/hr/announce");
  return { ok: true };
}
