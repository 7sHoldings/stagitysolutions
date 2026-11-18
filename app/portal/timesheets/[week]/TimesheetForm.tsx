"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { getTimesheetUploadUrl, recordTimesheetFile, removeTimesheetFile, saveTimesheet } from "../actions";
import { dayName, isWeekend, shortDate } from "@/lib/portal/dates";

type F = { id: string; name: string; url?: string };

export default function TimesheetForm({ week, dates, initialHours, initialNotes, editable, initialFiles, employment, canSubmit }: {
  week: string; dates: string[]; initialHours: (number | null)[]; initialNotes: string; editable: boolean; initialFiles: F[];
  employment: { start: string | null; end: string | null }; canSubmit: boolean;
}) {
  const employed = (d: string) => (!employment.start || d >= employment.start) && (!employment.end || d <= employment.end);
  const router = useRouter();
  const [hours, setHours] = useState(initialHours.map((h) => (h === null ? "" : String(h))));
  const [notes, setNotes] = useState(initialNotes);
  const [files, setFiles] = useState<F[]>(initialFiles);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const total = hours.reduce((a, h) => a + (Number(h) || 0), 0);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    setBusy(true);
    setMsg(null);
    for (const file of list) {
      if (file.size > 10 * 1024 * 1024) { setMsg({ text: `${file.name} is over 10 MB.` }); continue; }
      const up = await getTimesheetUploadUrl(week, file.type);
      if ("error" in up && up.error) { setMsg({ text: up.error }); continue; }
      const res = await fetch(up.url!, { method: "PUT", body: file, headers: { "content-type": file.type } });
      if (!res.ok) { setMsg({ text: `Upload of ${file.name} failed.` }); continue; }
      const rec = await recordTimesheetFile(week, up.path!, file.type, file.name);
      if ("error" in rec && rec.error) { setMsg({ text: rec.error }); continue; }
      setFiles((f) => [...f, { id: rec.id!, name: file.name }]);
    }
    setBusy(false);
  }

  async function remove(id: string) {
    const r = await removeTimesheetFile(week, id);
    if ("error" in r && r.error) setMsg({ text: r.error });
    else setFiles((f) => f.filter((x) => x.id !== id));
  }

  function save(submit: boolean) {
    setMsg(null);
    start(async () => {
      const r = await saveTimesheet(week, hours.map((h) => (h.trim() === "" ? null : Number(h))), notes, submit);
      if ("error" in r && r.error) setMsg({ text: r.error });
      else {
        setMsg({ ok: true, text: r.message ?? "Saved." });
        router.refresh();
      }
    });
  }

  return (
    <div className="i9-stack" style={{ gap: 24 }}>
      <div className="form-card">
        <h2 className="i9-h3">Hours worked</h2>
        <p className="muted i9-small">Fill in every weekday. Enter 0 for holidays, PTO or days you didn&apos;t work. Weekends are optional.</p>
        <div className="i9-hours">
          {dates.map((d, i) => (
            <label key={d} className="field">
              <span className="i9-day">{dayName(d)}<span className="muted">{shortDate(d)}</span></span>
              <input
                type="number" inputMode="decimal" min={0} max={24} step={0.25} value={hours[i]} disabled={!editable || !employed(d)}
                onChange={(e) => setHours((h) => h.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={isWeekend(d) ? "–" : "Hours"}
                className={!isWeekend(d) && employed(d) && hours[i].trim() === "" ? "i9-need" : ""}
              />
            </label>
          ))}
        </div>
        <p><strong>Total: {Math.round(total * 100) / 100} hours</strong>{total > 40 && <span className="muted"> ({Math.round((total - 40) * 100) / 100} overtime)</span>}</p>
        <label className="field">
          Notes (optional)
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!editable} rows={2} style={{ minHeight: 70 }} placeholder="e.g. Thanksgiving holiday on Thursday" />
        </label>
      </div>

      <div className="form-card">
        <h2 className="i9-h3">Client-approved timesheet</h2>
        <p className="muted i9-small">Upload the approved timesheet from your client&apos;s portal: a PDF, screenshot or photo. It must show the approval.</p>
        {files.map((f) => (
          <div key={f.id} className="i9-upload done">
            <div>{f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a> : f.name}</div>
            {editable && <button type="button" className="btn btn-outline" onClick={() => remove(f.id)}>Remove</button>}
          </div>
        ))}
        {editable && (
          <label className="btn btn-outline" style={{ alignSelf: "flex-start" }}>
            {busy ? "Uploading…" : files.length ? "Add another file" : "Upload approved timesheet"}
            <input type="file" accept="image/*,application/pdf" multiple onChange={upload} disabled={busy} hidden />
          </label>
        )}
      </div>

      {msg && <p className={`form-status ${msg.ok ? "ok" : "err"}`} role="status">{msg.text}</p>}
      {editable && (
        <div className="btn-row">
          <button type="button" className="btn btn-primary" disabled={pending || busy || !canSubmit} onClick={() => save(true)} title={canSubmit ? undefined : "You can submit on the last weekday of this period"}>
            {pending ? "Saving…" : "Submit to HR"}
          </button>
          <button type="button" className="btn btn-outline" disabled={pending || busy} onClick={() => save(false)}>Save draft</button>
        </div>
      )}
    </div>
  );
}
