import { ForgotPasswordForm } from "../AuthForms";

export default function ForgotPassword() {
  return (
    <section className="container hero" style={{ maxWidth: 560 }}>
      <p className="eyebrow">Employee portal</p>
      <h1 className="h2">Reset your password</h1>
      <p className="lead">Enter the email you sign in with. We&apos;ll email you a code to choose a new password.</p>
      <ForgotPasswordForm />
    </section>
  );
}
