"use client";

import { useActionState, useState } from "react";
import { completeSection2, type ActionState } from "../../actions";
import { listADocs, listBDocs, listCDocs } from "@/lib/i9/forms";

function DocFields({ prefix, label, options, defaultTitle, required }: {
  prefix: string; label: string; options: string[]; defaultTitle?: string; required?: boolean;
}) {
  const [na, setNa] = useState(false);
  return (
    <fieldset className="i9-fieldset">
      <legend>{label}</legend>
      <label className="field">
        Document title
        <select name={`${prefix}_title`} defaultValue={defaultTitle ?? ""} required={required}>
          <option value="">{required ? "Choose…" : "— none —"}</option>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
      </label>
      <div className="form-grid">
        <label className="field">Issuing authority<input name={`${prefix}_authority`} /></label>
        <label className="field">Document number<input name={`${prefix}_number`} autoComplete="off" /></label>
        <label className="field">
          Expiration date
          <input name={`${prefix}_expires`} type="date" disabled={na} />
        </label>
      </div>
      <label className="i9-check">
        <input type="checkbox" name={`${prefix}_expires_na`} checked={na} onChange={(e) => setNa(e.target.checked)} />
        No expiration date (N/A)
      </label>
    </fieldset>
  );
}

export default function Section2Form({ id, firstDay, choice }: {
  id: string; firstDay: string; choice: { mode: "A" | "BC"; a: string; b: string; c: string };
}) {
  const [s, action, pending] = useActionState(completeSection2, {} as ActionState);
  const [mode, setMode] = useState<"A" | "BC">(choice.mode);
  if (s.ok) return <p className="form-status ok">{s.message}</p>;

  return (
    <form action={action} className="form-card">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="mode" value={mode} />
      <h2 className="i9-h3">Section 2: Employer review and verification</h2>

      <ol className="i9-steps">
        <li>Look at the uploaded copies above (front and back). Check they appear genuine and relate to the employee.</li>
        <li>Hold a <strong>live video call</strong> (Teams, Zoom or Meet). Ask the employee to show the <strong>same original documents</strong> on camera, front and back.</li>
        <li>Fill in the document details below and sign. Do this within 3 business days of the first day of work.</li>
      </ol>

      <div className="i9-tabs" role="radiogroup" aria-label="Documents presented">
        <button type="button" className={mode === "A" ? "on" : ""} onClick={() => setMode("A")}>List A</button>
        <button type="button" className={mode === "BC" ? "on" : ""} onClick={() => setMode("BC")}>List B + C</button>
      </div>

      {mode === "A" ? (
        <>
          <DocFields prefix="a1" label="List A document 1" options={listADocs} defaultTitle={choice.mode === "A" ? choice.a : ""} required />
          <details>
            <summary className="muted">Add List A documents 2 and 3 (only for document combinations, e.g. foreign passport + I-94)</summary>
            <DocFields prefix="a2" label="List A document 2" options={[...listADocs, "Form I-94/I-94A", "Form I-20", "Form DS-2019"]} />
            <DocFields prefix="a3" label="List A document 3" options={[...listADocs, "Form I-94/I-94A", "Form I-20", "Form DS-2019"]} />
          </details>
        </>
      ) : (
        <>
          <DocFields prefix="b" label="List B (identity)" options={listBDocs} defaultTitle={choice.mode === "BC" ? choice.b : ""} required />
          <DocFields prefix="c" label="List C (employment authorization)" options={listCDocs} defaultTitle={choice.mode === "BC" ? choice.c : ""} required />
        </>
      )}

      <div className="form-grid">
        <label className="field">First day of employment<input name="firstDay" type="date" defaultValue={firstDay} required /></label>
        <label className="field">Video call date and time<input name="videoCallAt" type="datetime-local" required /></label>
      </div>
      <label className="field">
        Additional information (optional)
        <textarea name="additionalInfo" rows={3} style={{ minHeight: 90 }} />
      </label>

      <label className="i9-check"><input type="checkbox" name="examinedLive" required />
        I examined the original documents during a live video interaction with the employee.</label>
      <label className="i9-check"><input type="checkbox" name="altProcedure" required />
        An alternative procedure authorized by DHS was used to examine documents (this box will be checked on the Form I-9).</label>
      <label className="i9-check"><input type="checkbox" name="copiesRetained" required />
        Clear copies of all documents, front and back, are uploaded and will be kept with this Form I-9.</label>

      <fieldset className="i9-fieldset">
        <legend>Employer or authorized representative</legend>
        <div className="form-grid">
          <label className="field">First name<input name="repFirstName" required /></label>
          <label className="field">Last name<input name="repLastName" required /></label>
          <label className="field">Title<input name="repTitle" required placeholder="HR Manager" /></label>
        </div>
        <label className="i9-check"><input type="checkbox" name="attest" required />
          I attest, under penalty of perjury, that (1) I have examined the documentation presented by the above-named
          employee, (2) the above-listed documentation appears to be genuine and to relate to the employee named, and
          (3) to the best of my knowledge, the employee is authorized to work in the United States.</label>
        <label className="field">
          Signature: type your full name (first and last)
          <input name="signature" required autoComplete="off" />
        </label>
      </fieldset>

      {s.error && <p className="form-status err" role="alert">{s.error}</p>}
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Signing…" : "Sign Section 2"}
      </button>
    </form>
  );
}
