import { redirect } from "next/navigation";
import { portalPerson } from "@/lib/portal/server";
import { SetPasswordForm } from "../AuthForms";

export default async function SetPassword() {
  const p = await portalPerson();
  if (!p) redirect("/portal/login");
  return (
    <section className="container hero" style={{ maxWidth: 560 }}>
      <p className="eyebrow">Employee portal</p>
      <h1 className="h2">{p.must_change_password ? `Welcome, ${p.first_name}. Choose your password` : "Change your password"}</h1>
      <SetPasswordForm />
    </section>
  );
}
