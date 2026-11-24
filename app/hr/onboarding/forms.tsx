"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addPersonDoc, cancelSignature, getPersonDocUploadUrl, getTemplateUploadUrl, requestTemplateFor, resendInvite, returnItems, saveTemplate, setDue, setTemplate, startOnboarding,
} from "./actions";
import { Status } from "../forms";
import { ConfirmAction, ModalButton } from "../Modal";
import type { ActionState } from "../actions";

type Opt = { id: string; name: string };
const inDays = (n: number) => { const d = new Date(Date.now() + n * 86400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function useClose(s: ActionState, close?: () => void) {
  useEffect(() => { if (s.ok && close) { const t = setTimeout(close, 900); return () => clearTimeout(t); } }, [s, close]);
}

function StartForm({ people, templates, close }: { people: Opt[]; templates: (Opt & { defaultOn: boolean })[]; close: () => void }) {
  const [s, action, pending] = useActionState(startOnboarding, {} as ActionState);
  useClose(s, close);
  return (
    <form action={action} className="i9-stack" style={{ gap: 16 }}>
      <fieldset className="ob-pick">
        <legend className="hr-section-label">Who</legend>
        {people.length ? people.map((p) => <label key={p.id} className="i9-check"><input type="checkbox" name="personId" value={p.id} /> {p.name}</label>) : <p className="muted">Everyone with a login already has onboarding started.</p>}
      </fieldset>
      <fieldset className="ob-pick">
        <legend className="hr-section-label">Company documents to sign</legend>
        {templates.length ? templates.map((t) => <label key={t.id} className="i9-check"><input type="checkbox" name="templateId" value={t.id} defaultChecked={t.defaultOn} /> {t.name}</label>) : <p className="muted i9-small">None uploaded yet. Add them under &ldquo;Company documents&rdquo;. You can also add a personal offer letter on each person&apos;s page.</p>}
      </fieldset>
      <label className="field" style={{ maxWidth: 260 }}>Finish by<input type="date" name="due" defaultValue={inDays(7)} required /></label>
      <label className="i9-check"><input type="checkbox" name="notify" defaultChecked /> Email them the welcome / instructions now (from hr@)</label>
      <p className="muted i9-small">They complete: Personal Information form, Form W-4, Direct Deposit Agreement, document uploads (SSN, DL, void check, I-94, passport, visa/EAD, certificates) and the documents above. Form I-9 stays separate (start it from their profile).</p>
      <Status s={s} />
      <div className="hr-modal-actions">
        <button type="button" className="btn btn-outline hr-btn-sm" onClick={close}>Cancel</button>
        <button className="btn btn-primary hr-btn-sm" disabled={pending || !people.length}>{pending ? "Starting…" : "Start onboarding"}</button>
      </div>
    </form>
  );
}

export function StartButton(props: { people: Opt[]; templates: (Opt & { defaultOn: boolean })[] }) {
  return (
    <ModalButton label={<><span aria-hidden="true">＋</span> Start onboarding</>} title="Start onboarding" wide>
      {(close) => <StartForm {...props} close={close} />}
    </ModalButton>
  );
}

/** Upload a PDF either as a company document (template) or as a one-off for a person. */
function PdfUpload({ personId, close }: { personId?: string; close: () => void }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [def, setDef] = useState(true);
  const [notify, setNotify] = useState(true);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setErr("");
    const f = file.current?.files?.[0];
    if (!f) return setErr("Choose a PDF.");
    if (!title.trim()) return setErr("Enter a title.");
    if (f.size > 15 * 1024 * 1024) return setErr("The PDF is over 15 MB.");
    setBusy(true);
    try {
      const up = personId ? await getPersonDocUploadUrl(personId, f.name) : await getTemplateUploadUrl(f.name);
      if ("error" in up && up.error) return setErr(up.error);
      const res = await fetch(up.url!, { method: "PUT", body: f, headers: { "content-type": "application/pdf" } });
      if (!res.ok) return setErr("Upload failed. Try again.");
      const r = personId ? await addPersonDoc(personId, up.path!, title, notify) : await saveTemplate(up.path!, title, desc, def);
      if ("error" in r && r.error) return setErr(r.error);
      router.refresh();
      close();
    } finally { setBusy(false); }
  }
  return (
    <div className="i9-stack" style={{ gap: 14 }}>
      <label className="field">Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={personId ? "e.g. Employment Offer Letter" : "e.g. Employee Handbook acknowledgment"} /></label>
      {!personId && <label className="field">Description <span className="field-hint">(optional)</span><input value={desc} onChange={(e) => setDesc(e.target.value)} /></label>}
      <label className="field">PDF<input ref={file} type="file" accept="application/pdf" /></label>
      {personId
        ? <label className="i9-check"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email them that it&apos;s ready to sign</label>
        : <label className="i9-check"><input type="checkbox" checked={def} onChange={(e) => setDef(e.target.checked)} /> Include for new hires by default</label>}
      <p className="muted i9-small">They read it in the portal and sign by typing their name. A signature certificate page is added to the signed PDF.{personId ? "" : " Don't upload anything that shows bill rates: consultants see this document."}</p>
      {err && <p className="form-status err">{err}</p>}
      <div className="hr-modal-actions">
        <button type="button" className="btn btn-outline hr-btn-sm" onClick={close}>Cancel</button>
        <button type="button" className="btn btn-primary hr-btn-sm" disabled={busy} onClick={go}>{busy ? "Uploading…" : "Upload"}</button>
      </div>
    </div>
  );
}

export function AddTemplateButton() {
  return <ModalButton label="＋ Add company document" title="Add a company document to sign" className="btn btn-outline hr-btn-sm">{(close) => <PdfUpload close={close} />}</ModalButton>;
}
export function AddPersonDocButton({ personId }: { personId: string }) {
  return <ModalButton label="＋ Upload a document to sign" title="Document for this person (e.g. offer letter)" className="btn btn-outline hr-btn-sm">{(close) => <PdfUpload personId={personId} close={close} />}</ModalButton>;
}

export function TemplateToggle({ id, field, value, label }: { id: string; field: "active" | "default_for_new"; value: boolean; label: string }) {
  const [, action, pending] = useActionState(setTemplate, {} as ActionState);
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="field" value={field} /><input type="hidden" name="value" value={value ? "false" : "true"} />
      <button className="hr-link" disabled={pending}>{label}</button>
    </form>
  );
}

