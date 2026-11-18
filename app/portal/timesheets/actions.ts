"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { audit, db } from "@/lib/i9/server";
import { portalPerson } from "@/lib/portal/server";
import { datesBetween, isPeriodStart, isWeekend, periodFor, round2, submitFrom, todayCT } from "@/lib/portal/dates";
import { recomputeWeekOvertime } from "@/lib/portal/timesheets";
import { notifyTimesheetSubmitted } from "@/lib/portal/mail";

import { TS_BUCKET } from "@/lib/portal/server";
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf",
};

async function me() {
  const p = await portalPerson();
  if (!p || p.must_change_password || p.kind !== "consultant") return null;
  return p;
}

function validWeek(week: string, start: string | null) {
  if (!isPeriodStart(week)) return false;
  if (week > todayCT()) return false; // no future periods
  if (start && periodFor(week).end < start) return false; // before they started
  return true;
}

/** Gets (or creates) the person's editable timesheet for a week. */
async function editableSheet(personId: string, week: string) {
  const { data: existing } = await db().from("stagity_timesheets").select("*").eq("person_id", personId).eq("week_start", week).maybeSingle();
  if (existing) return ["draft", "rejected"].includes(existing.status) ? existing : null;
  const { data } = await db().from("stagity_timesheets").insert({ person_id: personId, week_start: week }).select("*").single();
  return data;
}

/**
 * hours: one entry per date in the period; null = left blank.
 * To submit, every weekday the consultant was employed must be filled in (0 for holidays or days off).
 */
export async function saveTimesheet(week: string, rawHours: (number | null)[], notes: string, submit: boolean): Promise<{
  ok?: boolean; message?: string; error?: string;
}> {
  const p = await me();
  if (!p) return { error: "Please sign in again." };
  if (!validWeek(week, p.start_date)) return { error: "You can't enter time for that period." };
  const period = periodFor(week);
  const dates = datesBetween(period.start, period.end);
  const sheet = await editableSheet(p.id, week);
  if (!sheet) return { error: "This timesheet has already been submitted." };

  const employed = (d: string) => (!p.start_date || d >= p.start_date) && (!p.end_date || d <= p.end_date);
  const hours = dates.map((_, i) => {
    const h = rawHours[i];
    return h === null || h === undefined || Number.isNaN(Number(h)) ? null : round2(Math.min(24, Math.max(0, Number(h))));
  });
  const total = round2(hours.reduce<number>((a, b) => a + (b ?? 0), 0));

  if (submit) {
    if (submitFrom(period) > todayCT()) return { error: `You can submit this timesheet from ${submitFrom(period)}.` };
    const blank = dates.filter((d, i) => !isWeekend(d) && employed(d) && hours[i] === null);
    if (blank.length) return { error: "Fill in every weekday. Enter 0 for holidays or days you didn't work." };
    const { count } = await db().from("stagity_timesheet_files").select("id", { count: "exact", head: true }).eq("timesheet_id", sheet.id);
    if (!count) return { error: "Upload a screenshot or PDF of your approved timesheet from your client or vendor portal before submitting." };
  }

  await db().from("stagity_timesheet_days").delete().eq("timesheet_id", sheet.id);
  const days = dates
    .map((d, i) => ({ timesheet_id: sheet.id, person_id: p.id, work_date: d, hours: hours[i] }))
    .filter((d) => d.hours !== null)
    .map((d) => ({ ...d, hours: d.hours as number, regular_hours: d.hours as number, overtime_hours: 0 }));
  if (days.length) {
    const { error } = await db().from("stagity_timesheet_days").insert(days);
    if (error) return { error: "Couldn't save your hours. Please try again." };
  }
  await recomputeWeekOvertime(p.id, period.start);

  await db()
    .from("stagity_timesheets")
    .update({
      total_hours: total,
      notes: notes.slice(0, 1000) || null,
      updated_at: new Date().toISOString(),
      ...(submit ? { status: "submitted", submitted_at: new Date().toISOString(), review_note: null } : {}),
    })
    .eq("id", sheet.id);
  if (submit) {
    await audit(null, `person:${p.id}`, "timesheet_submitted", { period: week, total });
    await notifyTimesheetSubmitted(sheet.id);
  }
  revalidatePath("/portal");
  return { ok: true, message: submit ? "Submitted. HR will review it." : "Saved as draft." };
}

export async function getTimesheetUploadUrl(week: string, mime: string) {
  const p = await me();
  if (!p) return { error: "Please sign in again." };
  if (!validWeek(week, p.start_date)) return { error: "Invalid week." };
  const ext = MIME_EXT[mime];
  if (!ext) return { error: "Please upload a PDF or a photo/screenshot (JPG, PNG)." };
  const sheet = await editableSheet(p.id, week);
  if (!sheet) return { error: "This timesheet has already been submitted." };
  const path = `${p.id}/${week}/${randomUUID()}.${ext}`;
  const { data, error } = await db().storage.from(TS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { error: "Upload isn't available right now." };
  return { url: data.signedUrl, path };
}

export async function recordTimesheetFile(week: string, path: string, mime: string, name: string) {
  const p = await me();
  if (!p) return { error: "Please sign in again." };
  if (!path.startsWith(`${p.id}/${week}/`) || path.includes("..")) return { error: "Invalid upload." };
  const sheet = await editableSheet(p.id, week);
  if (!sheet) return { error: "This timesheet has already been submitted." };
  const folder = path.slice(0, path.lastIndexOf("/"));
  const file = path.slice(folder.length + 1);
  const { data: found } = await db().storage.from(TS_BUCKET).list(folder, { search: file });
  if (!found?.some((f) => f.name === file)) return { error: "The upload didn't finish. Please try again." };
  const { data, error } = await db()
    .from("stagity_timesheet_files")
    .insert({ timesheet_id: sheet.id, storage_path: path, mime_type: mime, original_name: name.slice(0, 200) })
    .select("id")
    .single();
  if (error || !data) return { error: "Couldn't save the upload." };
  return { ok: true, id: data.id as string };
}

export async function removeTimesheetFile(week: string, fileId: string) {
  const p = await me();
  if (!p) return { error: "Please sign in again." };
  const sheet = await editableSheet(p.id, week);
  if (!sheet) return { error: "This timesheet has already been submitted." };
  const { data: f } = await db().from("stagity_timesheet_files").select("*").eq("id", fileId).eq("timesheet_id", sheet.id).maybeSingle();
  if (!f) return { error: "File not found." };
  await db().storage.from(TS_BUCKET).remove([f.storage_path]);
  await db().from("stagity_timesheet_files").delete().eq("id", f.id);
  return { ok: true };
}
