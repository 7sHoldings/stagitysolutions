"use server";

import { revalidatePath } from "next/cache";
import { audit, db, requireHr } from "@/lib/i9/server";
import { newToken, sendAnnouncement, type AckRow } from "@/lib/announce";
import type { ActionState } from "../actions";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/**
 * One person per line, any of:
 *   Krutarth Panchal, krutarth@email.com
 *   Krutarth Panchal <krutarth@email.com>
 *   krutarth@email.com Krutarth Panchal
 */
function parseRecipients(text: string): { list: { name: string; email: string }[]; bad: string[] } {
  const list: { name: string; email: string }[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/);
    const email = m?.[0].toLowerCase() ?? "";
    const name = line.replace(m?.[0] ?? "", "").replace(/[<>,;:\t"]/g, " ").replace(/\s+/g, " ").trim();
    if (!emailOk(email) || !name) bad.push(line);
    else if (!list.some((r) => r.email === email)) list.push({ name, email });
  }
  return { list, bad };
}

export async function sendAnnouncementTo(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const ym = String(formData.get("startMonth") ?? "");
  const ackBy = String(formData.get("ackBy") ?? "");
  if (!/^\d{4}-\d{2}$/.test(ym)) return { error: "Choose the first month of timesheets in the portal." };
  if (ackBy && !/^\d{4}-\d{2}-\d{2}$/.test(ackBy)) return { error: "Enter a valid acknowledge-by date." };
  const { list, bad } = parseRecipients(String(formData.get("recipients") ?? ""));
  if (bad.length) return { error: `Each line needs a name and an email. Check: ${bad.slice(0, 3).join(" | ")}` };
  if (!list.length) return { error: "Add at least one consultant (name and email, one per line)." };
  if (list.length > 100) return { error: "Send to at most 100 people at a time." };

  const campaign = `timesheet-process-${ym}`;
  const startMonth = `${ym}-01`;
  const { data: people } = await db().from("stagity_people").select("id, email").in("email", list.map((r) => r.email));
  const sent: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  for (const r of list) {
    const { data: existing } = await db().from("stagity_acknowledgments").select("*").eq("campaign", campaign).eq("email", r.email).maybeSingle();
    if (existing?.acknowledged_at) {
      skipped.push(r.name);
      continue;
    }
    let row = existing as AckRow | null;
    if (!row) {
      const ins = await db()
        .from("stagity_acknowledgments")
        .insert({
          created_by: hr, campaign, name: r.name, email: r.email, token: newToken(), start_month: startMonth, ack_by: ackBy || null,
          person_id: people?.find((p) => p.email === r.email)?.id ?? null,
        })
        .select("*")
        .single();
      row = ins.data as AckRow | null;
    } else {
      await db().from("stagity_acknowledgments").update({ name: r.name, ack_by: ackBy || null }).eq("id", row.id);
      row = { ...row, name: r.name, ack_by: ackBy || null };
    }
    if (!row) {
      failed.push(r.name);
      continue;
    }
    ((await sendAnnouncement(row, hr)) ? sent : failed).push(r.name);
  }
  revalidatePath("/hr/announce");
  const parts = [
    sent.length ? `Sent to ${sent.length}: ${sent.join(", ")}.` : "",
    skipped.length ? `Already acknowledged, not sent again: ${skipped.join(", ")}.` : "",
  ].filter(Boolean);
  if (failed.length) return { error: [...parts, `Couldn't send to: ${failed.join(", ")}. Check the email settings and try again.`].join(" ") };
  return { ok: true, message: parts.join(" ") || "Nothing to send." };
}

/** Sends the same email again to everyone in the campaign who hasn't acknowledged yet. */
export async function remindPending(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const campaign = String(formData.get("campaign") ?? "");
  const { data } = await db().from("stagity_acknowledgments").select("*").eq("campaign", campaign).is("acknowledged_at", null);
  const rows = (data ?? []) as AckRow[];
  if (!rows.length) return { ok: true, message: "Everyone has acknowledged." };
  let ok = 0;
  for (const r of rows) if (await sendAnnouncement(r, hr)) ok++;
  revalidatePath("/hr/announce");
  return ok === rows.length ? { ok: true, message: `Reminder sent to ${ok}.` } : { error: `Sent ${ok} of ${rows.length}. Check the email settings.` };
}

export async function resendOne(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const { data } = await db().from("stagity_acknowledgments").select("*").eq("id", String(formData.get("id") ?? "")).maybeSingle();
  if (!data) return { error: "Not found." };
  if (data.acknowledged_at) return { error: "Already acknowledged." };
  const ok = await sendAnnouncement(data as AckRow, hr);
  revalidatePath("/hr/announce");
  return ok ? { ok: true, message: "Sent" } : { error: "Email failed." };
}

export async function removeRecipient(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const hr = await requireHr();
  const id = String(formData.get("id") ?? "");
  const { data } = await db().from("stagity_acknowledgments").select("email, campaign, acknowledged_at").eq("id", id).maybeSingle();
  if (!data) return { error: "Not found." };
  if (data.acknowledged_at) return { error: "They already acknowledged; that record is kept." };
  await db().from("stagity_acknowledgments").delete().eq("id", id);
  await audit(null, `hr:${hr}`, "announcement_recipient_removed", data);
  revalidatePath("/hr/announce");
  return { ok: true, message: "Removed." };
}
