"use client";

import { useActionState } from "react";
import { acknowledge, type AckState } from "./actions";

export default function AckButton({ token, done }: { token: string; done: boolean }) {
  const [s, action, pending] = useActionState(acknowledge, (done ? { ok: true } : {}) as AckState);
  if (s.ok) {
    return (
      <div className="ack-done" role="status">
        <strong>✓ Thank you, you&apos;ve acknowledged.</strong>
        <span>Watch for your portal login email from hr@stagitysolutions.com. You can close this page.</span>
      </div>
    );
  }
  return (
    <form action={action} className="i9-stack" style={{ gap: 10 }}>
      <input type="hidden" name="token" value={token} />
      <label className="i9-check"><input type="checkbox" required /> I have read and understood the new timesheet process.</label>
      {s.error && <p className="form-status err" role="alert">{s.error}</p>}
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Saving…" : "I acknowledge"}</button>
    </form>
  );
}
