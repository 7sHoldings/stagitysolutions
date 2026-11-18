"use client";

import { useActionState, useEffect, useState } from "react";
import { remindAll, remindConsultant, reviewTimesheet } from "./actions";
import { Modal } from "../Modal";
import { Status } from "../forms";
import type { ActionState } from "../actions";

/** Shows exactly what will be emailed, then sends from timesheets@. */
export function RemindButton({ personId, month, name, email, missing, monthName, remindedToday }: {
  personId: string; month: string; name: string; email: string; missing: string[]; monthName: string; remindedToday: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(remindConsultant, {} as ActionState);
  useEffect(() => { if (s.ok) setOpen(false); }, [s]);
  if (s.ok) return <span className="hr-sent">✓ Reminded</span>;
  return (
    <>
      <button type="button" className={`btn hr-btn-xs ${remindedToday ? "btn-outline" : "hr-btn-remind"}`} onClick={() => setOpen(true)}>
        {remindedToday ? "Remind again" : "Send reminder"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Remind ${name}?`}>
        <form action={action} className="i9-stack" style={{ gap: 16 }}>
          <input type="hidden" name="personId" value={personId} />
          <input type="hidden" name="month" value={month} />
          <div className="hr-preview">
            <p className="muted i9-small">To {email} · from timesheets@stagitysolutions.com</p>
            <p><strong>Reminder: timesheets for {monthName}</strong></p>
            <p className="i9-small">We&apos;re still missing your approved timesheets for:</p>
            <ul className="hr-missing">{missing.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
          {remindedToday && <p className="muted i9-small">They were already reminded today.</p>}
          {s.error && <p className="form-status err" role="alert">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Sending…" : "Send reminder"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function RemindAllButton({ month, monthName, people }: { month: string; monthName: string; people: { name: string; count: number }[] }) {
  const [open, setOpen] = useState(false);
  const [s, action, pending] = useActionState(remindAll, {} as ActionState);
  useEffect(() => { if (s.ok) setOpen(false); }, [s]);
  if (!people.length) return null;
  return (
    <>
      <button type="button" className="btn btn-primary hr-btn-sm" onClick={() => setOpen(true)}>
        Remind all missing ({people.length})
      </button>
      {s.ok && <span className="hr-sent">✓ {s.message}</span>}
      <Modal open={open} onClose={() => setOpen(false)} title={`Send ${monthName} reminders?`}>
        <form action={action} className="i9-stack" style={{ gap: 16 }}>
          <input type="hidden" name="month" value={month} />
          <p className="text">Each of these consultants gets one email from timesheets@ listing exactly which weeks are missing:</p>
          <ul className="hr-missing">{people.map((p) => <li key={p.name}>{p.name} <span className="muted">· {p.count} week{p.count === 1 ? "" : "s"} missing</span></li>)}</ul>
          {s.error && <p className="form-status err" role="alert">{s.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Sending…" : `Send ${people.length} reminder${people.length === 1 ? "" : "s"}`}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function ReviewForm({ id, status }: { id: string; status: string }) {
  const [s, action, pending] = useActionState(reviewTimesheet, {} as ActionState);
  return (
    <form action={action} className="form-card">
      <input type="hidden" name="id" value={id} />
      <h2 className="i9-h3">Review</h2>
      <p className="muted i9-small">Open the attachment above. Approve only if it shows the client&apos;s approval and the hours match. The consultant is emailed either way.</p>
      <label className="field">Comment to consultant (required to reject)<textarea name="note" rows={2} style={{ minHeight: 70 }} placeholder="e.g. The timesheet is not approved. Please upload the approved timesheet." /></label>
      <Status s={s} />
      <div className="btn-row">
        {status === "submitted" && <button className="btn btn-primary" name="decision" value="approve" disabled={pending}>Approve</button>}
        <button className="btn btn-outline" name="decision" value="reject" disabled={pending}>Reject</button>
      </div>
    </form>
  );
}

// ---------- Quick review (approve / reject without opening each timesheet) ----------

export type ReviewFile = { name: string; url: string | null; mime: string | null };
export type ReviewItem = {
  id: string; name: string; label: string; total: number; late: boolean; notes: string | null;
  days: { day: string; hours: number }[]; files: ReviewFile[];
};

/** Full-size viewer for the uploaded approved timesheets, with previous / next. */
function Viewer({ files, start, onClose, title }: { files: ReviewFile[]; start: number; onClose: () => void; title: string }) {
  const [i, setI] = useState(start);
  const f = files[i];
  const isPdf = f?.mime === "application/pdf";
  return (
    <Modal open onClose={onClose} title={title} wide>
      <div className="rv-viewer">
        {f?.url ? (
          isPdf ? (
            <iframe src={f.url} title={f.name} className="rv-pdf" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.url} alt={f.name} className="rv-img" />
          )
        ) : (
          <p className="muted">This file can&apos;t be shown.</p>
        )}
        <div className="rv-viewer-bar">
          <button type="button" className="btn btn-outline hr-btn-sm" disabled={i === 0} onClick={() => setI(i - 1)}>‹ Previous</button>
          <span className="muted i9-small">{f?.name} · {i + 1} of {files.length}</span>
          <button type="button" className="btn btn-outline hr-btn-sm" disabled={i >= files.length - 1} onClick={() => setI(i + 1)}>Next ›</button>
        </div>
        {f?.url && <a href={f.url} target="_blank" rel="noreferrer" className="i9-small">Open in a new tab</a>}
      </div>
    </Modal>
  );
}

function ReviewCard({ item }: { item: ReviewItem }) {
  const [approveState, approve, approving] = useActionState(reviewTimesheet, {} as ActionState);
  const [rejectState, reject, rejecting] = useActionState(reviewTimesheet, {} as ActionState);
  const [view, setView] = useState<number | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  useEffect(() => { if (rejectState.ok) setRejectOpen(false); }, [rejectState]);

  if (approveState.ok) return <div className="rv-card done"><strong>{item.name}</strong> · {item.label}<span className="hr-sent">✓ Approved</span></div>;
  if (rejectState.ok) return <div className="rv-card done"><strong>{item.name}</strong> · {item.label}<span className="i9-small" style={{ color: "#b91c1c", fontWeight: 600 }}>✕ Rejected, consultant emailed</span></div>;

  return (
    <div className="rv-card">
      <div className="rv-main">
        <div className="rv-head">
          <strong>{item.name}</strong>
          <span className="muted"> · {item.label}</span>
          {item.late && <span className="i9-dot late" style={{ marginLeft: 8 }}>late</span>}
        </div>
        <div className="rv-days">
          {item.days.map((d) => (
            <span key={d.day} className="rv-day"><span className="muted">{d.day}</span> {d.hours}</span>
          ))}
          <span className="rv-total">{item.total} h</span>
        </div>
        {item.notes && <p className="i9-small muted rv-note">“{item.notes}”</p>}
      </div>

      <div className="rv-files">
        {item.files.length ? (
          item.files.map((f, idx) => (
            <button key={idx} type="button" className="rv-thumb" onClick={() => setView(idx)} title={`View ${f.name}`}>
              {f.url && f.mime?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={f.name} />
              ) : (
                <span className="rv-pdf-chip">PDF</span>
              )}
            </button>
          ))
        ) : (
          <span className="rv-nofile">No file uploaded</span>
        )}
      </div>

      <div className="rv-actions">
        <form action={approve}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="decision" value="approve" />
          <button className="btn rv-approve" disabled={approving} title="Approve">{approving ? "…" : "✓ Approve"}</button>
        </form>
        <button type="button" className="btn rv-reject" onClick={() => setRejectOpen(true)} title="Reject with a comment">✕ Reject</button>
        {approveState.error && <span className="i9-small" style={{ color: "#b91c1c" }}>{approveState.error}</span>}
      </div>

      {view !== null && <Viewer files={item.files} start={view} onClose={() => setView(null)} title={`${item.name} · ${item.label}`} />}
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title={`Reject ${item.name}'s timesheet?`}>
        <form action={reject} className="i9-stack" style={{ gap: 16 }}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="decision" value="reject" />
          <p className="muted i9-small">{item.label} · {item.total} h. Your comment is emailed to the consultant, and the timesheet opens again for them to fix.</p>
          <label className="field">Comment
            <textarea name="note" rows={3} required defaultValue="The timesheet is not approved. Please upload the approved timesheet from your client portal." style={{ minHeight: 90 }} />
          </label>
          {rejectState.error && <p className="form-status err">{rejectState.error}</p>}
          <div className="hr-modal-actions">
            <button type="button" className="btn btn-outline hr-btn-sm" onClick={() => setRejectOpen(false)}>Cancel</button>
            <button className="btn hr-btn-sm hr-btn-solid-danger" disabled={rejecting}>{rejecting ? "Sending…" : "Reject & email"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  if (!items.length) return null;
  return (
    <section className="rv-queue">
      <div className="rv-queue-head">
        <h2 className="i9-h3">Waiting for your review ({items.length})</h2>
        <span className="muted i9-small">Click a file to see it full size. Approving emails the consultant and adds the hours to the invoice and payroll.</span>
      </div>
      {items.map((it) => <ReviewCard key={it.id} item={it} />)}
    </section>
  );
}
