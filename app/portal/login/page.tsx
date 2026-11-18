import { redirect } from "next/navigation";
import { portalPerson } from "@/lib/portal/server";
import { SignInForm } from "../AuthForms";

export default async function PortalLogin() {
  const p = await portalPerson().catch(() => null);
  if (p) redirect(p.must_change_password ? "/portal/set-password" : "/portal");
  return (
    <section className="container hero" style={{ maxWidth: 560 }}>
      <p className="eyebrow">Employee portal</p>
      <h1 className="h2">Sign in</h1>
      <SignInForm />
    </section>
  );
}
