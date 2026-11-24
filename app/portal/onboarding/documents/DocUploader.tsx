"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getDocUploadUrl, recordDoc, removeDoc } from "../actions";

type F = { id: string; name: string; expires: string | null };
const EXPIRING = new Set(["passport", "visa", "ead", "i94", "green_card", "drivers_license"]);

/** One document type: upload one or more files (photo or PDF), with an expiry date for IDs and work documents. */
export default function DocUploader({ kind, label, required, files }: { kind: string; label: string; required: boolean; files: F[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [expires, setExpires] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const needsExpiry = EXPIRING.has(kind);

  async function upload(file: File) {
    setErr("");
    if (file.size > 15 * 1024 * 1024) return setErr("That file is over 15 MB. Please use a smaller photo or PDF.");
    const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    setBusy(true);
    try {
      const up = await getDocUploadUrl(kind, mime);
      if ("error" in up && up.error) return setErr(up.error);
      const res = await fetch(up.url!, { method: "PUT", body: file, headers: { "content-type": mime } });
      if (!res.ok) return setErr("The upload failed. Please try again.");
      const rec = await recordDoc(kind, up.path!, mime, file.name, expires);
      if ("error" in rec && rec.error) return setErr(rec.error);
      start(() => router.refresh());
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className={`ob-doc-row ${required && !files.length ? "missing" : ""}`}>
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        <strong>{label} {required ? null : <span className="field-hint">(if you have it)</span>}</strong>
        {files.length > 0 && (
          <div className="ob-files">
            {files.map((f) => (
              <span key={f.id} className="ob-file">
                ✓ {f.name.length > 28 ? `${f.name.slice(0, 25)}…` : f.name}{f.expires ? ` · exp ${f.expires}` : ""}
                <button type="button" className="hr-link danger" onClick={async () => { await removeDoc(f.id); router.refresh(); }} aria-label={`Remove ${f.name}`}>✕</button>
              </span>
            ))}
          </div>
        )}
        {err && <span className="i9-small" style={{ color: "#b91c1c" }}>{err}</span>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {needsExpiry && (
          <label className="i9-small muted" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Expires<input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} style={{ height: 36, borderRadius: 8, border: "1px solid #d1d5db", padding: "0 8px" }} />
          </label>
        )}
        <input ref={input} type="file" accept="image/*,application/pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <button type="button" className={`btn hr-btn-sm ${files.length ? "btn-outline" : "btn-primary"}`} disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Uploading…" : files.length ? "Add another" : "Upload"}
        </button>
      </div>
    </div>
  );
}
