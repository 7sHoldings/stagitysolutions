import { redirect } from "next/navigation";
import { hrSession } from "@/lib/i9/server";
import LoginForm from "./LoginForm";

export default async function HrLogin() {
  if (await hrSession()) redirect("/hr");
  return (
    <section className="container hero" style={{ maxWidth: 560 }}>
      <p className="eyebrow">HR portal</p>
      <h1 className="h2">Sign in</h1>
      <LoginForm />
    </section>
  );
}
