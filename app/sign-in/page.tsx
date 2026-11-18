import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to the Stagity Solutions employee portal or admin portal.",
  robots: { index: false, follow: true },
  alternates: { canonical: "/sign-in" },
};

export default function SignIn() {
  return (
    <section className="container hero" style={{ maxWidth: 920 }}>
      <p className="eyebrow">Sign in</p>
      <h1 className="h2">Who&apos;s signing in?</h1>
      <div className="signin-grid">
        <Link href="/portal/login" className="signin-card">
          <span className="icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
          </span>
          <h2>Employee sign in</h2>
          <p className="text">For consultants and employees: submit timesheets, upload approved timesheets and complete your Form I-9.</p>
          <p className="muted" style={{ fontSize: 14 }}>Your account is created by Stagity HR. Check your email for your login details.</p>
          <span className="go">Continue →</span>
        </Link>
        <Link href="/hr/login" className="signin-card admin">
          <span className="icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
          </span>
          <h2>Admin sign in</h2>
          <p className="text">For Stagity HR and accounts: people, timesheets, invoices, payroll and Form I-9.</p>
          <p className="muted" style={{ fontSize: 14 }}>Authorized administrators only.</p>
          <span className="go">Continue →</span>
        </Link>
      </div>
    </section>
  );
}
