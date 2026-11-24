import Link from "next/link";
import { signOut } from "./login/actions";

const tabs = [
  { href: "/hr", label: "Overview" },
  { href: "/hr/people", label: "People" },
  { href: "/hr/onboarding", label: "Onboarding" },
  { href: "/hr/vendors", label: "Vendors" },
  { href: "/hr/timesheets", label: "Timesheets" },
  { href: "/hr/invoices", label: "Invoices" },
  { href: "/hr/payments", label: "Payments" },
  { href: "/hr/payroll", label: "Payroll" },
  { href: "/hr/i9", label: "Form I-9" },
  { href: "/hr/announce", label: "Announcements" },
];

export default function HrNav({ active, email }: { active: string; email: string }) {
  return (
    <div className="hr-bar no-print">
      <nav className="hr-tabs" aria-label="Admin sections">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={active === t.href ? "on" : ""} aria-current={active === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <form action={signOut} className="hr-user">
        <span className="muted i9-small">{email}</span>
        <button className="btn btn-outline hr-btn-sm">Sign out</button>
      </form>
    </div>
  );
}