export function RequestTemplate({ personId, templates }: { personId: string; templates: Opt[] }) {
  const [s, action, pending] = useActionState(requestTemplateFor, {} as ActionState);
  if (!templates.length) return null;
  return (
    <form action={action} className="btn-row" style={{ alignItems: "center" }}>
      <input type="hidden" name="personId" value={personId} />
      <select name="templateId" defaultValue="" style={{ height: 36, borderRadius: 8, border: "1px solid #d1d5db", padding: "0 8px" }}>
        <option value="" disabled>Add a company document…</option>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button className="btn btn-outline hr-btn-sm" disabled={pending}>Add</button>
      <Status s={s} />
    </form>
  );
}

export function CancelSig({ id, title }: { id: string; title: string }) {
  return <ConfirmAction action={cancelSignature} fields={{ id }} label="Remove" className="hr-link danger" title="Remove this document?" message={<>Remove <strong>{title}</strong> from their list? They won&apos;t need to sign it.</>} confirmLabel="Yes, remove" />;
}

export function ReturnButton({ personId }: { personId: string }) {
  return (
    <ModalButton label="Send something back" title="Ask them to fix something" className="btn btn-outline hr-btn-sm">
      {(close) => <ReturnForm personId={personId} close={close} />}
    </ModalButton>
  );
}
function ReturnForm({ personId, close }: { personId: string; close: () => void }) {
  const [s, action, pending] = useActionState(returnItems, {} as ActionState);
  useClose(s, close);
  return (
    <form action={action} className="i9-stack" style={{ gap: 14 }}>
      <input type="hidden" name="personId" value={personId} />
      <fieldset className="ob-pick">
        <legend className="hr-section-label">What needs fixing</legend>
        {[["personal", "Personal Information form"], ["w4", "Form W-4"], ["deposit", "Direct deposit"], ["documents", "Documents"]].map(([v, l]) => <label key={v} className="i9-check"><input type="checkbox" name="item" value={v} /> {l}</label>)}
      </fieldset>
      <label className="field">Message to them<textarea name="note" rows={3} placeholder="e.g. Your driver's license photo is blurry. Please upload a clearer one." required /></label>
      <Status s={s} />
      <div className="hr-modal-actions">
        <button type="button" className="btn btn-outline hr-btn-sm" onClick={close}>Cancel</button>
        <button className="btn btn-primary hr-btn-sm" disabled={pending}>{pending ? "Sending…" : "Send back"}</button>
      </div>
    </form>
  );
}

export function DueForm({ personId, due }: { personId: string; due: string }) {
  const [s, action, pending] = useActionState(setDue, {} as ActionState);
  return (
    <form action={action} className="btn-row" style={{ alignItems: "flex-end" }}>
      <input type="hidden" name="personId" value={personId} />
      <label className="field" style={{ maxWidth: 220 }}>Finish by<input type="date" name="due" defaultValue={due} /></label>
      <button className="btn btn-outline hr-btn-sm" disabled={pending}>Save</button>
      <Status s={s} />
    </form>
  );
}

export function ResendButton({ personId }: { personId: string }) {
  const [s, action, pending] = useActionState(resendInvite, {} as ActionState);
  return (
    <form action={action} style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <input type="hidden" name="personId" value={personId} />
      <button className="btn btn-outline hr-btn-sm" disabled={pending}>{pending ? "Sending…" : "Email instructions again"}</button>
      <Status s={s} />
    </form>
  );
}
