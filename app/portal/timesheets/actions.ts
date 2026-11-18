"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { audit, db } from "@/lib/i9/server";
import { portalPerson } from "@/lib/portal/server";
import { addDays, mondayOf, round2, splitOvertime, todayCT, weekDates } from "@/lib/portal/dates";

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || mondayOf(week) !== week) return false;
  if (week > mondayOf(todayCT())) return false; // no future weeks
  if (start && addDays(week, 6) < start) return false; // before they started
  return true;
}

/** Gets (or creates) the person's editable timesheet for a week. */
async function editableSheet(personId: string, week: string) {
  const { data: existing } = await db().from("stagity_timesheets").select("*").eq("person_id", personId).eq("week_start", week).maybeSingle();
  if (existing) return ["draft", "rejected"].includes(existing.status) ? existing : null;
  const { data } = await db().from("stagity_timesheets").insert({ person_id: personId, week_start: week }).select("*").single();
  return data;
}

export async function saveTimesheet(week: string, rawHours: number[], notes: string, submit: boolean) {
  const p = await me();
  if (!p) return { error: "Please sign in again." };
  if (!validWeek(week, p.start_date)) return { error: "You can't enter time for that week." };
  const hours = weekDates(week).map((_, i) => round2(Math.min(24, Math.max(0, Number(rawHours[i]) || 0))));
  const sheet = await editableSheet(p.id, week);
  if (!sheet) return { error: "This timesheet has already been submitted." };
  const total = round2(hours.reduce((a, b) => a + b, 0));

  if (submit) {
    const { count } = await db().from("stagity_timesheet_files").select("id", { count: "exact", head: true }).eq("timesheet_id", sheet.id);
    if (total > 0 && !count) return { error: "Upload your client-approved timesheet before submitting." };
  }

  const split = splitOvertime(hours);
  await db().from("stagity_timesheet_days").delete().eq("timesheet_id", sheet.id);
  const days = weekDates(week)
    .map((d, i) => ({ timesheet_id: sheet.id, person_id: p.id, work_date: d, hours: hours[i], regular_hours: split[i].regular, overtime_hours: split[i].overtime }))
    .filter((d) => d.hours > 0);
  if (days.length) {
    const { error } = await db().from("stagity_timesheet_days").insert(days);
    if (error) return { error: "Couldn't save your hours. Please try again." };
  }
  await db()
    .from("stagity_timesheets")
    .update({
      total_hours: total,
      notes: notes.slice(0, 1000) || null,
      updated_at: new Date().toISOString(),
      ...(submit ? { status: "submitted", submitted_at: new Date().toISOString(), review_note: null } : {}),
    })
    .eq("id", sheet.id);
  if (submit) await audit(null, `person:${p.id}`, "timesheet_submitted", { week, total });
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
