"use client";

import { useState, useTransition } from "react";
import { getUploadUrl, recordUpload, submitSection1 } from "../actions";
import { citizenshipOptions, listADocs, listBDocs, listCDocs, usStates } from "@/lib/i9/forms";

type Uploaded = Record<string, string>; // key `${list}-${side}` -> file name

/** Shrinks large photos to a JPEG under ~2400px so uploads are quick on phones. */
async function prepare(file: File): Promise<{ blob: Blob; mime: string }> {
  if (!file.type.startsWith("image/") || file.type === "image/heic" || file.type === "image/heif") {
    return { blob: file, mime: file.type || "application/octet-stream" };
  }
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.88));
    return blob ? { blob, mime: "image/jpeg" } : { blob: file, mime: file.type };
  } catch {
    return { blob: file, mime: file.type };
  }
}

function UploadSlot({ token, list, side, label, uploaded, onDone }: {
  token: string; list: "A" | "B" | "C"; side: "front" | "back"; label: string; uploaded?: string; onDone: (name: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setError("That file is over 10 MB. Try a smaller photo.");
    setBusy(true);
    setError("");
    try {
      const { blob, mime } = await prepare(file);
      const up = await getUploadUrl(token, list, side, mime);
      if ("error" in up && up.error) throw new Error(up.error);
      const res = await fetch(up.url!, { method: "PUT", body: blob, headers: { "content-type": mime, "x-upsert": "false" } });
      if (!res.ok) throw new Error("Upload failed. Please try again.");
      const rec = await recordUpload(token, up.path!, list, side, mime, file.name);
      if ("error" in rec && rec.error) throw new Error(rec.error);
      onDone(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`i9-upload ${uploaded ? "done" : ""}`}>
      <div>
        <strong>{label}</strong>
        <div className="muted i9-small">{busy ? "Uploading…" : uploaded ? `✓ ${uploaded}` : side === "back" ? "Optional if the back is blank" : "Required"}</div>
        {error && <div className="i9-small" style={{ color: "#b91c1c" }}>{error}</div>}
      </div>
      <label className="btn btn-outline">
        {uploaded ? "Replace" : "Upload"}
        <input type="file" accept="image/*,application/pdf" onChange={onChange} disabled={busy} hidden />
      </label>
    </div>
  );
}

export default function Section1Form({ token, firstName, lastName, email }: {
  token: string; firstName: string; lastName: string; email: string;
}) {
  const [f, setF] = useState<Record<string, string | boolean>>({
    firstName, lastName, email, middleInitial: "", otherLastNames: "", address: "", apt: "", city: "", state: "TX", zip: "",
    dob: "", ssn: "", phone: "", status: "", lprNumber: "", workAuthExpires: "", workAuthNA: false, alienIdType: "",
    alienUscisNumber: "", i94Number: "", foreignPassportNumber: "", passportCountry: "", signature: "", attest: false, noPreparer: false,
  });
  const [mode, setMode] = useState<"A" | "BC">("A");
  const [docs, setDocs] = useState({ a: "", b: "", c: "" });
  const [uploaded, setUploaded] = useState<Uploaded>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const v = (k: string) => String(f[k] ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const res = await submitSection1(token, { ...f, docChoice: { mode, ...docs } });
      if ("error" in res && res.error) {
        setError(res.error);
        return;
      }
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  if (done) {
    return (
      <div className="form-card" role="status">
        <h2 className="i9-h3">Thank you, Section 1 is complete</h2>
        <p className="text">
          HR will contact you to schedule a short live video call. On the call you&apos;ll show the same original documents you
          uploaded, front and back. Please keep them with you.
        </p>
      </div>
    );
  }

  const slot = (list: "A" | "B" | "C", side: "front" | "back", label: string) => (
    <UploadSlot token={token} list={list} side={side} label={label} uploaded={uploaded[`${list}-${side}`]}
      onDone={(name) => setUploaded((u) => ({ ...u, [`${list}-${side}`]: name }))} />
  );

  return (
    <form onSubmit={submit} className="i9-stack" style={{ gap: 28 }}>
      <section className="form-card">
        <h2 className="i9-h3">1. Your information</h2>
        <p className="muted i9-small">Use your legal name. Don&apos;t include nicknames.</p>
        <div className="form-grid">
          <label className="field">Last name (family name)<input value={v("lastName")} onChange={set("lastName")} required autoComplete="family-name" /></label>
          <label className="field">First name (given name)<input value={v("firstName")} onChange={set("firstName")} required autoComplete="given-name" /></label>
          <label className="field">Middle initial (if any)<input value={v("middleInitial")} onChange={set("middleInitial")} maxLength={1} /></label>
          <label className="field">Other last names used (if any)<input value={v("otherLastNames")} onChange={set("otherLastNames")} /></label>
        </div>
        <div className="form-grid">
          <label className="field">Street address<input value={v("address")} onChange={set("address")} required autoComplete="address-line1" /></label>
          <label className="field">Apt. number (if any)<input value={v("apt")} onChange={set("apt")} autoComplete="address-line2" /></label>
          <label className="field">City or town<input value={v("city")} onChange={set("city")} required autoComplete="address-level2" /></label>
          <label className="field">State
            <select value={v("state")} onChange={set("state")} required>{usStates.map((s) => <option key={s}>{s}</option>)}</select>
          </label>
          <label className="field">ZIP code<input value={v("zip")} onChange={set("zip")} required inputMode="numeric" autoComplete="postal-code" /></label>
        </div>
        <div className="form-grid">
          <label className="field">Date of birth<input type="date" value={v("dob")} onChange={set("dob")} required /></label>
          <label className="field">U.S. Social Security number<input value={v("ssn")} onChange={set("ssn")} required inputMode="numeric" autoComplete="off" placeholder="123-45-6789" /></label>
          <label className="field">Email address<input type="email" value={v("email")} onChange={set("email")} autoComplete="email" /></label>
          <label className="field">Telephone number<input type="tel" value={v("phone")} onChange={set("phone")} autoComplete="tel" /></label>
        </div>
        <p className="muted i9-small">Stagity Solutions participates in E-Verify, so a Social Security number is required.</p>
      </section>

      <section className="form-card">
        <h2 className="i9-h3">2. Citizenship or immigration status</h2>
        <p className="muted i9-small">I am aware that federal law provides for imprisonment and/or fines for false statements, or the use of false documents, in connection with the completion of this form. I attest, under penalty of perjury, that this information is true and correct, and that I am (check one):</p>
        {citizenshipOptions.map((o) => (
          <label key={o.value} className="i9-check">
            <input type="radio" name="status" value={o.value} checked={f.status === o.value} onChange={set("status")} required />
            {o.label}
          </label>
        ))}
        {f.status === "lpr" && (
          <label className="field">USCIS number or A-Number<input value={v("lprNumber")} onChange={set("lprNumber")} required /></label>
        )}
        {f.status === "authorized_alien" && (
          <div className="i9-stack">
            <div className="form-grid">
              <label className="field">Work authorization expires<input type="date" value={v("workAuthExpires")} onChange={set("workAuthExpires")} disabled={!!f.workAuthNA} /></label>
            </div>
            <label className="i9-check"><input type="checkbox" checked={!!f.workAuthNA} onChange={set("workAuthNA")} /> No expiration date (N/A)</label>
            <label className="field">Provide one of these
              <select value={v("alienIdType")} onChange={set("alienIdType")} required>
                <option value="">Choose…</option>
                <option value="uscis">USCIS number or A-Number</option>
                <option value="i94">Form I-94 admission number</option>
                <option value="passport">Foreign passport number and country</option>
              </select>
            </label>
            {f.alienIdType === "uscis" && <label className="field">USCIS number or A-Number<input value={v("alienUscisNumber")} onChange={set("alienUscisNumber")} required /></label>}
            {f.alienIdType === "i94" && <label className="field">Form I-94 admission number<input value={v("i94Number")} onChange={set("i94Number")} required /></label>}
            {f.alienIdType === "passport" && (
              <div className="form-grid">
                <label className="field">Foreign passport number<input value={v("foreignPassportNumber")} onChange={set("foreignPassportNumber")} required /></label>
                <label className="field">Country of issuance<input value={v("passportCountry")} onChange={set("passportCountry")} required /></label>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="form-card">
        <h2 className="i9-h3">3. Your documents</h2>
        <p className="muted i9-small">
          Provide <strong>one document from List A</strong>, or <strong>one from List B and one from List C</strong>. You choose which
          acceptable documents to provide. Documents must be unexpired originals. Take clear, well-lit photos of the front and back.
          Because we use E-Verify, a List B document must have a photo.
        </p>
        <div className="i9-tabs" role="radiogroup">
          <button type="button" className={mode === "A" ? "on" : ""} onClick={() => setMode("A")}>List A</button>
          <button type="button" className={mode === "BC" ? "on" : ""} onClick={() => setMode("BC")}>List B + C</button>
        </div>
        {mode === "A" ? (
          <>
            <label className="field">List A document
              <select value={docs.a} onChange={(e) => setDocs({ ...docs, a: e.target.value })} required>
                <option value="">Choose…</option>{listADocs.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            {slot("A", "front", "Front")}
            {slot("A", "back", "Back")}
          </>
        ) : (
          <>
            <label className="field">List B document (identity)
              <select value={docs.b} onChange={(e) => setDocs({ ...docs, b: e.target.value })} required>
                <option value="">Choose…</option>{listBDocs.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            {slot("B", "front", "List B: front")}
            {slot("B", "back", "List B: back")}
            <label className="field">List C document (employment authorization)
              <select value={docs.c} onChange={(e) => setDocs({ ...docs, c: e.target.value })} required>
                <option value="">Choose…</option>{listCDocs.map((d) => <option key={d}>{d}</option>)}
              </select>
            </label>
            {slot("C", "front", "List C: front")}
            {slot("C", "back", "List C: back")}
          </>
        )}
      </section>

      <section className="form-card">
        <h2 className="i9-h3">4. Sign</h2>
        <label className="i9-check"><input type="checkbox" checked={!!f.noPreparer} onChange={set("noPreparer")} />
          I completed Section 1 myself. No preparer or translator helped me. (If someone is helping you, contact HR first.)</label>
        <label className="i9-check"><input type="checkbox" checked={!!f.attest} onChange={set("attest")} />
          I attest, under penalty of perjury, that the information I have provided is true and correct, and I understand that
          typing my name below is my electronic signature on Form I-9.</label>
        <label className="field">
          Signature: type &quot;{v("firstName")} {v("lastName")}&quot;
          <input value={v("signature")} onChange={set("signature")} required autoComplete="off" />
        </label>
        <p className="muted i9-small">Today&apos;s date will be recorded with your signature.</p>
        {error && <p className="form-status err" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
          {pending ? "Submitting…" : "Sign and submit Section 1"}
        </button>
      </section>
    </form>
  );
}
