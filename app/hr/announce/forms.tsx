"use client";

import { useActionState } from "react";
import { remindPending, removeRecipient, resendOne, sendAnnouncementTo } from "./actions";
import { Status } from "../forms";
import { ConfirmAction, ModalButton } from "../Modal";
import type { ActionState } from "../actions";

/** Renders the email text the same way the email does ("## " = heading, line breaks kept). */
export function EmailPreview({ subject, body }: { subject: string; body: string[] }) {
  return (
    <div className="ack-preview">
      <p className="ack-subject"><span className="muted">Subject:</span> {subject}</p>
      <p className="muted i9-small">From: Stagity Solutions Timesheets &lt;timesheets@stagitysolutions.com&gt;</p>
      <div className="ack-body">
        {body.map((p, i) => (p.startsWith("## ") ? <h4 key={i}>{p.slice(3)}</h4> : <p key={i} style={{ whiteSpace: "pre-line" }}>{p}</p>))}
        <p><span className="btn btn-primary hr-btn-sm" style={{ pointerEvents: "none" }}>I acknowledge</span></p>
        <p className="muted i9-small">Stagity Solutions</p>
      </div>
    </div>
  );
}

export function PreviewButton({ subject, body }: { subject: string; body: string[] }) {
  return (
    <ModalButton label="Preview email" title="Email preview" className="btn btn-outline hr-btn-sm" wide>
      {() => <EmailPreview subject={subject} body={body} />}
    </ModalButton>
  );
}

export function SendForm({ defaultRecipients, defaultMonth, defaultAckBy }: { defaultRecipients: string; defaultMonth: string; defaultAckBy: string }) {
  const [s, action, pending] = useActionState(sendAnnouncementTo, {} as ActionState);
  return (
    <form action={action} className="form-card i9-stack" style={{ gap: 16 }}>
      <h2 className="i9-h3">Send the announcement</h2>
      <label className="field">
        <span>Consultants<span className="field-hint"> (one per line: name, email)</span></span>
        <textarea name="recipients" rows={7} defaultValue={defaultRecipients} style={{ minHeight: 170, fontFamily: "inherit" }} required />
      </label>
      <div className="form-grid">
        <label className="field"><span>First month in the portal<span className="field-hint"> (timesheets they submit there)</span></span><input type="month" name="startMonth" defaultValue={defaultMonth} required /></label>
        <label className="field"><span>Acknowledge by<span className="field-hint"> (optional)</span></span><input type="date" name="ackBy" defaultValue={defaultAckBy} /></label>
      </div>
      <p className="muted i9-small">Each person gets their own email with an <strong>I acknowledge</strong> button. Anyone who already acknowledged isn&apos;t emailed again. Until the acknowledge-by date, anyone who hasn&apos;t acknowledged gets the email again automatically every morning.</p>
      <Status s={s} />
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Sending…" : "Send to all"}</button>
    </form>
  );
}

export function RemindButton({ campaign, pending: count }: { campaign: string; pending: number }) {
  const [s, action, busy] = useActionState(remindPending, {} as ActionState);
  if (!count) return null;
  return (
    <form action={action} className="i9-stack" style={{ gap: 6, alignItems: "flex-end" }}>
      <input type="hidden" name="campaign" value={campaign} />
      <button className="btn btn-outline hr-btn-sm" disabled={busy}>{busy ? "Sending…" : `Remind ${count} who haven't acknowledged`}</button>
      <Status s={s} />
    </form>
  );
}

export function RowActions({ id, name }: { id: string; name: string }) {
  const [s, action, busy] = useActionState(resendOne, {} as ActionState);
  return (
    <span className="hr-td-actions">
      <form action={action} style={{ display: "inline" }}>
        <input type="hidden" name="id" value={id} />
        <button className="hr-link" disabled={busy}>{busy ? "Sending…" : s.ok ? "Sent ✓" : "Resend"}</button>
      </form>
      <ConfirmAction
        action={removeRecipient}
        fields={{ id }}
        label="Remove"
        className="hr-link danger"
        title="Remove from list?"
        message={<>Remove <strong>{name}</strong> from this announcement? Their link will stop working.</>}
        confirmLabel="Yes, remove"
      />
      {s.error && <span className="i9-small" style={{ color: "#b91c1c" }}>{s.error}</span>}
    </span>
  );
}
