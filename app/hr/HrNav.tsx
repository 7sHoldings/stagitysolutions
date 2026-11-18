import Link from "next/link";
import { signOut } from "./login/actions";

const tabs = [
  { href: "/hr", label: "Overview" },
  { href: "/hr/people", label: "People" },
  { href: "/hr/timesheets", label: "Timesheets" },
  { href: "/hr/payroll", label: "Payroll" },
  { href: "/hr/i9", label: "Form I-9" },
];

export default function HrNav({ active, email }: { active: string; email: string }) {
  return (
    <div className="i9-stack no-print" style={{ gap: 18 }}>
      <div className="hero-row" style={{ alignItems: "center" }}>
        <p className="eyebrow">Stagity HR portal</p>
        <form action={signOut} className="i9-signout">
          <span className="muted">{email}</span>
          <button className="btn btn-outline" style={{ minHeight: 40, padding: "8px 18px" }}>Sign out</button>
        </form>
      </div>
      <nav className="i9-nav" aria-label="HR sections">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={active === t.href ? "on" : ""}>{t.label}</Link>
        ))}
      </nav>
    </div>
  );
}
