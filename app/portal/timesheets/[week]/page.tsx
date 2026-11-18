import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/i9/server";
import { requirePerson, TS_BUCKET } from "@/lib/portal/server";
import { mondayOf, todayCT, weekDates, weekLabel } from "@/lib/portal/dates";
import TimesheetForm from "./TimesheetForm";

export default async function TimesheetPage({ params }: { params: Promise<{ week: string }> }) {
  const p = await requirePerson();
  const { week } = await params;
  if (p.kind !== "consultant" || !/^\d{4}-\d{2}-\d{2}$/.test(week) || mondayOf(week) !== week || week > mondayOf(todayCT())) notFound();

  const { data: sheet } = await db().from("stagity_timesheets").select("*").eq("person_id", p.id).eq("week_start", week).maybeSingle();
  const [{ data: days }, { data: files }] = sheet
    ? await Promise.all([
        db().from("stagity_timesheet_days").select("work_date, hours").eq("timesheet_id", sheet.id),
        db().from("stagity_timesheet_files").select("id, storage_path, original_name, mime_type").eq("timesheet_id", sheet.id).order("uploaded_at"),
      ])
    : [{ data: [] }, { data: [] }];
  const hours = weekDates(week).map((d) => Number(days?.find((x) => x.work_date === d)?.hours ?? 0));
  const editable = !sheet || ["draft", "rejected"].includes(sheet.status);
  const urls = new Map<string, string>();
  if (files?.length) {
    const { data } = await db().storage.from(TS_BUCKET).createSignedUrls(files.map((f) => f.storage_path), 600);
    data?.forEach((x) => x.path && x.signedUrl && urls.set(x.path, x.signedUrl));
  }

  return (
    <section className="container i9-page" style={{ maxWidth: 880 }}>
      <p><Link href="/portal">← Portal home</Link></p>
      <div>
        <p className="eyebrow">Timesheet</p>
        <h1 className="h2">{weekLabel(week)}</h1>
      </div>
      {sheet?.status === "rejected" && (
        <p className="form-status err">HR sent this back: {sheet.review_note || "please review and resubmit."}</p>
      )}
      {sheet?.status === "submitted" && <p className="form-status ok">Submitted. HR is reviewing it.</p>}
      {sheet?.status === "approved" && <p className="form-status ok">Approved by HR.</p>}
      <TimesheetForm
        week={week}
        dates={weekDates(week)}
        initialHours={hours}
        initialNotes={sheet?.notes ?? ""}
        editable={editable}
        initialFiles={(files ?? []).map((f) => ({ id: f.id, name: f.original_name ?? "file", url: urls.get(f.storage_path) }))}
      />
    </section>
  );
}
