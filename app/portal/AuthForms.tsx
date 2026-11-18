"use client";

import { useActionState } from "react";
import PasswordInput from "@/components/PasswordInput";
import { completePasswordReset, requestPasswordReset, setPassword, signIn, type FormState, type ResetState } from "./actions";

export function SignInForm() {
  const [s, action, pending] = useActionState(signIn, {} as FormState);
  return (
    <form action={action} className="form-card">
      <label className="field">Email<input id="employee-email" name="email" type="email" autoComplete="section-employee username" required /></label>
      <label className="field">Password<PasswordInput id="employee-password" name="password" autoComplete="section-employee current-password" required /></label>
      {s.error && <p className="form-status err" role="alert">{s.error}</p>}
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="i9-small"><a href="/portal/forgot">Forgot your password?</a></p>
    </form>
  );
}

export function SetPasswordForm() {
  const [s, action, pending] = useActionState(setPassword, {} as FormState);
  return (
    <form action={action} className="form-card">
      <label className="field">New password<PasswordInput name="password" autoComplete="new-password" required minLength={10} /></label>
      <label className="field">Confirm new password<PasswordInput name="confirm" autoComplete="new-password" required /></label>
      <p className="muted i9-small">At least 10 characters, with letters and a number.</p>
      {s.error && <p className="form-status err" role="alert">{s.error}</p>}
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>
        {pending ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, sendAction, sending] = useActionState(requestPasswordReset, { step: "email" } as ResetState);
  const [done, resetAction, resetting] = useActionState(completePasswordReset, { step: "code" } as ResetState);

  if (sent.step === "code") {
    return (
      <form action={resetAction} className="form-card">
        {sent.message && <p className="form-status ok">{sent.message}</p>}
        <input type="hidden" name="email" value={sent.email} />
        <label className="field">6-digit code<input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus /></label>
        <label className="field">New password<PasswordInput name="password" autoComplete="new-password" required minLength={10} /></label>
        <label className="field">Confirm new password<PasswordInput name="confirm" autoComplete="new-password" required /></label>
        <p className="muted i9-small">At least 10 characters, with letters and a number.</p>
        {done.error && <p className="form-status err" role="alert">{done.error}</p>}
        <button className="btn btn-primary" disabled={resetting} style={{ alignSelf: "flex-start" }}>{resetting ? "Saving…" : "Reset password"}</button>
        <p className="i9-small"><a href="/portal/forgot">Send a new code</a> · <a href="/portal/login">Back to sign in</a></p>
      </form>
    );
  }
  return (
    <form action={sendAction} className="form-card">
      <label className="field">Email you sign in with<input name="email" type="email" autoComplete="username" required /></label>
      {sent.error && <p className="form-status err" role="alert">{sent.error}</p>}
      <button className="btn btn-primary" disabled={sending} style={{ alignSelf: "flex-start" }}>{sending ? "Sending…" : "Email me a code"}</button>
      <p className="i9-small"><a href="/portal/login">Back to sign in</a></p>
    </form>
  );
}
