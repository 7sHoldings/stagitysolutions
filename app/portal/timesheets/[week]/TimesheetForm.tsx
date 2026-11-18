"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { getTimesheetUploadUrl, recordTimesheetFile, removeTimesheetFile, saveTimesheet } from "../actions";
import { dayName, isWeekend, shortDate } from "@/lib/portal/dates";

type F = { id: string; name: string; url?: string };

/** Shrinks big photos/screenshots to a sharp JPEG (max 2400px) so uploads are quick. */
async function prepare(file: File): Promise<{ blob: Blob; mime: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif" || file.size < 1_500_000) {
    return { blob: file, mime: file.type };
  }
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    return blob ? { blob, mime: "image/jpeg" } : { blob: file, mime: file.type };
  } catch {
    return { blob: file, mime: file.type };
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

export default function TimesheetForm({ week, dates, initialHours, initialNotes, editable, initialFiles, employment, canSubmit, submitFromLabel }: {
  week: string; dates: string[]; initialHours: (number | null)[]; initialNotes: string; editable: boolean; initialFiles: F[];
  employment: { start: string | null; end: string | null }; canSubmit: boolean; submitFromLabel: string;
}) {
  const router = useRouter();
  const employed = (d: string) => (!employment.start || d >= employment.start) && (!employment.end || d <= employment.end);
  const [hours, setHours] = useState(initialHours.map((h) => (h === null ? "" : String(h))));
  const [notes, setNotes] = useState(initialNotes);
  const [files, setFiles] = useState<F[]>(initialFiles);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const snapshot = (h: string[], n: string) => JSON.stringify([h, n]);
  const [saved, setSaved] = useState(() => snapshot(initialHours.map((h) => (h === null ? "" : String(h))), initialNotes));
  const dirty = editable && snapshot(hours, notes) !== saved;

  // Warn before leaving the page with hours that haven't been saved.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const total = round(hours.reduce((a, h) => a + (Number(h) || 0), 0));
  const required = dates.filter((d) => !isWeekend(d) && employed(d));
  const missing = dates.filter((d, i) => !isWeekend(d) && employed(d) && hours[i].trim() === "").length;

  const setDay = (i: number, v: string) => setHours((h) => h.map((x, j) => (j === i ? v : x)));
  const fillWeekdays = (v: string) => setHours((h) => h.map((x, i) => (!isWeekend(dates[i]) && employed(dates[i]) ? v : x)));

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    e.target.value = "";
    setBusy(true);
    setMsg(null);
    for (const file of list) {
      if (file.size > 10 * 1024 * 1024) { setMsg({ text: `${file.name} is over 10 MB.` }); continue; }
      const { blob, mime } = await prepare(file);
      const up = await getTimesheetUploadUrl(week, mime);
      if ("error" in up && up.error) { setMsg({ text: up.error }); continue; }
      const res = await fetch(up.url!, { method: "PUT", body: blob, headers: { "content-type": mime } });
      if (!res.ok) { setMsg({ text: `Upload of ${file.name} failed.` }); continue; }
      const rec = await recordTimesheetFile(week, up.path!, mime, file.name);
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
    if (submit) {
      // Explain exactly what's missing instead of silently doing nothing.
      const problems: string[] = [];
      if (!canSubmit) problems.push(`This week can be submitted from ${submitFromLabel}. You can save a draft now.`);
      if (missing > 0) problems.push(`Fill in ${missing} empty weekday${missing === 1 ? "" : "s"} (enter 0 for holidays or days off).`);
      if (!files.length) problems.push("Upload your approved timesheet (screenshot or PDF from your client or vendor portal) in step 2.");
      if (problems.length) {
        setMsg({ text: problems.join(" ") });
        setTimeout(() => document.getElementById("ts-msg")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
        return;
      }
    }
    start(async () => {
      const r = await saveTimesheet(week, hours.map((h) => (h.trim() === "" ? null : Number(h))), notes, submit);
      if (r.error) setMsg({ text: r.error });
      else if (submit) {
        // Back to the timesheet list; the hours are now locked until HR reviews them.
        setSaved(snapshot(hours, notes));
        router.replace(`/portal?submitted=${week}`);
      } else {
        setSaved(snapshot(hours, notes));
        setMsg({ ok: true, text: "Draft saved. Your hours are kept, so you can come back and finish this week later." });
        router.refresh();
      }
    });
  }

  return (
    <div className="ts-form">
      {/* Step 1: hours */}
      <section className="ts-step">
        <div className="ts-step-head">
          <span className="ts-num">1</span>
          <div>
            <h2 className="i9-h3">Hours worked</h2>
            <p className="muted i9-small">
              {editable
                ? "Enter hours for every weekday (Mon–Fri). Put 0 for holidays, PTO or days off. Weekends can't have hours."
                : "Submitted hours are locked. If something is wrong, contact HR; they can send it back for you to fix."}
            </p>
          </div>
        </div>

        {editable && required.length > 0 && (
          <div className="ts-quick">
            <button type="button" className="ts-chip" onClick={() => fillWeekdays("8")}>8 h every weekday</button>
            <button type="button" className="ts-chip" onClick={() => fillWeekdays("0")}>0 every weekday</button>
            <button type="button" className="ts-chip" onClick={() => fillWeekdays("")}>Clear</button>
          </div>
        )}

        <div className="ts-days">
          {dates.map((d, i) => {
            const weekend = isWeekend(d);
            const can = employed(d);
            const needed = editable && !weekend && can && hours[i].trim() === "";
            const locked = !editable || !can || weekend;
            return (
              <label key={d} className={`ts-day ${weekend ? "weekend" : ""} ${needed ? "need" : ""} ${!can ? "off" : ""} ${locked ? "locked" : ""}`}>
                <span className="ts-day-name">
                  <strong>{dayName(d)}</strong>
                  <span>{shortDate(d)}</span>
                </span>
                <span className="ts-day-tag">{weekend ? "Weekend" : !can ? "Not employed" : needed ? "Required" : ""}</span>
                {locked ? (
                  <span className="ts-day-value">{weekend ? "—" : hours[i].trim() === "" ? "—" : `${Number(hours[i])} h`}</span>
                ) : (
                  <span className="ts-day-input">
                    <input
                      type="number" inputMode="decimal" min={0} max={24} step={0.25}
                      value={hours[i]}
                      onChange={(e) => setDay(i, e.target.value)}
                      placeholder="–"
                      aria-label={`Hours on ${dayName(d)} ${shortDate(d)}`}
                    />
                    <span className="ts-unit">h</span>
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="ts-total">
          <span>Total</span>
          <strong>{total} h</strong>
          {total > 40 && <span className="muted i9-small">({round(total - 40)} h overtime this week)</span>}
          {editable && missing > 0 && <span className="ts-missing">{missing} weekday{missing === 1 ? "" : "s"} still empty</span>}
        </div>
      </section>

      {/* Step 2: approved timesheet */}
      <section className="ts-step">
        <div className="ts-step-head">
          <span className="ts-num">2</span>
          <div>
            <h2 className="i9-h3">Approved timesheet</h2>
            <p className="muted i9-small">
              A screenshot or PDF from your client or vendor portal showing it&apos;s <strong>approved</strong> and the hours per day. Required.
            </p>
          </div>
        </div>
        {files.map((f) => (
          <div key={f.id} className="ts-file">
            <span className="ts-file-icon" aria-hidden="true">✓</span>
            <span className="ts-file-name">{f.url ? <a href={f.url} target="_blank" rel="noreferrer">{f.name}</a> : f.name}</span>
            {editable && <button type="button" className="ts-file-remove" onClick={() => remove(f.id)}>Remove</button>}
          </div>
        ))}
        {editable && (
          <label className={`ts-drop ${busy ? "busy" : ""}`}>
            <input type="file" accept="image/*,application/pdf" multiple onChange={upload} disabled={busy} hidden />
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <strong>{busy ? "Uploading…" : files.length ? "Add another file" : "Upload approved timesheet"}</strong>
            <span className="muted i9-small">PDF, JPG or PNG · up to 10 MB</span>
          </label>
        )}
        {!editable && !files.length && <p className="muted">No file uploaded.</p>}
      </section>

      {/* Step 3: notes & submit */}
      <section className="ts-step">
        <div className="ts-step-head">
          <span className="ts-num">3</span>
          <div>
            <h2 className="i9-h3">{editable ? "Notes & submit" : "Notes"}</h2>
            {editable && <p className="muted i9-small">Optional. Anything HR should know, e.g. a holiday or a correction.</p>}
          </div>
        </div>
        <label className="field">
          <span className="sr-only">Notes for HR</span>
          {editable ? (
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ minHeight: 90 }} placeholder="e.g. Thanksgiving holiday on Thursday" />
          ) : (
            <span className="ts-notes-ro">{notes || "No notes"}</span>
          )}
        </label>

        {msg && <p id="ts-msg" className={`form-status ${msg.ok ? "ok" : "err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
        {editable && (
          <>
            <ul className="ts-check">
              <li className={missing === 0 ? "ok" : ""}>Every weekday filled in</li>
              <li className={files.length ? "ok" : ""}>Approved timesheet uploaded</li>
            </ul>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" disabled={pending || busy} onClick={() => save(true)}>
                {pending ? "Submitting…" : "Submit to HR"}
              </button>
              <button type="button" className="btn btn-outline" disabled={pending || busy} onClick={() => save(false)}>Save draft</button>
              {dirty && <span className="ts-dirty">● Unsaved changes</span>}
            </div>
            <p className="muted i9-small">Not finished? <strong>Save draft</strong> keeps the hours you&apos;ve entered so far. Submit when the week is complete.</p>
            {!canSubmit && <p className="muted i9-small">This week can be submitted from {submitFromLabel}.</p>}
          </>
        )}
      </section>
    </div>
  );
}
