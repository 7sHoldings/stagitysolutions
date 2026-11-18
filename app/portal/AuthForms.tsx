"use client";

import { useActionState } from "react";
import { setPassword, signIn, type FormState } from "./actions";

export function SignInForm() {
  const [s, action, pending] = useActionState(signIn, {} as FormState);
  return (
    <form action={action} className="form-card">
      <label className="field">Email<input name="email" type="email" autoComplete="username" required /></label>
      <label className="field">Password<input name="password" type="password" autoComplete="current-password" required /></label>
      {s.error && <p className="form-status err" role="alert">{s.error}</p>}
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="muted i9-small">Forgot your password? Email hr@stagitysolutions.com and HR will send you a new temporary password.</p>
    </form>
  );
}

export function SetPasswordForm() {
  const [s, action, pending] = useActionState(setPassword, {} as FormState);
  return (
    <form action={action} className="form-card">
      <label className="field">New password<input name="password" type="password" autoComplete="new-password" required minLength={10} /></label>
      <label className="field">Confirm new password<input name="confirm" type="password" autoComplete="new-password" required /></label>
      <p className="muted i9-small">At least 10 characters, with letters and a number.</p>
      {s.error && <p className="form-status err" role="alert">{s.error}</p>}
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}
