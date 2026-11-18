"use client";

import { useActionState } from "react";
import { requestCode, verifyCode, type LoginState } from "./actions";

export default function LoginForm() {
  const [sent, sendAction, sending] = useActionState(requestCode, { step: "email" } as LoginState);
  const [checked, verifyAction, verifying] = useActionState(verifyCode, { step: "code" } as LoginState);

  if (sent.step === "code") {
    return (
      <form action={verifyAction} className="form-card">
        {sent.message && <p className="form-status ok">{sent.message}</p>}
        <input type="hidden" name="email" value={sent.email} />
        <label className="field">
          6-digit code
          <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
        </label>
        {checked.error && <p className="form-status err" role="alert">{checked.error}</p>}
        <button className="btn btn-primary" disabled={verifying} style={{ alignSelf: "flex-start" }}>
          {verifying ? "Checking…" : "Sign in"}
        </button>
      </form>
    );
  }

  return (
    <form action={sendAction} className="form-card">
      <label className="field">
        HR email
        <input name="email" type="email" autoComplete="email" required placeholder="hr@stagitysolutions.com" />
      </label>
      {sent.error && <p className="form-status err" role="alert">{sent.error}</p>}
      <button className="btn btn-primary" disabled={sending} style={{ alignSelf: "flex-start" }}>
        {sending ? "Sending…" : "Email me a code"}
      </button>
    </form>
  );
}
