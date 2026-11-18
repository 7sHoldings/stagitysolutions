"use client";

import { useActionState, useState } from "react";
import PasswordInput from "@/components/PasswordInput";
import { requestCode, signInWithPassword, verifyCode, type LoginState, type PasswordState } from "./actions";

/** Admin sign-in: email + password. "Set or reset password" uses a one-time email code. */
export default function LoginForm() {
  const [mode, setMode] = useState<"password" | "reset">("password");
  return mode === "password" ? <PasswordForm onReset={() => setMode("reset")} /> : <ResetForm onBack={() => setMode("password")} />;
}

function PasswordForm({ onReset }: { onReset: () => void }) {
  const [s, action, pending] = useActionState(signInWithPassword, {} as PasswordState);
  return (
    <form action={action} className="form-card">
      <label className="field">Admin email<input name="email" type="email" autoComplete="username" required placeholder="hr@stagitysolutions.com" /></label>
      <label className="field">Password<PasswordInput name="password" autoComplete="current-password" required /></label>
      {s.error && <p className="form-status err" role="alert">{s.error}</p>}
      <button className="btn btn-primary" disabled={pending} style={{ alignSelf: "flex-start" }}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="i9-small">
        <button type="button" className="hr-link" style={{ padding: 0 }} onClick={onReset}>
          {s.needsSetup ? "Set your password with an email code →" : "First time here, or forgot your password?"}
        </button>
      </p>
    </form>
  );
}

function ResetForm({ onBack }: { onBack: () => void }) {
  const [sent, sendAction, sending] = useActionState(requestCode, { step: "email" } as LoginState);
  const [checked, verifyAction, verifying] = useActionState(verifyCode, { step: "code" } as LoginState);

  if (sent.step === "code") {
    return (
      <form action={verifyAction} className="form-card">
        {sent.message && <p className="form-status ok">{sent.message}</p>}
        <input type="hidden" name="email" value={sent.email} />
        <label className="field">6-digit code<input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus /></label>
        <label className="field">New password<PasswordInput name="password" autoComplete="new-password" required minLength={10} /></label>
        <label className="field">Confirm new password<PasswordInput name="confirm" autoComplete="new-password" required /></label>
        <p className="muted i9-small">At least 10 characters, with letters and a number. You&apos;ll use this password to sign in from now on.</p>
        {checked.error && <p className="form-status err" role="alert">{checked.error}</p>}
        <button className="btn btn-primary" disabled={verifying} style={{ alignSelf: "flex-start" }}>{verifying ? "Saving…" : "Save password & sign in"}</button>
        <p className="i9-small"><button type="button" className="hr-link" style={{ padding: 0 }} onClick={onBack}>← Back to sign in</button></p>
      </form>
    );
  }

  return (
    <form action={sendAction} className="form-card">
      <p className="text">We&apos;ll email you a one-time code so you can set a new password.</p>
      <label className="field">Admin email<input name="email" type="email" autoComplete="email" required placeholder="hr@stagitysolutions.com" /></label>
      {sent.error && <p className="form-status err" role="alert">{sent.error}</p>}
      <button className="btn btn-primary" disabled={sending} style={{ alignSelf: "flex-start" }}>{sending ? "Sending…" : "Email me a code"}</button>
      <p className="i9-small"><button type="button" className="hr-link" style={{ padding: 0 }} onClick={onBack}>← Back to sign in</button></p>
    </form>
  );
}
